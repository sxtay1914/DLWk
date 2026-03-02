"use client";

import { useEffect } from "react";
import type { PhaseSnapshot, SDLCEvent, SDLCPhase } from "@/lib/types";

// ── Phase config ──────────────────────────────────────────────────────────────

const PHASE_META: Record<SDLCPhase, { label: string; color: string; icon: string }> = {
  planning: { label: "Planning",  color: "#6366F1", icon: "📋" },
  design:   { label: "Design",    color: "#8B5CF6", icon: "🎨" },
  build:    { label: "Build",     color: "#22C55E", icon: "⚙️"  },
  test:     { label: "Test",      color: "#F97316", icon: "🧪" },
  review:   { label: "Review",    color: "#3B82F6", icon: "👁️"  },
  deploy:   { label: "Deploy",    color: "#14B8A6", icon: "🚀" },
  maintain: { label: "Maintain",  color: "#94A3B8", icon: "🔧" },
};

const ARTIFACT_LABELS: Record<string, string> = {
  requirements_summary:  "REQ",
  acceptance_criteria:   "AC",
  impact_forecast:       "IMP",
  risk_register:         "RISK",
  task_backlog:          "TASK",
  architecture_decision: "ARCH",
  code_file:             "CODE",
  command_output:        "CMD",
  build_log:             "BUILD",
  test_strategy:         "STRAT",
  test_case_suite:       "TC",
  bug_report:            "BUG",
  coverage_report:       "COV",
  qa_sign_off:           "QA-OK",
  review_checklist:      "CR",
  issue_log:             "ISSUE",
  review_decision:       "CR-DEC",
};

function artifactColor(type: string, phaseColor: string): string {
  if (type === "bug_report") return "#EF4444";
  if (type === "qa_sign_off") return "#22C55E";
  if (type === "review_decision") return "#3B82F6";
  return phaseColor;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    info:     "bg-gray-400",
    warning:  "bg-amber-400",
    critical: "bg-red-500",
    gate:     "bg-amber-500",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${colors[severity] ?? "bg-gray-400"}`} />;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "success")   return <span className="text-[9px] text-green-600 font-semibold">✓</span>;
  if (outcome === "blocked")   return <span className="text-[9px] text-red-500 font-semibold">⊗ BLOCKED</span>;
  if (outcome === "pending")   return <span className="text-[9px] text-amber-500 font-semibold">⏸ GATE</span>;
  if (outcome === "escalated") return <span className="text-[9px] text-orange-500 font-semibold">⚡ ESC</span>;
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  phase: SDLCPhase;
  snapshot: PhaseSnapshot | null;
  events: SDLCEvent[];
  loading: boolean;
  onClose: () => void;
  onDecideGate?: (gateEventId: string, decision: "approved" | "rejected") => void;
}

export default function PhaseDetailPanel({
  phase,
  snapshot,
  events,
  loading,
  onClose,
  onDecideGate,
}: Props) {
  const meta = PHASE_META[phase];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Group events by artifact type for the summary section
  const byArtifact: Record<string, SDLCEvent[]> = {};
  for (const evt of events) {
    if (evt.artifact_type) {
      byArtifact[evt.artifact_type] = byArtifact[evt.artifact_type] ?? [];
      byArtifact[evt.artifact_type].push(evt);
    }
  }

  const gateEvent = events.find((e) => e.is_phase_gate && !e.gate_decision);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-white z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]"
          style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.icon}</span>
            <div>
              <h2 className="text-sm font-bold" style={{ color: meta.color }}>
                {meta.label} Phase
              </h2>
              {snapshot && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  {snapshot.event_count} events ·{" "}
                  {snapshot.agent_names.join(", ")} ·{" "}
                  {snapshot.risk_flags.length > 0 && (
                    <span className="text-amber-600">⚠ {snapshot.risk_flags.join(", ")}</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
              Loading events…
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
              No events recorded for this phase yet.
            </div>
          ) : (
            <>
              {/* ── Gate decision banner ─────────────────────────────── */}
              {gateEvent && onDecideGate && (
                <div className="mx-4 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs font-semibold text-amber-800 mb-1">⏸ Phase Gate — Human Decision Required</p>
                  <p className="text-[11px] text-amber-700 mb-3">{gateEvent.reasoning_summary}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onDecideGate(gateEvent.event_id, "approved")}
                      className="flex-1 text-xs py-1.5 rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => onDecideGate(gateEvent.event_id, "rejected")}
                      className="flex-1 text-xs py-1.5 rounded-md bg-red-100 text-red-700 font-semibold hover:bg-red-200 transition-colors"
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>
              )}

              {/* ── Artifacts produced ───────────────────────────────── */}
              {Object.keys(byArtifact).length > 0 && (
                <div className="px-4 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Artifacts Produced
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {Object.entries(byArtifact).map(([type, evts]) => (
                      <span
                        key={type}
                        className="text-[10px] text-white font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: artifactColor(type, meta.color) + "dd" }}
                        title={`${evts.length} event(s)`}
                      >
                        {ARTIFACT_LABELS[type] ?? type} {evts.length > 1 ? `×${evts.length}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Risk flags ───────────────────────────────────────── */}
              {snapshot && snapshot.risk_flags.length > 0 && (
                <div className="px-4 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">
                    ⚠ Risk Flags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {snapshot.risk_flags.map((f) => (
                      <span key={f} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Divider ──────────────────────────────────────────── */}
              <div className="border-t border-[var(--border-subtle)] mx-4 mb-2" />

              {/* ── Timeline ─────────────────────────────────────────── */}
              <div className="px-4 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Phase Timeline
                </p>
                <div className="space-y-3">
                  {events.map((evt, idx) => (
                    <div key={evt.event_id} className="flex gap-2.5">
                      {/* Timeline spine */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <SeverityDot severity={evt.severity} />
                        {idx < events.length - 1 && (
                          <div className="w-px flex-1 min-h-[12px] bg-gray-200 mt-1" />
                        )}
                      </div>

                      {/* Event content */}
                      <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Agent dot */}
                            <span
                              className="flex-shrink-0 w-4 h-4 rounded-full text-[8px] text-white flex items-center justify-center font-bold"
                              style={{ backgroundColor: evt.agent_color }}
                            >
                              {evt.agent_name.charAt(0)}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                              {evt.agent_name}
                            </span>
                            {evt.artifact_type && (
                              <span
                                className="text-[8px] text-white px-1 rounded font-semibold flex-shrink-0"
                                style={{ backgroundColor: artifactColor(evt.artifact_type, meta.color) + "cc" }}
                              >
                                {ARTIFACT_LABELS[evt.artifact_type] ?? evt.artifact_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <OutcomeBadge outcome={evt.outcome} />
                            <span className="text-[9px] text-[var(--text-muted)]">{fmtTime(evt.timestamp)}</span>
                          </div>
                        </div>

                        {/* Summary */}
                        <p className="text-[11px] text-[var(--text-primary)] leading-snug">
                          {evt.summary}
                        </p>

                        {/* Reasoning */}
                        {evt.reasoning_summary && evt.reasoning_summary.length > 10 && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug line-clamp-3">
                            {evt.reasoning_summary}
                          </p>
                        )}

                        {/* Artifact ref */}
                        {evt.artifact_ref && (
                          <p className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">
                            → {evt.artifact_ref}
                          </p>
                        )}

                        {/* Risk flags */}
                        {evt.risk_flags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {evt.risk_flags.map((f) => (
                              <span key={f} className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
