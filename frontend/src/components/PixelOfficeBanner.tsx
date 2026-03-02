"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Agent, AgentRole } from "@/lib/types";
import CommandBar from "@/components/CommandBar";

interface PixelOfficeBannerProps {
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
  agentNotifications?: Record<string, { count: number }>;
  onSubmit?: (message: string) => void;
  hasTasks?: boolean;
}

/* ── Sprite-sheet constants ─────────────────────────────────────── */
const FRAME = 32;           // px per frame in the sprite sheet
const FRAMES_PER_DIR = 6;
const DIR_DOWN = 0, DIR_RIGHT = 1, DIR_UP = 2, DIR_LEFT = 3;
const ANIM_SPEED = 8;       // ticks per frame advance
const TYPING_SPEED = 24;    // ticks per frame for typing bob (3x slower)
const WALK_SPEED = 1.2;     // pixels per frame of movement
const ARRIVAL_THRESHOLD = 2; // snap when within this many px

/* ── Canvas / tile-map ──────────────────────────────────────────── */
const CANVAS_W = 960;
const CANVAS_H = 260;
const TILE = 32;
const COLS = 30;
const ROWS = 9;
const ZOOM = 1.3;
// Camera centers on the content area
const FOCUS_X = 14 * TILE;
const FOCUS_Y = 5 * TILE;
const CAM_X = FOCUS_X - (CANVAS_W / ZOOM) / 2;
const CAM_Y = FOCUS_Y - (CANVAS_H / ZOOM) / 2;

/* ── Agent appearance keyed by agent ID ─────────────────────────── */
interface AgentAppearance {
  outfit: string;
  skinRow: number;
  hairRow: number;
}

const AGENT_APPEARANCE: Record<string, AgentAppearance> = {
  "agent-boss": { outfit: "Outfit5", skinRow: 1, hairRow: 0 },
  "agent-pm": { outfit: "Outfit2", skinRow: 0, hairRow: 1 },
  "agent-sm": { outfit: "Outfit3", skinRow: 2, hairRow: 2 },
  "agent-dev": { outfit: "Outfit1", skinRow: 0, hairRow: 3 },
  "agent-dev2": { outfit: "Outfit1", skinRow: 1, hairRow: 4 },
  "agent-qa": { outfit: "Outfit4", skinRow: 1, hairRow: 5 },
  "agent-cr": { outfit: "Outfit6", skinRow: 2, hairRow: 6 },
};

/* ── Role → desk colour accent (for name labels) ───────────────── */
const ROLE_COLORS: Record<AgentRole, string> = {
  boss: "#F59E0B",
  pm: "#3B82F6",
  scrum_master: "#14B8A6",
  developer: "#22C55E",
  qa: "#F97316",
  code_reviewer: "#8B5CF6",
};

/* ── Desk positions keyed by agent ID ───────────────────────────── */
interface DeskSlot {
  id: string;        // agent ID
  col: number;       // left tile of 2-wide desk
  row: number;       // desk row
  deskImg: number;   // index into desk images 0-3
}

const DESK_SLOTS: DeskSlot[] = [
  // Main office desks (row 3)
  { id: "agent-pm", col: 4, row: 3, deskImg: 1 },
  { id: "agent-sm", col: 7, row: 3, deskImg: 2 },
  { id: "agent-dev", col: 10, row: 3, deskImg: 0 },
  { id: "agent-qa", col: 13, row: 3, deskImg: 3 },
  { id: "agent-cr", col: 16, row: 3, deskImg: 1 },
  { id: "agent-dev2", col: 19, row: 3, deskImg: 0 },
  // Chief corner desk (separate area)
  { id: "agent-boss", col: 23, row: 3, deskImg: 2 },
];

/* ── Waiting area positions (lounge row) ────────────────────────── */
const WAITING_ROW = 6;
const WAITING_POSITIONS: { x: number; y: number }[] = [
  { x: 4 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 7 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 10 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 13 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 16 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 19 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
  { x: 22 * TILE + TILE, y: WAITING_ROW * TILE + TILE },
];

/* ── Format agent names for badge labels ──────────────────────── */
function formatBadgeName(name: string): string {
  // Split camelCase (e.g. "ProjectManager" → "Project Manager")
  // Replace hyphens with spaces (e.g. "Developer-1" → "Developer 1")
  // Replace underscores with spaces
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ");
}

/* ── Chief partition column ─────────────────────────────────────── */
const BOSS_PARTITION_COL = 22;

/* ── Grayscale helper: returns an offscreen canvas copy ────────── */
function toGrayscale(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const c = off.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.drawImage(src, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  c.putImageData(img, 0, 0);
  return off;
}

/* ── Build tile map ───────────────────────────────────────────────  */
function buildMap(): number[][] {
  const m: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    m[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || c === 0 || c === COLS - 1) {
        m[r][c] = 1; // wall
      } else {
        m[r][c] = 0; // floor
      }
    }
  }
  return m;
}

