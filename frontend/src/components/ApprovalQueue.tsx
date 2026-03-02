"use client";

import { useState } from "react";
import type { Agent, Task, Checkpoint, PendingFileChange, ApprovalGroup, TaskStatus } from "@/lib/types";
import { useApprovalQueue } from "@/hooks/useApprovalQueue";

interface ApprovalQueueProps {
  checkpoints: Checkpoint[];
  fileChanges: PendingFileChange[];
  tasks: Task[];
  agents: Agent[];
  onCheckpointRespond: (checkpointId: string, action: "approve" | "request_changes" | "pause", feedback?: string) => void;
  onFileChangeRespond: (changeId: string, action: "approve" | "reject", feedback?: string) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
}

// --- Diff utilities (copied from FileChangeReview) ---

function computeDiff(oldText: string, newText: string): { type: "same" | "add" | "remove"; line: string }[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: { type: "same" | "add" | "remove"; line: string }[] = [];

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
    const lines = change.new_content.split("\n");
    return (
      <div className="font-mono text-[11px] leading-[18px] overflow-x-auto max-h-[300px] overflow-y-auto bg-gray-50 dark:bg-[#1a1a2e] rounded-md border border-gray-200 dark:border-gray-700">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-10 text-right pr-2 text-gray-500 dark:text-gray-400 select-none border-r border-gray-200 dark:border-gray-700 bg-green-100 dark:bg-green-950/30">
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

  const diff = computeDiff(change.old_content || "", change.new_content);
  return (
    <div className="font-mono text-[11px] leading-[18px] overflow-x-auto max-h-[300px] overflow-y-auto bg-gray-50 dark:bg-[#1a1a2e] rounded-md border border-gray-200 dark:border-gray-700">
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
          <span className={`w-10 text-right pr-2 select-none border-r border-gray-200 dark:border-gray-700 ${
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

// --- Priority icon ---

function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "P0") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        P0
      </span>
    );
  }
  if (priority === "P1") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        P1
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      P2
    </span>
  );
}

// --- Timestamp helper ---

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// --- Group card ---

function ApprovalGroupCard({
  group,
  onCheckpointRespond,
  onFileChangeRespond,
  onMoveTask,
}: {
  group: ApprovalGroup;
  onCheckpointRespond: ApprovalQueueProps["onCheckpointRespond"];
  onFileChangeRespond: ApprovalQueueProps["onFileChangeRespond"];
  onMoveTask: ApprovalQueueProps["onMoveTask"];
}) {
  const [cpFeedback, setCpFeedback] = useState("");
  const [showCpFeedback, setShowCpFeedback] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [rejectInputId, setRejectInputId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState<Record<string, string>>({});

  const cp = group.checkpoint;
  const isSynthetic = cp?.id.startsWith("synth-");

  const handleCheckpointApprove = () => {
    if (!cp) return;
    if (isSynthetic) {
      const taskId = cp.id.replace("synth-", "");
      onMoveTask(taskId, cp.next_status);
    } else {
      onCheckpointRespond(cp.id, "approve");
    }
  };

  const handleCheckpointReject = () => {
    if (!cp) return;
    if (showCpFeedback && cpFeedback.trim()) {
      if (isSynthetic) {
        // Can't request changes on synthetic — just close
        setShowCpFeedback(false);
        setCpFeedback("");
      } else {
        onCheckpointRespond(cp.id, "request_changes", cpFeedback);
        setCpFeedback("");
        setShowCpFeedback(false);
      }
    } else {
      setShowCpFeedback(true);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden shadow-sm">
      {/* Group header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-column)]/50">
        <PriorityIcon priority={group.priority} />
        <span className="text-[13px] font-medium text-[var(--text-primary)] truncate flex-1">
          {group.task_title}
        </span>
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: group.agent_color }}
        />
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">
          {group.agent_name}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">
          {timeAgo(group.created_at)}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Checkpoint section */}
        {cp && cp.status === "pending" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div className="flex-1">
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  {cp.message}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Next status: <span className="font-medium capitalize">{cp.next_status.replace("_", " ")}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCheckpointApprove}
                className="px-3.5 py-1.5 text-[12px] font-medium rounded-full bg-[var(--success)] text-white hover:opacity-90 transition-opacity"
              >
                Approve
              </button>
              {!isSynthetic && (
                <button
                  onClick={handleCheckpointReject}
                  className="px-3.5 py-1.5 text-[12px] font-medium rounded-full border border-amber-300 text-amber-700 dark:text-amber-400 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                >
                  Request Changes
                </button>
              )}
            </div>
            {showCpFeedback && !isSynthetic && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cpFeedback}
                  onChange={(e) => setCpFeedback(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && cpFeedback.trim()) {
                      onCheckpointRespond(cp.id, "request_changes", cpFeedback);
                      setCpFeedback("");
                      setShowCpFeedback(false);
                    }
                  }}
                  placeholder="What needs to change?"
                  className="flex-1 px-3 py-1.5 text-[12px] rounded-lg border border-amber-200 dark:border-amber-700 bg-[var(--bg-card)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-amber-400"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (cpFeedback.trim()) {
                      onCheckpointRespond(cp.id, "request_changes", cpFeedback);
                      setCpFeedback("");
                      setShowCpFeedback(false);
                    }
                  }}
                  disabled={!cpFeedback.trim()}
                  className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-amber-500 text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        {/* Divider between checkpoint and file changes */}
        {cp && cp.status === "pending" && group.fileChanges.length > 0 && (
          <div className="border-t border-[var(--border-subtle)]" />
        )}

        {/* File changes section */}
        {group.fileChanges.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
              File Changes ({group.fileChanges.length})
            </p>
            {group.fileChanges.map((fc) => (
              <div
                key={fc.id}
                className="rounded-lg border border-[var(--border-subtle)] overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-column)] transition-colors"
                  onClick={() => setExpandedDiff(expandedDiff === fc.id ? null : fc.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide shrink-0 ${
                        fc.change_type === "create"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      }`}
                    >
                      {fc.change_type === "create" ? "NEW" : "EDIT"}
                    </span>
                    <span className="text-[12px] font-mono text-[var(--text-primary)] truncate">
                      {fc.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileChangeRespond(fc.id, "approve");
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (rejectInputId === fc.id) {
                          onFileChangeRespond(fc.id, "reject", rejectFeedback[fc.id] || "");
                          setRejectInputId(null);
                        } else {
                          setRejectInputId(fc.id);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Reject
                    </button>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
                        expandedDiff === fc.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Reject feedback input */}
                {rejectInputId === fc.id && (
                  <div className="px-3 pb-2 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Reason for rejection (optional)..."
                      value={rejectFeedback[fc.id] || ""}
                      onChange={(e) =>
                        setRejectFeedback((prev) => ({ ...prev, [fc.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onFileChangeRespond(fc.id, "reject", rejectFeedback[fc.id] || "");
                          setRejectInputId(null);
                        }
                      }}
                      className="flex-1 px-2.5 py-1 text-[11px] rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-red-500"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        onFileChangeRespond(fc.id, "reject", rejectFeedback[fc.id] || "");
                        setRejectInputId(null);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setRejectInputId(null)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-column)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Diff viewer */}
                {expandedDiff === fc.id && (
                  <div className="px-3 pb-3">
                    {fc.description && (
                      <p className="text-[11px] text-[var(--text-muted)] mb-2">{fc.description}</p>
                    )}
                    <FileChangeDiff change={fc} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main component ---

export default function ApprovalQueue({
  checkpoints,
  fileChanges,
  tasks,
  agents,
  onCheckpointRespond,
  onFileChangeRespond,
  onMoveTask,
}: ApprovalQueueProps) {
  const { groups, totalCount } = useApprovalQueue(checkpoints, fileChanges, tasks, agents);
  const [collapsed, setCollapsed] = useState(false);

  if (totalCount === 0) return null;

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <h2 className="text-[13px] font-medium text-[var(--text-primary)]">
            Approval Queue
          </h2>
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: "#EF4444" }}
          >
            {totalCount}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Groups */}
      {!collapsed && (
        <div className="space-y-3">
          {groups.map((group) => (
            <ApprovalGroupCard
              key={group.task_id}
              group={group}
              onCheckpointRespond={onCheckpointRespond}
              onFileChangeRespond={onFileChangeRespond}
              onMoveTask={onMoveTask}
            />
          ))}
        </div>
      )}
    </section>
  );
}
