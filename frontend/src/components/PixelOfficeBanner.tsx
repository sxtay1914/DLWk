"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Agent, AgentRole } from "@/lib/types";

interface PixelOfficeBannerProps {
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
}

/* ── Sprite-sheet constants ─────────────────────────────────────── */
const FRAME = 32;           // px per frame in the sprite sheet
const FRAMES_PER_DIR = 6;
const DIR_DOWN = 0, DIR_RIGHT = 1, DIR_UP = 2, DIR_LEFT = 3;
const ANIM_SPEED = 8;       // ticks per frame advance

/* ── Canvas / tile-map ──────────────────────────────────────────── */
const CANVAS_W = 960;
const CANVAS_H = 280;
const TILE = 32;
const COLS = 30;
const ROWS = 12;
const ZOOM = 1.4;
// Camera centers on the content area (desks span cols 5–19, rows 3–8)
const FOCUS_X = 12 * TILE;  // center col of content
const FOCUS_Y = 5.5 * TILE; // center row of content
const CAM_X = FOCUS_X - (CANVAS_W / ZOOM) / 2;
const CAM_Y = FOCUS_Y - (CANVAS_H / ZOOM) / 2;

/* ── Role → appearance mapping ──────────────────────────────────── */
interface RoleAppearance {
  outfit: string;   // filename e.g. "Outfit5"
  skinRow: number;
  hairRow: number;
}

const ROLE_APPEARANCE: Record<AgentRole, RoleAppearance> = {
  boss:          { outfit: "Outfit5", skinRow: 1, hairRow: 0 },
  pm:            { outfit: "Outfit2", skinRow: 0, hairRow: 1 },
  scrum_master:  { outfit: "Outfit3", skinRow: 2, hairRow: 2 },
  developer:     { outfit: "Outfit1", skinRow: 0, hairRow: 3 },
  qa:            { outfit: "Outfit4", skinRow: 1, hairRow: 5 },
  code_reviewer: { outfit: "Outfit6", skinRow: 2, hairRow: 6 },
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

/* ── Desk positions (col, row) — agents sit one tile below ─────── */
interface DeskSlot {
  role: AgentRole;
  col: number;      // left tile of 2-wide desk
  row: number;      // desk row
  deskImg: number;  // index into desk images 0-3
}

const DESK_SLOTS: DeskSlot[] = [
  // Row 1 (y=3)
  { role: "boss",         col: 5,  row: 3, deskImg: 0 },
  { role: "pm",           col: 11, row: 3, deskImg: 1 },
  { role: "scrum_master", col: 17, row: 3, deskImg: 2 },
  // Row 2 (y=6)
  { role: "developer",    col: 5,  row: 6, deskImg: 3 },
  { role: "qa",           col: 11, row: 6, deskImg: 0 },
  { role: "code_reviewer",col: 17, row: 6, deskImg: 1 },
];

/* ── Build tile map ─────────────────────────────────────────────── */
// 0=floor, 1=wall
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

/* ── Internal agent state ───────────────────────────────────────── */
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
  appearance: RoleAppearance;
  outfitImg: HTMLImageElement | null;
  deskSlot: DeskSlot;
}

