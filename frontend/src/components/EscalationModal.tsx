"use client";

import type { Escalation } from "@/lib/types";

interface EscalationModalProps {
  escalation: Escalation;
  onRespond: (action: "approve" | "reject" | "investigate" | "skip") => void;
  onDismiss: () => void;
}

export default function EscalationModal({
  escalation,
  onRespond,
  onDismiss,
}: EscalationModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="slide-up w-full max-w-lg mx-4 bg-white rounded-2xl overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--error)] pulse-red" />
            </div>
            <div>
              <h2 className="text-[14px] font-medium text-[var(--text-primary)]">
                Escalation
              </h2>
              <span className="text-[11px] text-[var(--text-muted)] capitalize">
                {escalation.severity} severity
              </span>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="p-2 rounded-full hover:bg-[var(--bg-column)] transition-colors text-[var(--text-muted)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-[14px] font-medium text-[var(--text-primary)] mb-1">
              {escalation.title}
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {escalation.description}
            </p>
          </div>

          {/* Recommendation */}
          <div className="bg-[var(--bg-column)] rounded-xl p-3.5">
            <p className="text-[11px] text-[var(--text-muted)] font-medium mb-1.5">
              Recommendation
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {escalation.recommendation}
            </p>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span>
              From{" "}
              <span className="font-medium text-[var(--text-secondary)]">
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
        <div className="flex items-center gap-2 px-5 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => onRespond("approve")}
            className="flex-1 px-4 py-2 text-[13px] font-medium bg-[var(--success)] text-white rounded-full hover:opacity-90 transition-opacity"
          >
            Approve
          </button>
          <button
            onClick={() => onRespond("investigate")}
            className="flex-1 px-4 py-2 text-[13px] font-medium border border-[var(--border-color)] text-[var(--text-secondary)] rounded-full hover:bg-[var(--bg-column)] transition-colors"
          >
            Investigate
          </button>
          <button
            onClick={() => onRespond("skip")}
            className="px-4 py-2 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
