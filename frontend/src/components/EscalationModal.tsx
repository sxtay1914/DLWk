"use client";

import type { Escalation } from "@/lib/types";

interface EscalationModalProps {
  escalation: Escalation;
  onRespond: (action: "approve" | "reject" | "investigate" | "skip") => void;
  onDismiss: () => void;
}

const severityColors: Record<string, string> = {
  low: "var(--text-muted)",
  medium: "var(--warning)",
  high: "var(--error)",
  critical: "#dc2626",
};

export default function EscalationModal({
  escalation,
  onRespond,
  onDismiss,
}: EscalationModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="slide-up w-full max-w-lg mx-4 bg-[var(--bg-card)] border border-[var(--error)]/30 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header with pulsing red dot */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--error)]/20 bg-[var(--error)]/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-[var(--error)] pulse-red" />
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-[var(--error)] opacity-50 animate-ping" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--error)]">
                Boss Escalation
              </h2>
              <span
                className="text-[10px] uppercase tracking-wider font-medium"
                style={{
                  color: severityColors[escalation.severity] || severityColors.medium,
                }}
              >
                {escalation.severity} severity
              </span>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              {escalation.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {escalation.description}
            </p>
          </div>

          {/* Boss recommendation */}
          <div className="bg-[var(--bg-column)] border border-[var(--border-color)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium mb-1.5">
              Boss Recommendation
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {escalation.recommendation}
            </p>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
            <span>
              Raised by:{" "}
              <span className="text-[var(--warning)] font-medium">
                {escalation.agent_name}
              </span>
            </span>
            <span>
              {new Date(escalation.created_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-[var(--border-color)] bg-[var(--bg-column)]">
          <button
            onClick={() => onRespond("approve")}
            className="flex-1 px-3 py-2 text-xs font-medium bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20 rounded-lg hover:bg-[var(--success)]/20 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onRespond("investigate")}
            className="flex-1 px-3 py-2 text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 rounded-lg hover:bg-[var(--accent)]/20 transition-colors"
          >
            Investigate
          </button>
          <button
            onClick={() => onRespond("skip")}
            className="flex-1 px-3 py-2 text-xs font-medium bg-[var(--bg-card-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-column)] transition-colors"
          >
            Skip
          </button>
          <button
            onClick={() => onRespond("reject")}
            className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