export default function PixelOfficeBanner({
  agents,
  onAgentClick,
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
      // Convert screen pixel → world coordinate (accounting for zoom + camera)
      const wx = ((e.clientX - r.left) / r.width) * (CANVAS_W / ZOOM) + CAM_X;
      const wy = ((e.clientY - r.top) / r.height) * (CANVAS_H / ZOOM) + CAM_Y;
      return { x: wx, y: wy };
    }

    const handleMouseMove = (e: MouseEvent) => {
      const world = screenToWorld(e);
      mouseRef.current = world;

      // Hit test
      const hit = hitTestAgent(world.x, world.y);
      hoveredRef.current = hit;
      canvas.style.cursor = hit ? "pointer" : "default";
    };

    const handleClick = (e: MouseEvent) => {
      const world = screenToWorld(e);
      const mx = world.x;
      const my = world.y;
      const hit = hitTestAgent(mx, my);
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

  /* ── Sync agent prop changes ──────────────────────────────────── */
  useEffect(() => {
    const internals = internalAgentsRef.current;
    if (internals.length === 0 && imagesRef.current) {
      buildInternalAgents(imagesRef.current.outfits);
      return;
    }
    // Update status/name for existing agents
    for (const ia of internals) {
      const fresh = agents.find((a) => a.id === ia.id);
      if (fresh) {
        ia.status = fresh.status;
        ia.name = fresh.name;
        ia.color = fresh.color;
      }
    }
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Build internal agents from prop list ──────────────────────── */
  function buildInternalAgents(outfits: Record<string, HTMLImageElement>) {
    const result: InternalAgent[] = [];

    for (const slot of DESK_SLOTS) {
      const agent = agentsRef.current.find((a) => a.role === slot.role);
      if (!agent) continue;

      const appearance = ROLE_APPEARANCE[slot.role];
      // Agent sits just below the desk, facing up toward it
      const x = slot.col * TILE + TILE;              // center of 2-tile desk
      const y = slot.row * TILE + TILE + TILE / 4;   // snug below desk

      result.push({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        color: agent.color || ROLE_COLORS[slot.role],
        x,
        y,
        dir: DIR_UP,
        frame: 0,
        animTimer: 0,
        appearance,
        outfitImg: outfits[appearance.outfit] || null,
        deskSlot: slot,
      });
    }

    internalAgentsRef.current = result;
  }

  /* ── Hit test ──────────────────────────────────────────────────── */
  function hitTestAgent(mx: number, my: number): string | null {
    for (const ia of internalAgentsRef.current) {
      // Wider hit area covering both the visible agent head and the desk in front
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

  /* ── Update (animation) ────────────────────────────────────────── */
  function update() {
    for (const ia of internalAgentsRef.current) {
      const isWorking = ia.status === "working" || ia.status === "thinking";
      if (isWorking) {
        ia.animTimer++;
        if (ia.animTimer >= ANIM_SPEED) {
          ia.animTimer = 0;
          ia.frame = (ia.frame + 1) % FRAMES_PER_DIR;
        }
      } else {
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
    // Clear the full visible area (context is translated by camera offset)
    ctx.clearRect(CAM_X, CAM_Y, CANVAS_W / ZOOM, CANVAS_H / ZOOM);

    // Floor
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tileMap[r][c] === 0) {
          ctx.fillStyle = "#e8e8e8";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          // Subtle grid lines
          ctx.strokeStyle = "#d4d4d4";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // Walls
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tileMap[r][c] === 1) {
          // Top wall is taller with accent
          if (r === 0) {
            ctx.fillStyle = "#4a5568";
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
            // Accent stripe at bottom of top wall
            ctx.fillStyle = "#63b3ed";
            ctx.fillRect(c * TILE, r * TILE + TILE - 3, TILE, 3);
          } else {
            ctx.fillStyle = "#4a5568";
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          }
        }
      }
    }

    // Desks
    for (const slot of DESK_SLOTS) {
      const deskCanvas = imgs.desks[slot.deskImg];
      const dx = slot.col * TILE;
      const dy = slot.row * TILE + (TILE - deskCanvas.height) / 2;
      ctx.drawImage(deskCanvas, dx, dy);
    }

    // Chairs (in front of desks, behind agents)
    for (const slot of DESK_SLOTS) {
      const cx = slot.col * TILE + TILE - 8;
      const cy = slot.row * TILE + TILE;
      ctx.drawImage(imgs.chair, cx, cy, 16, 16);
    }

    // Agents (on top of desks + chairs)
    for (const ia of internalAgentsRef.current) {
      drawAgent(ctx, imgs, ia);
    }

    // Hover tooltip only
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
  }

  function drawTooltip(ctx: CanvasRenderingContext2D, ia: InternalAgent) {
    const text = `${ia.name} — ${ia.status}`;
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
