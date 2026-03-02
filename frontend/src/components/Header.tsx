"use client";

import { useState } from "react";

interface HeaderProps {
  sprintName: string;
  sprintStatus: string;
  agentCount: number;
  connectedToBackend: boolean;
  onSearch?: (query: string) => void;
}

const AGENT_AVATARS = [
  { label: "B", color: "#F59E0B" },
  { label: "PM", color: "#3B82F6" },
  { label: "SM", color: "#14B8A6" },
  { label: "D1", color: "#22C55E" },
  { label: "D2", color: "#22C55E" },
  { label: "QA", color: "#F97316" },
  { label: "CR", color: "#8B5CF6" },
];

export default function Header({
  sprintName,
  sprintStatus,
  agentCount,
  connectedToBackend,
  onSearch,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)]">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: title + connection */}
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-[var(--text-primary)]">
              AI Dev Team
            </h1>
            <span className="text-sm text-[var(--text-muted)]">/</span>
            <span className="text-sm text-[var(--text-secondary)]">Board</span>
            {connectedToBackend && (
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Connected" />
            )}
          </div>

          {/* Right: sprint + actions */}
          <div className="flex items-center gap-2">
            {sprintStatus === "active" && (
              <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-[var(--success)]/10 text-[var(--success)]">
                {sprintName}
              </span>
            )}
            <button className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-full transition-colors">
              Complete Sprint
            </button>
            <button className="p-2 rounded-full hover:bg-[var(--bg-column)] transition-colors text-[var(--text-muted)]">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: search, avatar stack, filters */}
      <div className="flex items-center justify-between px-6 pb-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch?.(e.target.value);
              }}
              placeholder="Search tasks..."
              className="w-[200px] pl-8 pr-3 py-1.5 text-[13px] bg-[var(--bg-column)] border-none rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--text-muted)]/20 transition-all"
            />
          </div>

          {/* Agent avatar stack */}
          <div className="flex -space-x-1.5">
            {AGENT_AVATARS.slice(0, Math.min(agentCount, 7)).map((agent, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-semibold text-white border-2 border-[var(--bg-card)] cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                style={{ backgroundColor: agent.color, zIndex: agentCount - i }}
                title={agent.label}
              >
                {agent.label}
              </div>
            ))}
          </div>

          <div className="w-px h-4 bg-[var(--border-subtle)]" />

          {/* Filter buttons */}
          <button className="flex items-center gap-1 px-2.5 py-1 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-column)] rounded-lg transition-colors">
            Epic
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <button className="flex items-center gap-1 px-2.5 py-1 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-column)] rounded-lg transition-colors">
            Group by
            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
