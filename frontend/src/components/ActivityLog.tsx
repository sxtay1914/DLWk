"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivityEntry } from "@/lib/types";

interface ActivityLogProps {
  activities: ActivityEntry[];
}

const typeColors: Record<string, string> = {
  info: "var(--text-secondary)",
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--error)",
};

export default function ActivityLog({ activities }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("all");

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  // Get unique agent names for filter
  const agentNames = Array.from(new Set(activities.map((a) => a.agent_name).filter(Boolean)));

  const filtered =
    filter === "all"
      ? activities
      : activities.filter((a) => a.agent_name === filter);

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Activity Log
        </h3>

        {/* Agent filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-[11px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="all">All agents</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-0 max-h-[300px]"
      >
        {filtered.map((entry, index) => (
          <div
            key={entry.id}
            className={`flex items-start gap-2 py-2.5 fade-in ${
              index < filtered.length - 1 ? "border-b border-[var(--border-color)]" : ""
            }`}
          >
            {/* Timestamp */}
            <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 mt-0.5 w-[60px]">
              {formatTime(entry.timestamp)}
            </span>

            {/* Agent dot */}
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
              style={{ backgroundColor: entry.agent_color }}
            />

            {/* Message */}
            <div className="flex-1 min-w-0">
              <span
                className="text-xs leading-relaxed"
                style={{ color: typeColors[entry.type] || typeColors.info }}
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {entry.agent_name}
                </span>{" "}
                {entry.message}
              </span>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--text-muted)]">
              No activity yet
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
