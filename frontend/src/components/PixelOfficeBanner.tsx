"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Agent, AgentRole } from "@/lib/types";

interface PixelOfficeBannerProps {
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
  agentNotifications?: Record<string, { count: number }>;
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
const CANVAS_H = 290;
const TILE = 32;
const COLS = 30;
const ROWS = 10;
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
  "agent-pm":   { outfit: "Outfit2", skinRow: 0, hairRow: 1 },
  "agent-sm":   { outfit: "Outfit3", skinRow: 2, hairRow: 2 },
  "agent-dev":  { outfit: "Outfit1", skinRow: 0, hairRow: 3 },
  "agent-dev2": { outfit: "Outfit1", skinRow: 1, hairRow: 4 },
  "agent-qa":   { outfit: "Outfit4", skinRow: 1, hairRow: 5 },
  "agent-cr":   { outfit: "Outfit6", skinRow: 2, hairRow: 6 },
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
  { id: "agent-pm",   col: 4,  row: 3, deskImg: 1 },
  { id: "agent-sm",   col: 7,  row: 3, deskImg: 2 },
  { id: "agent-dev",  col: 10, row: 3, deskImg: 0 },
  { id: "agent-qa",   col: 13, row: 3, deskImg: 3 },
  { id: "agent-cr",   col: 16, row: 3, deskImg: 1 },
  { id: "agent-dev2", col: 19, row: 3, deskImg: 0 },
  // Boss corner desk (separate area)
  { id: "agent-boss", col: 23, row: 3, deskImg: 2 },
];

