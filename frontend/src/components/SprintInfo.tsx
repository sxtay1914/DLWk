"use client";

import type { Sprint, Agent } from "@/lib/types";

interface SprintInfoProps {
  sprint: Sprint;
  agents: Agent[];
}

const statusDotColors: Record<string, string> = {
  idle: "#acacbe",
  working: "#10a37f",
  thinking: "#6e6e80",
  meeting: "#f59e0b",
  celebrating: "#8b5cf6",
};

const statusLabels: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  thinking: "Thinking",
  meeting: "In Meeting",
  celebrating: "Celebrating",
};

export default function SprintInfo({ sprint, agents }: SprintInfoProps) {
  const progress =
    sprint.total_tasks > 0
      ? Math.round((sprint.completed_tasks / sprint.total_tasks) * 100)
      : 0;

  return (
    <div className="flex flex-col rounded-xl bg-[var(--bg-column)] overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 py-3">
        <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
          Sprint
        </h3>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Sprint name + status */}
        <div>
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            {sprint.name}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 capitalize">
            {sprint.status}
          </p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Progress
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
              {sprint.completed_tasks}/{sprint.total_tasks}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--success)] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right tabular-nums">
            {progress}%
          </p>
        </div>

        {/* Agent status list */}
        <div>
          <p className="text-[11px] text-[var(--text-muted)] font-medium mb-2">
            Team
          </p>
          <div className="space-y-0.5">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="text-[12px] text-[var(--text-primary)] flex-1 truncate">
                  {agent.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        statusDotColors[agent.status] || statusDotColors.idle,
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
