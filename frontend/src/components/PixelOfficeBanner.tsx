"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Agent } from "@/lib/types";

interface PixelOfficeBannerProps {
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
}

export default function PixelOfficeBanner({
  agents,
  onAgentClick,
}: PixelOfficeBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sceneRef = useRef<any>(null);
  const initializedRef = useRef(false);

  // Stable callback ref
  const onAgentClickRef = useRef(onAgentClick);
  onAgentClickRef.current = onAgentClick;

  const initGame = useCallback(async () => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    try {
      // Dynamic import of Phaser (SSR safe)
      const PhaserModule = await import("phaser");
      // Handle both ESM default export and CJS export patterns
      const Phaser = (PhaserModule as any).default || PhaserModule;

      // Dynamic import of our config (which imports the scene)
      const { createGameConfig } = await import("@/game/config");

      // Ensure container still exists (component may have unmounted)
      if (!containerRef.current) {
        initializedRef.current = false;
        return;
      }

      const config = createGameConfig("phaser-game-container");
      const game = new Phaser.Game(config);
      gameRef.current = game;

      // Listen for the scene to be ready
      game.events.on("ready", () => {
        const scene = game.scene.getScene("PixelOfficeScene");
        if (scene) {
          sceneRef.current = scene;
        }
      });

      // Wait a bit for scene to initialize, then grab reference
      setTimeout(() => {
        const scene = game.scene.getScene("PixelOfficeScene");
        if (scene) {
          sceneRef.current = scene;
          // Push current agent data
          (scene as any).updateAgents?.(
            agents.map((a) => ({
              id: a.id,
              name: a.name,
              role: a.role,
              status: a.status,
              color: a.color,
            }))
          );
        }
      }, 1000);

      // Listen for agent clicks from Phaser
      game.events.on("agent-clicked", (agentId: string) => {
        onAgentClickRef.current?.(agentId);
      });
    } catch (err) {
      console.error("[PixelOfficeBanner] Failed to initialize Phaser:", err);
      initializedRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize Phaser on mount
  useEffect(() => {
    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
        initializedRef.current = false;
      }
    };
  }, [initGame]);

  // Push agent updates into the scene when agents change
  useEffect(() => {
    if (sceneRef.current && typeof sceneRef.current.updateAgents === "function") {
      sceneRef.current.updateAgents(
        agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
          color: a.color,
        }))
      );
    }
  }, [agents]);

  return (
    <div className="relative w-full h-[250px] bg-[#1a1a2e] border border-[var(--border-color)] rounded-xl overflow-hidden">
      {/* Phaser game canvas mounts here */}
      <div
        id="phaser-game-container"
        ref={containerRef}
        className="absolute inset-0 z-10"
        style={{ imageRendering: "pixelated" }}
      />

      {/* Fallback label shown before Phaser loads */}
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
