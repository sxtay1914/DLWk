"use client";

import { useState } from "react";
import type { PendingFileChange } from "@/lib/types";

interface FileChangeReviewProps {
  fileChanges: PendingFileChange[];
  onRespond: (changeId: string, action: "approve" | "reject", feedback?: string) => void;
}

function computeDiff(oldText: string, newText: string): { type: "same" | "add" | "remove"; line: string }[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: { type: "same" | "add" | "remove"; line: string }[] = [];

  // Simple line-by-line diff (LCS-based would be better but this is sufficient)
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "same", line: oldLines[oi] });
      oi++;
      ni++;
    } else if (oi < oldLines.length && !newSet.has(oldLines[oi])) {
      result.push({ type: "remove", line: oldLines[oi] });
      oi++;
    } else if (ni < newLines.length && !oldSet.has(newLines[ni])) {
      result.push({ type: "add", line: newLines[ni] });
      ni++;
    } else if (oi < oldLines.length) {
      result.push({ type: "remove", line: oldLines[oi] });
      oi++;
    } else {
      result.push({ type: "add", line: newLines[ni] });
      ni++;
    }
  }

  return result;
}

function FileChangeDiff({ change }: { change: PendingFileChange }) {
  if (change.change_type === "create") {
    // New file — show all lines as additions
    const lines = change.new_content.split("\n");
    return (
      <div className="font-mono text-[11px] leading-[18px] overflow-x-auto max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-[#1a1a2e] rounded-md border-2 border-gray-200 dark:border-gray-700">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-10 text-right pr-2 text-gray-500 dark:text-gray-400 select-none border-r-2 border-gray-200 dark:border-gray-700 bg-green-100 dark:bg-green-950/30">
              {i + 1}
            </span>
            <span className="pl-2 whitespace-pre bg-green-100 dark:bg-green-950/20 text-green-900 dark:text-green-300 flex-1">
              + {line}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Edit — show diff
  const diff = computeDiff(change.old_content || "", change.new_content);
  return (
    <div className="font-mono text-[11px] leading-[18px] overflow-x-auto max-h-[400px] overflow-y-auto bg-gray-50 dark:bg-[#1a1a2e] rounded-md border-2 border-gray-200 dark:border-gray-700">
      {diff.map((d, i) => (
        <div
          key={i}
          className={`flex ${
            d.type === "add"
              ? "bg-green-100 dark:bg-green-950/20"
              : d.type === "remove"
              ? "bg-red-100 dark:bg-red-950/20"
              : ""
          }`}
        >
          <span className={`w-10 text-right pr-2 select-none border-r-2 border-gray-200 dark:border-gray-700 ${
            d.type === "add"
              ? "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/30"
              : d.type === "remove"
              ? "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/30"
              : "text-gray-500 dark:text-gray-400"
          }`}>
            {i + 1}
          </span>
          <span
            className={`pl-2 whitespace-pre flex-1 ${
              d.type === "add"
                ? "text-green-900 dark:text-green-300"
                : d.type === "remove"
                ? "text-red-900 dark:text-red-300"
                : "text-gray-800 dark:text-gray-200"
            }`}
          >
            {d.type === "add" ? "+ " : d.type === "remove" ? "- " : "  "}
            {d.line}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function FileChangeReview({ fileChanges, onRespond }: FileChangeReviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  if (fileChanges.length === 0) return null;

  return (
    <section className="space-y-3 p-4 rounded-xl border-2 border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/10">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: "#8B5CF6" }}
        >
          {fileChanges.length}
        </span>
        File Changes Pending Review
      </h3>

      {fileChanges.map((change) => (
        <div
          key={change.id}
          className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden shadow-sm"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-column)] transition-colors"
            onClick={() => setExpandedId(expandedId === change.id ? null : change.id)}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                  change.change_type === "create"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {change.change_type === "create" ? "NEW" : "EDIT"}
              </span>
              <span className="text-[12px] font-mono font-medium text-[var(--text-primary)]">
                {change.filename}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                by {change.agent_name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRespond(change.id, "approve");
                }}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (showRejectInput === change.id) {
                    onRespond(change.id, "reject", rejectFeedback[change.id] || "");
                    setShowRejectInput(null);
                  } else {
                    setShowRejectInput(change.id);
                  }
                }}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
              <svg
                className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                  expandedId === change.id ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Description */}
          {change.description && (
            <div className="px-4 pb-2 text-[11px] text-[var(--text-muted)]">
              {change.description}
            </div>
          )}

          {/* Reject feedback input */}
          {showRejectInput === change.id && (
            <div className="px-4 pb-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Reason for rejection (optional)..."
                value={rejectFeedback[change.id] || ""}
                onChange={(e) =>
                  setRejectFeedback((prev) => ({ ...prev, [change.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRespond(change.id, "reject", rejectFeedback[change.id] || "");
                    setShowRejectInput(null);
                  }
                }}
                className="flex-1 px-3 py-1.5 text-[11px] rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-red-500"
                autoFocus
              />
              <button
                onClick={() => {
                  onRespond(change.id, "reject", rejectFeedback[change.id] || "");
                  setShowRejectInput(null);
                }}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowRejectInput(null)}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md border border-[var(--border-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Expandable diff */}
          {expandedId === change.id && (
            <div className="px-4 pb-4">
              <FileChangeDiff change={change} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
