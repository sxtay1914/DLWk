"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { ActivityEntry, Agent } from "@/lib/types";

interface ActivityLogProps {
  activities: ActivityEntry[];
  agents?: Agent[];
}

type ViewMode = "list" | "columns";

export default function ActivityLog({ activities, agents }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Auto-scroll to bottom on new entries (list mode)
  useEffect(() => {
    if (viewMode === "list" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities, viewMode]);

  const agentNames = Array.from(new Set(activities.map((a) => a.agent_name).filter(Boolean)));

  const filtered =
    filter === "all"
      ? activities
      : activities.filter((a) => a.agent_name === filter);

  // Group activities by agent for columns mode
  const agentColumns = useMemo(() => {
    const columns: Record<string, { agent_name: string; agent_color: string; entries: ActivityEntry[] }> = {};

    // Use agents prop for stable column order, fall back to activity-derived agents
    const agentList = agents && agents.length > 0
      ? agents
      : agentNames.map((name) => {
          const entry = activities.find((a) => a.agent_name === name);
          return { id: entry?.agent_id || name, name, color: entry?.agent_color || "#666" };
        });

    for (const agent of agentList) {
      columns[agent.id || agent.name] = {
        agent_name: agent.name,
        agent_color: agent.color,
        entries: [],
      };
    }

    for (const entry of activities) {
      const key = entry.agent_id || entry.agent_name;
      if (columns[key]) {
        columns[key].entries.push(entry);
      }
    }

    return Object.values(columns).filter((col) => col.entries.length > 0 || (agents && agents.length > 0));
  }, [activities, agents, agentNames]);

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
    <div className="flex flex-col rounded-xl bg-[var(--bg-column)] overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
          Activity
        </h3>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-[var(--bg-card)] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-[var(--bg-column)] text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("columns")}
              className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
                viewMode === "columns"
                  ? "bg-[var(--bg-column)] text-[var(--text-primary)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Columns
            </button>
          </div>

          {/* Filter (list mode only) */}
          {viewMode === "list" && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-[12px] bg-transparent border-none rounded-lg px-2 py-1 text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <option value="all">All agents</option>
              {agentNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* List mode */}
      {viewMode === "list" && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pb-3 space-y-0 max-h-[300px]"
        >
          {filtered.map((entry, index) => (
            <div
              key={entry.id}
              className={`flex items-start gap-2.5 py-2 fade-in ${
                index < filtered.length - 1 ? "border-b border-[var(--border-subtle)]" : ""
              }`}
            >
              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 mt-0.5 w-[56px]">
                {formatTime(entry.timestamp)}
              </span>
              <div
                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                style={{ backgroundColor: entry.agent_color }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
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
              <span className="text-[12px] text-[var(--text-muted)]">
                No activity yet
              </span>
            </div>
          )}
        </div>
      )}

      {/* Columns mode */}
      {viewMode === "columns" && (
        <div className="flex-1 overflow-x-auto px-2 pb-3">
          <div className="flex gap-2 min-w-max">
            {agentColumns.map((col) => (
              <AgentColumn
                key={col.agent_name}
                agentName={col.agent_name}
                agentColor={col.agent_color}
                entries={col.entries}
                formatTime={formatTime}
              />
            ))}

            {agentColumns.length === 0 && (
              <div className="flex items-center justify-center w-full py-8">
                <span className="text-[12px] text-[var(--text-muted)]">
                  No activity yet
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentColumn({
  agentName,
  agentColor,
  entries,
  formatTime,
}: {
  agentName: string;
  agentColor: string;
  entries: ActivityEntry[];
  formatTime: (ts: string) => string;
}) {
  const colRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (colRef.current) {
      colRef.current.scrollTop = colRef.current.scrollHeight;
    }
  }, [entries]);

  const hasRecent = entries.length > 0 &&
    Date.now() - new Date(entries[entries.length - 1].timestamp).getTime() < 30000;

  return (
    <div className="w-[200px] shrink-0 flex flex-col bg-[var(--bg-card)] rounded-xl overflow-hidden">
      {/* Agent header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-semibold text-white shrink-0"
          style={{ backgroundColor: agentColor }}
        >
          {agentName.charAt(0)}
        </div>
        <span className="text-[12px] font-medium text-[var(--text-primary)] truncate flex-1">
          {agentName}
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasRecent ? "bg-[var(--success)] animate-pulse" : "bg-[var(--text-muted)]"}`}
        />
      </div>

      {/* Entries */}
      <div
        ref={colRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 max-h-[250px]"
      >
        {entries.map((entry) => (
          <div key={entry.id} className="fade-in">
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {formatTime(entry.timestamp)}
            </span>
            <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
              {entry.message}
            </p>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <span className="text-[10px] text-[var(--text-muted)]">Idle</span>
          </div>
        )}
      </div>
    </div>
  );
}
