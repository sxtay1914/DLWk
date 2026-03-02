"use client";

import { useEffect } from "react";
import type { SDLCEvent, SDLCPhase, Task } from "@/lib/types";

// ── Config ────────────────────────────────────────────────────────────────────

const PHASE_META: Record<SDLCPhase, { label: string; color: string; icon: string }> = {
  planning: { label: "Planning",  color: "#6366F1", icon: "📋" },
  design:   { label: "Design",    color: "#8B5CF6", icon: "🎨" },
  build:    { label: "Build",     color: "#22C55E", icon: "⚙️"  },
  test:     { label: "Test",      color: "#F97316", icon: "🧪" },
  review:   { label: "Review",    color: "#3B82F6", icon: "👁️"  },
  deploy:   { label: "Deploy",    color: "#14B8A6", icon: "🚀" },
  maintain: { label: "Maintain",  color: "#94A3B8", icon: "🔧" },
};

const PHASE_ORDER: SDLCPhase[] = ["planning", "design", "build", "test", "review", "deploy", "maintain"];

const ARTIFACT_LABELS: Record<string, string> = {
  requirements_summary:  "REQ",
  acceptance_criteria:   "AC",
  task_backlog:          "TASK",
  risk_register:         "RISK",
  code_file:             "CODE",
  command_output:        "CMD",
  build_log:             "BUILD",
  test_strategy:         "STRAT",
  test_case_suite:       "TC",
  bug_report:            "BUG",
  coverage_report:       "COV",
  qa_sign_off:           "QA-OK",
  review_checklist:      "CR",
  review_decision:       "CR-DEC",
};

