"use client";

import { useState } from "react";

interface HeaderProps {
  sprintName: string;
  sprintStatus: string;
  agentCount: number;
  connectedToBackend: boolean;
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
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate days remaining (sprint is 2 weeks)
  const daysRemaining = 13;

  return (
    <header className="bg-[var(--bg-card)] border-b border-[var(--border-color)]">
      {/* Top row: breadcrumb, sprint actions */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          {/* Left: breadcrumb + title */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs text-[var(--text-muted)]">Projects</span>
              <span className="text-xs text-[var(--text-muted)]">/</span>
              <span className="text-xs text-[var(--text-secondary)]">AI Dev Team</span>
              {connectedToBackend && (
                <div className="ml-2 w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Connected to backend" />
              )}
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Board
            </h1>
          </div>

          {/* Right: sprint info + actions */}
          <div className="flex items-center gap-3">
            {/* Days remaining */}
            <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{daysRemaining} days remaining</span>
            </div>

            {/* Complete Sprint button */}
            <button className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors">
              Complete Sprint
            </button>

            {/* More menu */}
            <button className="p-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-secondary)]">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: search, avatar stack, filters */}
      <div className="flex items-center justify-between px-5 pb-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-[180px] pl-8 pr-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
            />
          </div>

          {/* Agent avatar stack */}
          <div className="flex -space-x-1.5">
            {AGENT_AVATARS.slice(0, Math.min(agentCount, 7)).map((agent, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-[var(--bg-card)] cursor-pointer hover:z-10 hover:scale-110 transition-transform"
                style={{ backgroundColor: agent.color, zIndex: agentCount - i }}
                title={agent.label}
              >
                {agent.label}
              </div>
            ))}
          </div>

          {/* Epic filter dropdown */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-color)] rounded hover:bg-[var(--bg-card-hover)] transition-colors">
            Epic
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Sprint badge */}
          <span className="px-2.5 py-1 text-xs font-medium rounded bg-[var(--accent)]/10 text-[var(--accent)]">
            {sprintName}
          </span>

          {sprintStatus === "active" && (
            <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-[var(--success)]/10 text-[var(--success)]">
              {sprintStatus}
            </span>
          )}
        </div>

        {/* Right: Group by */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] rounded transition-colors">
            <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--text-muted)]">Group by</span>
            <span className="text-sm text-[var(--text-secondary)]">Choices</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
