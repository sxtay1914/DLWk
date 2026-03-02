"use client";

import { useState, useEffect } from "react";
import { toggleTheme } from "@/components/ThemeProvider";

interface HeaderProps {
  sprintName: string;
  sprintStatus: string;
  agentCount: number;
  connectedToBackend: boolean;
  onSearch?: (query: string) => void;
}

const AGENT_AVATARS = [
  { label: "C", color: "#F59E0B", name: "Chief" },
  { label: "PM", color: "#3B82F6", name: "Project Manager" },
  { label: "SM", color: "#14B8A6", name: "Scrum Master" },
  { label: "D1", color: "#22C55E", name: "Developer 1" },
  { label: "D2", color: "#22C55E", name: "Developer 2" },
  { label: "QA", color: "#F97316", name: "QA Engineer" },
  { label: "CR", color: "#8B5CF6", name: "Code Reviewer" },
];

type Cap = "delegate" | "plan" | "assign" | "code" | "run_cmds" | "test" | "review";

const CAPABILITIES: { key: Cap; label: string }[] = [
  { key: "delegate", label: "Delegate Tasks" },
  { key: "plan", label: "Create Plans" },
  { key: "assign", label: "Assign Work" },
  { key: "code", label: "Write Code" },
  { key: "run_cmds", label: "Run Commands" },
  { key: "test", label: "Write Tests" },
  { key: "review", label: "Review Code" },
];

const AGENT_CAPS: Record<string, Cap[]> = {
  C:  ["delegate"],
  PM: ["plan"],
  SM: ["assign"],
  D1: ["code", "run_cmds"],
  D2: ["code", "run_cmds"],
  QA: ["test", "run_cmds"],
  CR: ["review"],
};

export default function Header({
  sprintName,
  sprintStatus,
  agentCount,
  connectedToBackend,
  onSearch,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [showAgentCaps, setShowAgentCaps] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const handler = (e: Event) => {
      setIsDark((e as CustomEvent).detail?.dark ?? false);
    };
    window.addEventListener("toggle-theme", handler);
    return () => window.removeEventListener("toggle-theme", handler);
  }, []);

  return (
    <header className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)]">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left: title + connection */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[16px] font-bold text-white shadow-sm"
              style={{ backgroundColor: "#3B82F6" }}
              title="ScrumAgents"
            >
              sA
            </div>
            <h1 className="text-base font-semibold text-[var(--text-primary)]">
              scrumAgents.
            </h1>
            <span className="text-sm text-[var(--text-muted)]">/</span>
            <span className="text-sm text-[var(--text-secondary)]">Scrum Board</span>
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
            <button className="px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-colors bg-[var(--bg-bubble-user)] text-[var(--text-bubble-user)] hover:opacity-80">
              Complete Sprint
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-[var(--bg-column)] transition-colors text-[var(--text-muted)]"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
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
          <div className="relative">
            <div
              className="flex -space-x-1.5 cursor-pointer"
              onClick={() => setShowAgentCaps((v) => !v)}
            >
              {AGENT_AVATARS.slice(0, Math.min(agentCount, 7)).map((agent, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-semibold text-white border-2 border-[var(--bg-card)] hover:z-10 hover:scale-110 transition-transform"
                  style={{ backgroundColor: agent.color, zIndex: agentCount - i }}
                  title={agent.name}
                >
                  {agent.label}
                </div>
              ))}
            </div>

            {/* Agent capabilities popup */}
            {showAgentCaps && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAgentCaps(false)} />
                <div className="absolute top-full left-0 mt-2 z-50 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-4 min-w-[620px]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Agent Capabilities</h3>
                    <button
                      onClick={() => setShowAgentCaps(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className="text-left py-2 pr-3 text-[var(--text-muted)] font-medium">Capability</th>
                        {AGENT_AVATARS.map((a) => (
                          <th key={a.label} className="text-center py-2 px-1">
                            <div className="flex flex-col items-center gap-1">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-semibold text-white"
                                style={{ backgroundColor: a.color }}
                              >
                                {a.label}
                              </div>
                              <span className="text-[10px] font-medium text-[var(--text-secondary)] whitespace-nowrap">{a.name}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CAPABILITIES.map((cap) => (
                        <tr key={cap.key} className="border-b border-[var(--border-subtle)]/50">
                          <td className="py-2 pr-3 text-[var(--text-secondary)] font-medium">{cap.label}</td>
                          {AGENT_AVATARS.map((a) => {
                            const has = AGENT_CAPS[a.label]?.includes(cap.key);
                            return (
                              <td key={a.label} className="text-center py-2 px-1">
                                {has ? (
                                  <span className="text-[var(--success)] text-[14px]">&#10003;</span>
                                ) : (
                                  <span className="text-[var(--text-muted)] opacity-30 text-[14px]">&#8212;</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