const SIZE_LABELS: Record<string, string> = {
  S: "Small < 4h",
  M: "Medium 4–16h",
  L: "Large > 16h",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function OutcomeBadge({ outcome, severity }: { outcome: string; severity: string }) {
  if (outcome === "blocked" || severity === "critical")
    return <span className="text-[9px] text-red-600 font-bold">⊗ BLOCKED</span>;
  if (outcome === "pending" || severity === "gate")
    return <span className="text-[9px] text-amber-600 font-bold">⏸ GATE</span>;
  if (outcome === "success")
    return <span className="text-[9px] text-green-600">✓</span>;
  return null;
}

// ── DoD Checklist ─────────────────────────────────────────────────────────────

function DoDChecklist({
  dod,
  events,
}: {
  dod: string;
  events: SDLCEvent[];
}) {
  const items = dod
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  // A DoD item is considered "blocked" if a bug report's reasoning mentions it
  const blockedItems = new Set<string>();
  for (const evt of events) {
    if (evt.artifact_type === "bug_report" && evt.outcome === "blocked") {
      items.forEach((item) => {
        if (evt.reasoning_summary.toLowerCase().includes(item.toLowerCase().slice(0, 20))) {
          blockedItems.add(item);
        }
      });
    }
  }

  // A DoD item is "done" if all tests pass and no bugs block it
  const hasSignOff = events.some((e) => e.artifact_type === "qa_sign_off" && e.outcome === "success");
  const hasApprovedReview = events.some((e) => e.artifact_type === "review_decision" && e.outcome === "success");

  return (
    <div className="space-y-1">
      {items.map((item, i) => {
        const isBlocked = blockedItems.has(item);
        const isDone = !isBlocked && (hasSignOff || hasApprovedReview);
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span
              className={[
                "flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] font-bold mt-0.5",
                isBlocked
                  ? "border-red-400 bg-red-50 text-red-600"
                  : isDone
                  ? "border-green-400 bg-green-50 text-green-600"
                  : "border-gray-300 bg-white text-transparent",
              ].join(" ")}
            >
              {isBlocked ? "✗" : isDone ? "✓" : ""}
            </span>
            <span
              className={[
                "text-[11px] leading-snug",
                isBlocked ? "text-red-600 line-through" : isDone ? "text-green-700" : "text-[var(--text-primary)]",
              ].join(" ")}
            >
              {item}
              {isBlocked && (
                <span className="ml-1 text-[9px] text-red-500 no-underline">← Bug</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  task: Task;
  events: SDLCEvent[];
  artifactsByPhase: Record<string, unknown[]>;
  loading: boolean;
  onClose: () => void;
}

export default function TaskActivityPanel({ task, events, loading, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Group events by phase
  const byPhase: Partial<Record<SDLCPhase, SDLCEvent[]>> = {};
  for (const evt of events) {
    if (!byPhase[evt.phase]) byPhase[evt.phase] = [];
    byPhase[evt.phase]!.push(evt);
  }

  const phasesPresent = PHASE_ORDER.filter((p) => byPhase[p] && byPhase[p]!.length > 0);
  const riskTags = task.risk_tags ? task.risk_tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                {task.title}
              </h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[9px] text-[var(--text-muted)] font-mono">{task.id}</span>
                {task.priority && (
                  <span
                    className={[
                      "text-[9px] font-bold px-1.5 rounded",
                      task.priority === "P0" ? "bg-red-100 text-red-700" :
                      task.priority === "P1" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600",
                    ].join(" ")}
                  >
                    {task.priority}
                  </span>
                )}
                {task.estimated_size && (
                  <span className="text-[9px] text-[var(--text-muted)]" title={SIZE_LABELS[task.estimated_size]}>
                    {task.estimated_size}
                  </span>
                )}
                {task.sdlc_stage && (
                  <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 rounded capitalize">
                    {task.sdlc_stage}
                  </span>
                )}
                {riskTags.map((r) => (
                  <span key={r} className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded font-medium">
                    ⚠ {r}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
              Loading activity…
            </div>
          ) : (
            <div className="px-5 py-4 space-y-5">
              {/* ── Definition of Done ─────────────────────────────── */}
              {task.definition_of_done && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Definition of Done
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 border border-[var(--border-subtle)]">
                    <DoDChecklist dod={task.definition_of_done} events={events} />
                  </div>
                </div>
              )}

              {/* ── Dependencies ──────────────────────────────────── */}
              {task.dependencies && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Dependencies
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{task.dependencies}</p>
                </div>
              )}

              {/* ── Phase sections ──────────────────────────────────── */}
              {phasesPresent.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] text-sm py-8">
                  No SDLC events recorded for this task yet.
                </div>
              ) : (
                phasesPresent.map((phase) => {
                  const meta = PHASE_META[phase];
                  const phaseEvts = byPhase[phase]!;
                  const hasBlock = phaseEvts.some((e) => e.outcome === "blocked");
                  const hasGate = phaseEvts.some((e) => e.is_phase_gate);

                  return (
                    <div key={phase}>
                      {/* Phase header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{ backgroundColor: meta.color + "22", color: meta.color }}
                        >
                          {meta.icon}
                        </span>
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        {hasBlock && (
                          <span className="text-[9px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">
                            ⊗ Blocked
                          </span>
                        )}
                        {hasGate && !hasBlock && (
                          <span className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                            ⏸ Gate
                          </span>
                        )}
                        {!hasBlock && !hasGate && phaseEvts.length > 0 && (
                          <span className="text-[9px] text-green-600 font-medium">✓</span>
                        )}
                        <span className="text-[9px] text-[var(--text-muted)] ml-auto">
                          {phaseEvts.length} event{phaseEvts.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Events in this phase */}
                      <div className="ml-6 space-y-2 border-l-2 pl-3" style={{ borderColor: meta.color + "44" }}>
                        {phaseEvts.map((evt) => (
                          <div key={evt.event_id} className="relative">
                            {/* Timeline dot */}
                            <span
                              className="absolute -left-[17px] top-1 w-2 h-2 rounded-full border-2 bg-white"
                              style={{ borderColor: meta.color }}
                            />

                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                {/* Agent + time */}
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span
                                    className="w-3.5 h-3.5 rounded-full text-[7px] text-white flex items-center justify-center font-bold flex-shrink-0"
                                    style={{ backgroundColor: evt.agent_color }}
                                  >
                                    {evt.agent_name.charAt(0)}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-muted)]">{evt.agent_name}</span>
                                  {evt.artifact_type && (
                                    <span
                                      className="text-[8px] px-1 rounded text-white font-semibold"
                                      style={{ backgroundColor: meta.color + "99" }}
                                    >
                                      {ARTIFACT_LABELS[evt.artifact_type] ?? evt.artifact_type}
                                    </span>
                                  )}
                                </div>
                                {/* Summary */}
                                <p className="text-[11px] text-[var(--text-primary)] leading-snug">
                                  {evt.summary}
                                </p>
                                {/* Reasoning */}
                                {evt.reasoning_summary && evt.reasoning_summary !== evt.summary && evt.reasoning_summary.length > 15 && (
                                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug line-clamp-2">
                                    {evt.reasoning_summary}
                                  </p>
                                )}
                                {/* Artifact ref */}
                                {evt.artifact_ref && (
                                  <p className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5 truncate">
                                    → {evt.artifact_ref}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <OutcomeBadge outcome={evt.outcome} severity={evt.severity} />
                                <span className="text-[9px] text-[var(--text-muted)]">{fmtTime(evt.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
