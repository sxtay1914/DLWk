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
    <div className="rounded-lg border-2 border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 space-y-3 fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: checkpoint.agent_color }}
        >
          {checkpoint.agent_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {checkpoint.agent_name}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
              Checkpoint
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Completed work on <span className="font-medium text-[var(--text-primary)]">{checkpoint.task_title}</span>
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] rounded-md p-2.5 border border-[var(--border-color)]">
        {checkpoint.message}
      </div>

      {/* Proposed next step */}
      <p className="text-[10px] text-[var(--text-muted)]">
        Next stage: <span className="font-medium">{STATUS_LABELS[checkpoint.next_status] || checkpoint.next_status}</span>
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
          className="w-full px-3 py-2 text-xs bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
        />
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onRespond(checkpoint.id, "approve")}
          className="px-3 py-1.5 text-[11px] font-medium bg-[var(--success)] text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          Approve
        </button>
        <button
          onClick={handleRequestChanges}
          className="px-3 py-1.5 text-[11px] font-medium bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 rounded-lg hover:bg-[var(--warning)]/20 transition-colors"
        >
          Request Changes
        </button>
        <button
          onClick={() => onRespond(checkpoint.id, "pause")}
          className="px-3 py-1.5 text-[11px] font-medium bg-[var(--text-muted)]/10 text-[var(--text-muted)] border border-[var(--text-muted)]/20 rounded-lg hover:bg-[var(--text-muted)]/20 transition-colors"
        >
          Pause
        </button>
      </div>
    </div>
  );
}