/* ── Movement state machine ──────────────────────────────────────── */
type MovementState = "at_waiting" | "walking_to_desk" | "at_desk" | "walking_to_waiting";

/* ── Internal agent state ──────────────────────────────────────── */
interface InternalAgent {
  id: string;
  name: string;
  role: AgentRole;
  status: string;
  color: string;
  // position (pixel coords, center of sprite)
  x: number;
  y: number;
  dir: number;
  frame: number;
  animTimer: number;
  appearance: AgentAppearance;
  outfitImg: HTMLImageElement | null;
  deskSlot: DeskSlot;
  // Movement
  movementState: MovementState;
  targetX: number;
  targetY: number;
  deskX: number;       // desk seat position
  deskY: number;
  waitingX: number;    // assigned waiting position
  waitingY: number;
  prevStatus: string;
}

/** Returns true if this status means the agent should be at their desk. */
function isActiveStatus(status: string): boolean {
  return status === "working" || status === "thinking" || status === "meeting";
}

export default function PixelOfficeBanner({
  agents,
  onAgentClick,
  agentNotifications,
  onSubmit,
  hasTasks,
}: PixelOfficeBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const scaleRef = useRef<number>(1);
  const internalAgentsRef = useRef<InternalAgent[]>([]);
  const imagesRef = useRef<{
    char: HTMLImageElement;
    shadow: HTMLImageElement;
    hair: HTMLImageElement;
    outfits: Record<string, HTMLImageElement>;
    desks: HTMLCanvasElement[];
    chair: HTMLImageElement;
    // Grayscale copies for idle state
    grayChar: HTMLCanvasElement;
    grayShadow: HTMLCanvasElement;
    grayHair: HTMLCanvasElement;
    grayOutfits: Record<string, HTMLCanvasElement>;
    grayDesks: HTMLCanvasElement[];
    grayChair: HTMLCanvasElement;
  } | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const onAgentClickRef = useRef(onAgentClick);
  onAgentClickRef.current = onAgentClick;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const notificationsRef = useRef(agentNotifications);
  notificationsRef.current = agentNotifications;
  const initializedRef = useRef(false);

  /* ── Image loader ──────────────────────────────────────────────── */
  const loadImage = useCallback((src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  /* ── Initialize canvas + game loop ─────────────────────────────── */
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to actual display pixels for crisp text
    const dpr = window.devicePixelRatio || 1;
    const displayRect = container.getBoundingClientRect();
    canvas.width = Math.round(displayRect.width * dpr);
    canvas.height = Math.round(displayRect.height * dpr);
    scaleRef.current = (canvas.width / CANVAS_W) * ZOOM;
    ctx.scale(scaleRef.current, scaleRef.current);
    ctx.translate(-CAM_X, -CAM_Y);
    ctx.imageSmoothingEnabled = false;

    const tileMap = buildMap();

    /* ── Load all assets ───────────────────────────────────────── */
    const outfitNames = ["Outfit1", "Outfit2", "Outfit3", "Outfit4", "Outfit5", "Outfit6"];

    Promise.all([
      loadImage("/MetroCity/CharacterModel/Character Model.png"),
      loadImage("/MetroCity/CharacterModel/Shadow.png"),
      loadImage("/MetroCity/Hair/Hairs.png"),
      ...outfitNames.map((name) => loadImage(`/MetroCity/Outfits/${name}.png`)),
      loadImage("/MetroCity/desks/1.png"),
      loadImage("/MetroCity/desks/2.png"),
      loadImage("/MetroCity/desks/3.png"),
      loadImage("/MetroCity/desks/4.png"),
      loadImage("/MetroCity/Chair.png"),
    ]).then((loaded) => {
      const charImg = loaded[0];
      const shadowImg = loaded[1];
      const hairImg = loaded[2];

      // Outfits map
      const outfits: Record<string, HTMLImageElement> = {};
      outfitNames.forEach((name, i) => {
        outfits[name] = loaded[3 + i];
      });

      // Pre-render desk images into offscreen canvases (scaled to 2-tile width)
      const deskW = TILE * 2;
      const deskRawImgs = [loaded[9], loaded[10], loaded[11], loaded[12]];
      const desks = deskRawImgs.map((img) => {
        const h = Math.round(deskW * (img.height / img.width));
        const off = document.createElement("canvas");
        off.width = deskW;
        off.height = h;
        const oCtx = off.getContext("2d")!;
        oCtx.imageSmoothingEnabled = false;
        oCtx.drawImage(img, 0, 0, deskW, h);
        return off;
      });

      const chairImg = loaded[13];

      // Pre-generate grayscale copies of all sprite assets
      const grayChar = toGrayscale(charImg);
      const grayShadow = toGrayscale(shadowImg);
      const grayHair = toGrayscale(hairImg);
      const grayOutfits: Record<string, HTMLCanvasElement> = {};
      outfitNames.forEach((name) => {
        grayOutfits[name] = toGrayscale(outfits[name]);
      });
      const grayDesks = desks.map((d) => toGrayscale(d));
      const grayChair = toGrayscale(chairImg);

      imagesRef.current = {
        char: charImg, shadow: shadowImg, hair: hairImg, outfits, desks, chair: chairImg,
        grayChar, grayShadow, grayHair, grayOutfits, grayDesks, grayChair,
      };

      // Build internal agent state from current props
      buildInternalAgents(outfits);

      // Start game loop
      const loop = () => {
        update();
        draw(ctx, tileMap);
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    }).catch((err) => {
      console.error("[PixelOfficeBanner] Failed to load assets:", err);
    });

    /* ── Mouse events ──────────────────────────────────────────── */
    function screenToWorld(e: MouseEvent) {
      const r = canvas!.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * (CANVAS_W / ZOOM) + CAM_X;
      const wy = ((e.clientY - r.top) / r.height) * (CANVAS_H / ZOOM) + CAM_Y;
      return { x: wx, y: wy };
    }

    const handleMouseMove = (e: MouseEvent) => {
      const world = screenToWorld(e);
      mouseRef.current = world;

      const hit = hitTestAgent(world.x, world.y);
      hoveredRef.current = hit;
      canvas.style.cursor = hit ? "pointer" : "default";
    };

    const handleClick = (e: MouseEvent) => {
      const world = screenToWorld(e);
      const hit = hitTestAgent(world.x, world.y);
      if (hit) {
        onAgentClickRef.current?.(hit);
      }
    };

    const handleMouseLeave = () => {
      hoveredRef.current = null;
      mouseRef.current = { x: -1, y: -1 };
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sync agent prop changes → trigger movement ────────────────── */
  useEffect(() => {
    const internals = internalAgentsRef.current;
    if (internals.length === 0 && imagesRef.current) {
      buildInternalAgents(imagesRef.current.outfits);
      return;
    }
    for (const ia of internals) {
      const fresh = agents.find((a) => a.id === ia.id);
      if (!fresh) continue;

      const oldStatus = ia.status;
      ia.status = fresh.status;
      ia.name = fresh.name;
      ia.color = fresh.color;

      // Detect status change that requires movement
      const wasActive = isActiveStatus(oldStatus);
      const isNowActive = isActiveStatus(fresh.status);

      if (isNowActive && !wasActive) {
        // Go to desk
        ia.targetX = ia.deskX;
        ia.targetY = ia.deskY;
        ia.movementState = "walking_to_desk";
      } else if (!isNowActive && wasActive) {
        // Go to waiting area
        ia.targetX = ia.waitingX;
        ia.targetY = ia.waitingY;
        ia.movementState = "walking_to_waiting";
      }

      ia.prevStatus = fresh.status;
    }
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Build internal agents from prop list ─────────────────────── */
  function buildInternalAgents(outfits: Record<string, HTMLImageElement>) {
    const result: InternalAgent[] = [];
    let waitingIdx = 0;

    for (const slot of DESK_SLOTS) {
      const agent = agentsRef.current.find((a) => a.id === slot.id);
      if (!agent) continue;

      const appearance = AGENT_APPEARANCE[slot.id];
      if (!appearance) continue;

      // Desk seat position: center of 2-tile desk, one tile below desk row
      const deskX = slot.col * TILE + TILE;
      const deskY = slot.row * TILE + TILE + TILE / 4;

      // Waiting area position
      const wp = WAITING_POSITIONS[waitingIdx % WAITING_POSITIONS.length];
      waitingIdx++;

      // Start position based on initial status
      const active = isActiveStatus(agent.status);
      const startX = active ? deskX : wp.x;
      const startY = active ? deskY : wp.y;
      const startState: MovementState = active ? "at_desk" : "at_waiting";
      const startDir = active ? DIR_UP : DIR_DOWN;

      result.push({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        color: agent.color || ROLE_COLORS[agent.role],
        x: startX,
        y: startY,
        dir: startDir,
        frame: 0,
        animTimer: 0,
        appearance,
        outfitImg: outfits[appearance.outfit] || null,
        deskSlot: slot,
        movementState: startState,
        targetX: startX,
        targetY: startY,
        deskX,
        deskY,
        waitingX: wp.x,
        waitingY: wp.y,
        prevStatus: agent.status,
      });
    }

    internalAgentsRef.current = result;
  }

  /* ── Hit test (frontmost agent first via reverse Y order) ─────── */
  function hitTestAgent(mx: number, my: number): string | null {
    // Sort by Y descending so frontmost agents get priority
    const sorted = [...internalAgentsRef.current].sort((a, b) => b.y - a.y);
    for (const ia of sorted) {
      const left = ia.x - FRAME;
      const top = ia.y - FRAME;
      const right = ia.x + FRAME;
      const bottom = ia.y + FRAME / 2;
      if (mx >= left && mx <= right && my >= top && my <= bottom) {
        return ia.id;
      }
    }
    return null;
  }

  /* ── Update (animation + movement) ──────────────────────────────── */
  function update() {
    for (const ia of internalAgentsRef.current) {
      // Movement
      if (ia.movementState === "walking_to_desk" || ia.movementState === "walking_to_waiting") {
        const dx = ia.targetX - ia.x;
        const dy = ia.targetY - ia.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < ARRIVAL_THRESHOLD) {
          // Arrived
          ia.x = ia.targetX;
          ia.y = ia.targetY;
          ia.movementState = ia.movementState === "walking_to_desk" ? "at_desk" : "at_waiting";
          ia.frame = 0;
          ia.animTimer = 0;
          ia.dir = ia.movementState === "at_desk" ? DIR_UP : DIR_DOWN;
        } else {
          // Move toward target
          const nx = dx / dist;
          const ny = dy / dist;
          ia.x += nx * WALK_SPEED;
          ia.y += ny * WALK_SPEED;

          // Set direction based on dominant axis
          if (Math.abs(dx) > Math.abs(dy)) {
            ia.dir = dx > 0 ? DIR_RIGHT : DIR_LEFT;
          } else {
            ia.dir = dy > 0 ? DIR_DOWN : DIR_UP;
          }

          // Walk animation
          ia.animTimer++;
          if (ia.animTimer >= ANIM_SPEED) {
            ia.animTimer = 0;
            ia.frame = (ia.frame + 1) % FRAMES_PER_DIR;
          }
        }
      } else if (ia.movementState === "at_desk") {
        // Always face desk (up)
        ia.dir = DIR_UP;
        const isWorking = ia.status === "working" || ia.status === "thinking";
        if (isWorking) {
          // Subtle typing bob: alternate frame 0↔1 at slow speed
          ia.animTimer++;
          if (ia.animTimer >= TYPING_SPEED) {
            ia.animTimer = 0;
            ia.frame = ia.frame === 0 ? 1 : 0;
          }
        } else {
          // Static still pose facing desk
          ia.frame = 0;
          ia.animTimer = 0;
        }
      } else {
        // at_waiting — idle, face down
        ia.dir = DIR_DOWN;
        ia.frame = 0;
        ia.animTimer = 0;
      }
    }
  }

  /* ── Draw ───────────────────────────────────────────────────────── */
  function draw(ctx: CanvasRenderingContext2D, tileMap: number[][]) {
    const imgs = imagesRef.current;
    if (!imgs) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(CAM_X, CAM_Y, CANVAS_W / ZOOM, CANVAS_H / ZOOM);

    // ── Floor tiles ──
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tileMap[r][c] === 1) continue; // skip walls here

        // Chief carpet area (right of partition)
        if (c >= BOSS_PARTITION_COL && r >= 1 && r <= 5) {
          ctx.fillStyle = "#e8dcc8";
        }
        // Lounge/waiting area (rows 6+)
        else if (r >= 6) {
          ctx.fillStyle = "#f5f0ea";
        }
        // Normal office floor
        else {
          ctx.fillStyle = "#f0f0f0";
        }

        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // ── Walls with window panels ──
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tileMap[r][c] !== 1) continue;
        if (r === 0) {
          // Base wall
          ctx.fillStyle = "#2d3748";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          // Window panels every 3 columns, skip edges and chief area
          if (c > 0 && c < COLS - 1 && c < BOSS_PARTITION_COL && c % 3 === 1) {
            const wx = c * TILE + 3;
            const wy = r * TILE + 4;
            const ww = TILE - 6;
            const wh = TILE - 10;
            // Frame
            ctx.fillStyle = "#1a202c";
            ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
            // Glass pane
            ctx.fillStyle = "#c8ddf0";
            ctx.fillRect(wx, wy, ww, wh);
            // Highlight strip on right edge
            ctx.fillStyle = "#ddeaf8";
            ctx.fillRect(wx + ww - 3, wy, 3, wh);
          }
          // Wood-tone baseboard trim
          ctx.fillStyle = "#8B7355";
          ctx.fillRect(c * TILE, r * TILE + TILE - 2, TILE, 2);
        } else {
          ctx.fillStyle = "#2d3748";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // ── Wall shadow (depth illusion along top of row 1) ──
    {
      const shadowY = 1 * TILE;
      const shadowH = TILE;
      const grad = ctx.createLinearGradient(0, shadowY, 0, shadowY + shadowH);
      grad.addColorStop(0, "rgba(0,0,0,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, shadowY, COLS * TILE, shadowH);
    }

    // ── Glass-style chief partition ──
    for (let r = 1; r <= 5; r++) {
      const px = BOSS_PARTITION_COL * TILE - 4;
      const py = r * TILE;
      // Doorway gap at rows 4-5: just draw floor
      if (r === 4 || r === 5) {
        ctx.fillStyle = "#e8dcc8";
        ctx.fillRect(px, py, 4, TILE);
        continue;
      }
      // Glass body
      ctx.fillStyle = "rgba(180, 210, 235, 0.35)";
      ctx.fillRect(px, py, 4, TILE);
      // Frame lines (left and right edges)
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(px, py, 1, TILE);
      ctx.fillRect(px + 3, py, 1, TILE);
      // Center highlight
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(px + 2, py, 1, TILE);
    }

    // ── Lounge divider (thin solid line) ──
    ctx.strokeStyle = "#d1cdc6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1 * TILE, 6 * TILE);
    ctx.lineTo((COLS - 1) * TILE, 6 * TILE);
    ctx.stroke();


    // ── Desks (grayscaled when agent is idle) ──
    for (const slot of DESK_SLOTS) {
      const ia = internalAgentsRef.current.find((a) => a.id === slot.id);
      const idle = !ia || !isActiveStatus(ia.status);
      const deskCanvas = idle ? imgs.grayDesks[slot.deskImg] : imgs.desks[slot.deskImg];
      const dx = slot.col * TILE;
      const dy = slot.row * TILE + (TILE - deskCanvas.height) / 2;
      ctx.drawImage(deskCanvas, dx, dy);
    }

    // ── Chairs ──
    for (const slot of DESK_SLOTS) {
      const cx = slot.col * TILE + TILE - 8;
      const cy = slot.row * TILE + TILE;
      const ia = internalAgentsRef.current.find((a) => a.id === slot.id);
      const idle = !ia || !isActiveStatus(ia.status);
      ctx.drawImage(idle ? imgs.grayChair : imgs.chair, cx, cy, 16, 16);
    }

    // ── Agents (sorted by Y for correct z-order overlap) ──
    const sortedAgents = [...internalAgentsRef.current].sort((a, b) => a.y - b.y);
    for (const ia of sortedAgents) {
      drawAgent(ctx, imgs, ia);
    }

    // Hover tooltip disabled
  }

  function drawAgent(
    ctx: CanvasRenderingContext2D,
    imgs: NonNullable<typeof imagesRef.current>,
    ia: InternalAgent
  ) {
    const frameCol = ia.dir * FRAMES_PER_DIR + ia.frame;
    const sx = frameCol * FRAME;
    const dx = ia.x - FRAME / 2;
    const dy = ia.y - FRAME / 2;

    // Hover bounce
    let bounceY = 0;
    if (hoveredRef.current === ia.id) {
      bounceY = -3;
    }

    // Use grayscale assets for idle agents
    const idle = !isActiveStatus(ia.status) && ia.movementState !== "walking_to_desk";
    const shadowSrc = idle ? imgs.grayShadow : imgs.shadow;
    const charSrc = idle ? imgs.grayChar : imgs.char;
    const hairSrc = idle ? imgs.grayHair : imgs.hair;
    const outfitSrc = idle
      ? imgs.grayOutfits[ia.appearance.outfit] || null
      : ia.outfitImg;

    // Shadow
    ctx.drawImage(shadowSrc, 0, 0, 32, 32, dx, dy + bounceY, FRAME, FRAME);

    // Body
    const charSy = ia.appearance.skinRow * FRAME;
    ctx.drawImage(charSrc, sx, charSy, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);

    // Outfit
    if (outfitSrc) {
      ctx.drawImage(outfitSrc, sx, 0, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);
    }

    // Hair
    const hairSy = ia.appearance.hairRow * FRAME;
    ctx.drawImage(hairSrc, sx, hairSy, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);

    // Name badge: full-width pill above table when active, small circle when idle
    const label = formatBadgeName(ia.name);
    ctx.font = "700 6px Inter, -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";

    const deskW = TILE * 2;
    const pillW = deskW;
    const pillH = 14;
    const pillX = ia.deskSlot.col * TILE;
    const pillY = ia.deskSlot.row * TILE - pillH - 6;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 4);
    ctx.fillStyle = idle ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.fillStyle = idle ? "#9CA3AF" : ia.color;
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 2.5);

    // Red notification bubble when agent has pending checkpoint
    const notif = notificationsRef.current?.[ia.id];
    if (notif && notif.count > 0) {
      const bx = ia.x + FRAME / 2 - 4;
      const by = ia.y - FRAME / 2 - 4 + bounceY;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#EF4444";
      ctx.fill();
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText("!", bx, by + 3);
    }
  }


  const [collapsed, setCollapsed] = useState(false);
  const manualExpandRef = useRef(false);
  const hasBeenActiveRef = useRef(false);

  // Auto-collapse: 0.5s on initial load, 5s after agents were active
  useEffect(() => {
    const anyActive = agents.some((a) => isActiveStatus(a.status));

    if (anyActive) {
      hasBeenActiveRef.current = true;
      manualExpandRef.current = false;
      setCollapsed(false);
    } else {
      const delay = hasBeenActiveRef.current ? 5000 : 500;
      const timer = setTimeout(() => {
        if (!manualExpandRef.current) {
          setCollapsed(true);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [agents]);

  // Lounge = rows 6-8 (3 of 9 rows = bottom 1/3 of canvas)
  // When collapsed, show aspect ratio for just those 3 rows
  const fullAR = `${CANVAS_W} / ${CANVAS_H}`;
  const loungeH = Math.round((CANVAS_H * 3) / ROWS);
  const collapsedAR = `${CANVAS_W} / ${loungeH}`;

  return (
    <div className="relative w-full">
      {/* Pixel canvas area — clips to show lounge only when collapsed */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-[#2d3748]"
        style={{ aspectRatio: collapsed ? collapsedAR : fullAR, transition: "aspect-ratio 0.3s ease" }}
      >
        <div
          ref={containerRef}
          className="absolute left-0 w-full"
          style={{
            aspectRatio: fullAR,
            bottom: 0,
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Collapse/expand toggle */}
        <button
          onClick={() => {
            setCollapsed((v) => {
              if (v) manualExpandRef.current = true;
              return !v;
            });
          }}
          className="absolute top-2 left-2 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
          title={collapsed ? "Expand office" : "Collapse office"}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Command bar — always visible below canvas */}
      {onSubmit && (
        <div className="relative -mt-16 px-4 pb-3 pt-4 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)" }}
        >
          <div className="pointer-events-auto">
            <CommandBar onSubmit={onSubmit} hasTasks={hasTasks ?? false} />
          </div>
        </div>
      )}
    </div>
  );
}
