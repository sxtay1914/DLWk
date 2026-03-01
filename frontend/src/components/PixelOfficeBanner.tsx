"use client";

import type { Agent } from "@/lib/types";

interface PixelOfficeBannerProps {
  agents: Agent[];
}

export default function PixelOfficeBanner({ agents }: PixelOfficeBannerProps) {
  return (
    <div className="relative w-full h-[250px] bg-[#1a1a2e] border border-[var(--border-color)] rounded-xl overflow-hidden">
      {/* Pixel grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Shimmer effect */}
      <div className="absolute inset-0 shimmer-bg" />

      {/* Floor line */}
      <div className="absolute bottom-[60px] left-0 right-0 h-px bg-[#2a2a4e]" />
      <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-[#141425]" />

      {/* Agent positions in the office */}
      <div className="absolute bottom-[68px] left-0 right-0 flex justify-around px-12">
        {agents.map((agent, i) => (
          <div
            key={agent.id}
            className="flex flex-col items-center gap-1 group cursor-pointer"
          >
            {/* Desk */}
            <div className="w-12 h-3 bg-[#2a2a4e] rounded-sm" />

            {/* Agent pixel avatar */}
            <div
              className="w-6 h-8 rounded-sm relative transition-transform group-hover:scale-110"
              style={{ backgroundColor: agent.color }}
            >
              {/* Head */}
              <div
                className="absolute -top-2 left-1 w-4 h-4 rounded-sm"
                style={{ backgroundColor: agent.color }}
              />
              {/* Status indicator */}
              <div
                className={`absolute -top-3 -right-1 w-2 h-2 rounded-full border border-[#1a1a2e] ${
                  agent.status === "working"
                    ? "bg-[var(--success)]"
                    : agent.status === "reviewing"
                    ? "bg-[#8B5CF6]"
                    : agent.status === "blocked"
                    ? "bg-[var(--error)]"
                    : "bg-[var(--text-muted)]"
                }`}
              />
            </div>

            {/* Label */}
            <span
              className="text-[6px] tracking-wider text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors mt-1"
              style={{ fontFamily: "var(--font-press-start)" }}
            >
              {agent.avatar_label}
            </span>
          </div>
        ))}
      </div>

      {/* Office label */}
      <div className="absolute top-4 left-5 flex items-center gap-2">
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

      {/* Phaser canvas mount point (id for later use) */}
      <div id="phaser-container" className="absolute inset-0 z-10 pointer-events-none" />

      {/* Placeholder text */}
      <div className="absolute top-4 right-5">
        <span className="text-[7px] text-[var(--text-muted)] opacity-50 font-mono">
          Phaser scene will mount here
        </span>
      </div>
    </div>
  );
}
