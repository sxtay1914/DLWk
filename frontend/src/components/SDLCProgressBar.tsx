"use client";

import type { PhaseSnapshot, SDLCPhase } from "@/lib/types";

// ── Phase config ──────────────────────────────────────────────────────────────

interface PhaseConfig {
  key: SDLCPhase;
  label: string;
  color: string;
  icon: string;
}

const PHASES: PhaseConfig[] = [
  { key: "planning", label: "Planning", color: "#6366F1", icon: "📋" },
  { key: "design",   label: "Design",   color: "#8B5CF6", icon: "🎨" },
  { key: "build",    label: "Build",    color: "#22C55E", icon: "⚙️"  },
  { key: "test",     label: "Test",     color: "#F97316", icon: "🧪" },
  { key: "review",   label: "Review",   color: "#3B82F6", icon: "👁️"  },
  { key: "deploy",   label: "Deploy",   color: "#14B8A6", icon: "🚀" },
  { key: "maintain", label: "Maintain", color: "#94A3B8", icon: "🔧" },
];

const ARTIFACT_LABELS: Record<string, string> = {
  requirements_summary:  "REQ",
  acceptance_criteria:   "AC",
  impact_forecast:       "IMP",
  risk_register:         "RISK",
  task_backlog:          "TASKS",
  architecture_decision: "ARCH",
  code_file:             "CODE",
  command_output:        "CMD",
  build_log:             "BUILD",
  test_strategy:         "STRAT",
  test_case_suite:       "TC",
  bug_report:            "BUG",
  coverage_report:       "COV",
  qa_sign_off:           "QA-OK",
  review_checklist:      "CR-CHK",
  issue_log:             "ISSUES",
  review_decision:       "CR-DEC",
};

// ── Status helpers ────────────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case "in_progress":  return "⚡";
    case "gate_pending": return "⏸";
    case "approved":     return "✓";
    case "rejected":     return "✗";
    case "complete":     return "✓";
    default:             return "○";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "in_progress":  return "Active";
    case "gate_pending": return "Gate";
    case "approved":     return "Done";
    case "rejected":     return "Blocked";
    case "complete":     return "Done";
    default:             return "";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  snapshots: PhaseSnapshot[];
  onPhaseClick: (phase: SDLCPhase) => void;
}

export default function SDLCProgressBar({ snapshots, onPhaseClick }: Props) {
  const snapshotMap = Object.fromEntries(snapshots.map((s) => [s.phase, s]));

  // Find the active / furthest phase
  const activePhaseKey = snapshots.find(
    (s) => s.status === "in_progress" || s.status === "gate_pending"
  )?.phase;

  const totalEvents = snapshots.reduce((sum, s) => sum + s.event_count, 0);
  const doneCount = snapshots.filter(
    (s) => s.status === "approved" || s.status === "complete"
  ).length;
  const activeCount = snapshots.filter(
    (s) => s.status !== "not_started"
  ).length;

  return (
    <div
      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            SDLC Progress
          </span>
          {totalEvents > 0 && (
            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-column)] px-1.5 py-0.5 rounded-full">
              {totalEvents} events
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {activeCount > 0 ? `${doneCount}/${PHASES.length} phases complete` : "Waiting for first task"}
        </div>
      </div>

      {/* Phase segments */}
      <div className="flex items-stretch px-3 py-3 gap-1">
        {PHASES.map((phase, idx) => {
          const snap = snapshotMap[phase.key];
          const status = snap?.status ?? "not_started";
          const isActive = phase.key === activePhaseKey;
          const isGate = status === "gate_pending";
          const isDone = status === "approved" || status === "complete";
          const isStarted = status !== "not_started";

          return (
            <div key={phase.key} className="flex items-center flex-1 min-w-0">
              {/* Phase pill */}
              <button
                onClick={() => isStarted ? onPhaseClick(phase.key) : undefined}
                disabled={!isStarted}
                className={[
                  "flex-1 min-w-0 rounded-lg px-2 py-2 text-left transition-all",
                  "border",
                  isStarted ? "cursor-pointer hover:shadow-sm hover:scale-[1.02]" : "cursor-default",
                  isGate
                    ? "border-[var(--border-subtle)]"
                    : isActive
                    ? "border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm"
                    : isDone
                    ? "border-[var(--border-subtle)] bg-[var(--bg-column)]"
                    : "border-dashed border-[var(--border-subtle)] bg-[var(--bg-column)]/50",
                ].join(" ")}
                style={isGate ? { backgroundColor: "rgba(245,158,11,0.12)" } : undefined}
                title={
                  isStarted
                    ? `${phase.label}: ${snap?.event_count ?? 0} events · click for detail`
                    : `${phase.label}: not started`
                }
              >
                {/* Top row: icon + status chip */}
                <div className="flex items-center justify-between mb-1 gap-1">
                  <span
                    className={[
                      "text-xs font-semibold flex items-center gap-1 truncate",
                      isStarted ? "opacity-100" : "opacity-30",
                    ].join(" ")}
                    style={{ color: isStarted ? phase.color : undefined }}
                  >
                    <span>{phase.icon}</span>
                    <span className="truncate hidden sm:inline">{phase.label}</span>
                  </span>

                  {isStarted && (
                    <span
                      className={[
                        "text-[9px] font-bold px-1 rounded flex-shrink-0",
                        isGate
                          ? "text-[var(--text-primary)]"
                          : isActive
                          ? "text-white"
                          : isDone
                          ? "text-white"
                          : "bg-[var(--border-color)] text-[var(--text-muted)]",
                      ].join(" ")}
                      style={
                        isGate
                          ? { backgroundColor: "rgba(245,158,11,0.25)" }
                          : isActive
                          ? { backgroundColor: phase.color }
                          : isDone
                          ? { backgroundColor: phase.color + "cc" }
                          : {}
                      }
                    >
                      {isGate ? "⏸ GATE" : statusIcon(status) + " " + statusLabel(status)}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                {isStarted && snap && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {snap.event_count}ev
                    </span>
                    {snap.risk_flags.length > 0 && (
                      <span className="text-[9px] text-amber-600 font-medium">
                        ⚠ {snap.risk_flags.slice(0, 2).join(",")}
                      </span>
                    )}
                    {snap.artifact_types.slice(0, 2).map((a) => (
                      <span
                        key={a}
                        className="text-[8px] px-1 rounded text-white font-medium"
                        style={{ backgroundColor: phase.color + "99" }}
                      >
                        {ARTIFACT_LABELS[a] ?? a.toUpperCase().slice(0, 4)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Agent avatars */}
                {isStarted && snap && snap.agent_names.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-1">
                    {snap.agent_names.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="text-[8px] text-[var(--text-muted)] truncate"
                      >
                        {name.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {/* Connector arrow between phases */}
              {idx < PHASES.length - 1 && (
                <div
                  className={[
                    "flex-shrink-0 w-4 h-px mx-0.5",
                    isStarted ? "bg-[var(--border-color)]" : "border-t border-dashed border-[var(--border-subtle)]",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