/* ── Waiting area positions (lounge row) ────────────────────────── */
const WAITING_ROW = 7;
const WAITING_POSITIONS: { x: number; y: number }[] = [
  { x: 4  * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 7  * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 10 * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 13 * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 16 * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 19 * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
  { x: 22 * TILE + TILE, y: WAITING_ROW * TILE + TILE / 2 },
];

/* ── Short names for sprite labels (long names overflow) ──────── */
const SHORT_NAMES: Record<string, string> = {
  "Developer 1": "Dev1",
  "Developer 2": "Dev2",
  "Scrum Master": "SM",
  "Code Reviewer": "CR",
};

/* ── Boss partition column ──────────────────────────────────────── */
const BOSS_PARTITION_COL = 22;

/* ── Build tile map ───────────────────────────────────────────────  */
function buildMap(): number[][] {
  const m: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    m[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
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

      imagesRef.current = { char: charImg, shadow: shadowImg, hair: hairImg, outfits, desks, chair: chairImg };

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

        // Boss carpet area (right of partition)
        if (c >= BOSS_PARTITION_COL && r >= 1 && r <= 6) {
          ctx.fillStyle = "#d4c5a0";
        }
        // Lounge/waiting area (rows 7-8)
        else if (r >= 7 && r <= 8) {
          ctx.fillStyle = "#f0ebe4";
        }
        // Normal office floor
        else {
          ctx.fillStyle = "#e8e8e8";
        }

        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        // Subtle grid lines
        ctx.strokeStyle = (r >= 7 && r <= 8) ? "#e0dbd4" : "#d4d4d4";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // ── Walls ──
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tileMap[r][c] !== 1) continue;
        if (r === 0) {
          ctx.fillStyle = "#4a5568";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          ctx.fillStyle = "#63b3ed";
          ctx.fillRect(c * TILE, r * TILE + TILE - 3, TILE, 3);
        } else {
          ctx.fillStyle = "#4a5568";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // ── Boss partition wall (vertical divider) ──
    for (let r = 1; r <= 6; r++) {
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(BOSS_PARTITION_COL * TILE - 4, r * TILE, 4, TILE);
    }
    // Doorway gap at row 4-5
    ctx.fillStyle = "#d4c5a0";
    ctx.fillRect(BOSS_PARTITION_COL * TILE - 4, 4 * TILE, 4, TILE * 2);

    // ── Lounge divider line ──
    ctx.strokeStyle = "#b0aaa0";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(1 * TILE, 7 * TILE);
    ctx.lineTo((COLS - 1) * TILE, 7 * TILE);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Lounge label ──
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#a09890";
    ctx.textAlign = "center";
    ctx.fillText("LOUNGE", 14 * TILE, 7 * TILE + 14);

    // ── Coffee machine icon (in lounge) ──
    ctx.fillStyle = "#8B6914";
    ctx.fillRect(2 * TILE + 8, 8 * TILE + 4, 16, 20);
    ctx.fillStyle = "#D4A437";
    ctx.fillRect(2 * TILE + 10, 8 * TILE + 6, 12, 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 6px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("☕", 2 * TILE + 16, 8 * TILE + 13);

    // ── Desks (always drawn, empty = signal agent left) ──
    for (const slot of DESK_SLOTS) {
      const deskCanvas = imgs.desks[slot.deskImg];
      const dx = slot.col * TILE;
      const dy = slot.row * TILE + (TILE - deskCanvas.height) / 2;
      ctx.drawImage(deskCanvas, dx, dy);
    }

    // ── Chairs ──
    for (const slot of DESK_SLOTS) {
      const cx = slot.col * TILE + TILE - 8;
      const cy = slot.row * TILE + TILE;
      ctx.drawImage(imgs.chair, cx, cy, 16, 16);
    }

    // ── Agents (sorted by Y for correct z-order overlap) ──
    const sortedAgents = [...internalAgentsRef.current].sort((a, b) => a.y - b.y);
    for (const ia of sortedAgents) {
      drawAgent(ctx, imgs, ia);
    }

    // ── Hover tooltip ──
    if (hoveredRef.current) {
      const ia = internalAgentsRef.current.find((a) => a.id === hoveredRef.current);
      if (ia) {
        drawTooltip(ctx, ia);
      }
    }
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

    // Shadow
    ctx.drawImage(imgs.shadow, 0, 0, 32, 32, dx, dy + bounceY, FRAME, FRAME);

    // Body
    const charSy = ia.appearance.skinRow * FRAME;
    ctx.drawImage(imgs.char, sx, charSy, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);

    // Outfit
    if (ia.outfitImg) {
      ctx.drawImage(ia.outfitImg, sx, 0, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);
    }

    // Hair
    const hairSy = ia.appearance.hairRow * FRAME;
    ctx.drawImage(imgs.hair, sx, hairSy, FRAME, FRAME, dx, dy + bounceY, FRAME, FRAME);

    // Name tag below sprite (short label, colored)
    const label = SHORT_NAMES[ia.name] || ia.name;
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = ia.color;
    ctx.fillText(label, ia.x, ia.y + FRAME / 2 + 8 + bounceY);

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

  function drawTooltip(ctx: CanvasRenderingContext2D, ia: InternalAgent) {
    const stateLabel = ia.movementState.startsWith("walking") ? "walking" : ia.status;
    const text = `${ia.name} — ${stateLabel}`;
    ctx.font = "bold 11px sans-serif";
    const tw = ctx.measureText(text).width;
    const px = 8;
    const tx = Math.min(Math.max(ia.x - tw / 2 - px, 4), CANVAS_W - tw - px * 2 - 4);
    const ty = ia.y - FRAME / 2 - 36;

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw + px * 2, 20, 4);
    ctx.fill();

    // Text
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(text, tx + px, ty + 14);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#2d3748] rounded-xl overflow-hidden"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Fallback label shown before canvas loads */}
      <div className="absolute top-4 left-5 flex items-center gap-2 z-0 pointer-events-none">
        <span
          className="text-[8px] tracking-widest text-[var(--text-muted)] uppercase"
          style={{ fontFamily: "var(--font-press-start)" }}
        >
          Pixel Office
        </span>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] float-delay-1" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] float-delay-2" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] float-delay-3" />
        </div>
      </div>
    </div>
  );
}
