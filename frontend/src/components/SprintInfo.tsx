"use client";

import type { Sprint, Agent } from "@/lib/types";

interface SprintInfoProps {
  sprint: Sprint;
  agents: Agent[];
}

const statusDotColors: Record<string, string> = {
  idle: "#97a0af",
  working: "#22c55e",
  blocked: "#ef4444",
  reviewing: "#8b5cf6",
  offline: "#c1c7d0",
};

const statusLabels: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
  reviewing: "Reviewing",
  offline: "Offline",
};

export default function SprintInfo({ sprint, agents }: SprintInfoProps) {
  const progress =
    sprint.total_tasks > 0
      ? Math.round((sprint.completed_tasks / sprint.total_tasks) * 100)
      : 0;

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Sprint Info
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Sprint name + status */}
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {sprint.name}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 capitalize">
            Status: {sprint.status}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Progress
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {sprint.completed_tasks}/{sprint.total_tasks} tasks
            </span>
          </div>
          <div className="w-full h-2 bg-[var(--bg-column)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">
            {progress}%
          </p>
        </div>

        {/* Agent status list */}
        <div>
          <p className="text-[11px] text-[var(--text-secondary)] font-medium mb-2 uppercase tracking-wider">
            Team
          </p>
          <div className="space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="text-xs text-[var(--text-primary)] flex-1 truncate">
                  {agent.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        statusDotColors[agent.status] || statusDotColors.offline,
                    }}
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {statusLabels[agent.status] || agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
