"use client";

import { useState } from "react";
import type { Checkpoint } from "@/lib/types";

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  onRespond: (
    checkpointId: string,
    action: "approve" | "request_changes" | "pause",
    feedback?: string
  ) => void;
}

const STATUS_LABELS: Record<string, string> = {
  review: "Review",
  testing: "Testing",
  done: "Done",
};

export default function CheckpointCard({ checkpoint, onRespond }: CheckpointCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleRequestChanges = () => {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    if (feedback.trim()) {
      onRespond(checkpoint.id, "request_changes", feedback.trim());
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--bg-column)] p-4 space-y-3 fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
          style={{ backgroundColor: checkpoint.agent_color }}
        >
          {checkpoint.agent_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {checkpoint.agent_name}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--success)]/10 text-[var(--success)] font-medium">
              Checkpoint
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
            Completed work on <span className="font-medium text-[var(--text-primary)]">{checkpoint.task_title}</span>
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="text-[12px] text-[var(--text-secondary)] bg-[var(--bg-card)] rounded-xl p-3 leading-relaxed">
        {checkpoint.message}
      </div>

      {/* Proposed next step */}
      <p className="text-[11px] text-[var(--text-muted)]">
        Next: <span className="font-medium">{STATUS_LABELS[checkpoint.next_status] || checkpoint.next_status}</span>
      </p>

      {/* Feedback input */}
      {showFeedback && (
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && feedback.trim()) {
              onRespond(checkpoint.id, "request_changes", feedback.trim());
            }
          }}
          placeholder="Describe what needs to change..."
          autoFocus
          className="w-full px-4 py-2.5 text-[13px] bg-[var(--bg-card)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-2 focus:ring-[var(--text-muted)]/20 transition-all"
        />
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRespond(checkpoint.id, "approve")}
          className="px-4 py-1.5 text-[12px] font-medium bg-[var(--success)] text-white rounded-full hover:opacity-90 transition-opacity"
        >
          Approve
        </button>
        <button
          onClick={handleRequestChanges}
          className="px-4 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border-color)] rounded-full hover:bg-[var(--bg-card-hover)] transition-colors"
        >
          Request Changes
        </button>
        <button
          onClick={() => onRespond(checkpoint.id, "pause")}
          className="px-4 py-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Pause
        </button>
      </div>
    </div>
  );
}
