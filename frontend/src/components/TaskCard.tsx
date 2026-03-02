"use client";

import type { Agent, Task, TaskStatus } from "@/lib/types";
import React from "react";

interface TaskCardProps {
  task: Task;
  agentMap?: Record<string, Agent>;
  onClickTask?: (task: Task) => void;
  columnStatus?: TaskStatus;
}

// Map task type keywords to colors
function getTypeInfo(task: Task): { color: string; label: string } {
  const title = task.title.toLowerCase();
  if (title.includes("bug") || title.includes("fix") || title.includes("vulnerability") || title.includes("security")) {
    return { color: "#ef4444", label: "Bug" };
  }
  if (title.includes("review") || title.includes("test") || title.includes("refactor") || title.includes("improvement") || title.includes("validation") || title.includes("logging") || title.includes("configure") || title.includes("ci/cd")) {
    return { color: "#10a37f", label: "Improvement" };
  }
  return { color: "#6e6e80", label: "Feature" };
}

// Use ticket_number from backend, fallback to hash for old tasks
function getTicketId(task: Task): string {
  if ((task as unknown as Record<string, unknown>).ticket_number) {
    return `DEV-${(task as unknown as Record<string, unknown>).ticket_number}`;
  }
  let hash = 0;
  for (let i = 0; i < task.id.length; i++) {
    hash = ((hash << 5) - hash) + task.id.charCodeAt(i);
    hash |= 0;
  }
  return `DEV-${Math.abs(hash) % 900 + 100}`;
}

// Map priority to icons
function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "P0") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <path d="M8 3L4 7h3v2H4l4 4 4-4H9V7h3L8 3z" fill="#ef4444" />
      </svg>
    );
  }
  if (priority === "P1") {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <path d="M8 4L4 9h8L8 4z" fill="#f59e0b" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M8 12l4-5H4l4 5z" fill="#acacbe" />
    </svg>
  );
}

function getStoryPoints(priority: string): number {
  if (priority === "P0") return 8;
  if (priority === "P1") return 5;
  return 3;
}

export default function TaskCard({ task, agentMap, onClickTask, columnStatus }: TaskCardProps) {
  const assignee = task.assigned_agent_id && agentMap ? agentMap[task.assigned_agent_id] : null;
  const needsReview = columnStatus === "review" || task.status === "review";
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    (e.target as HTMLElement).classList.add("dragging");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove("dragging");
  };

  const handleClick = () => {
    if (onClickTask) {
      onClickTask(task);
    }
  };

  const typeInfo = getTypeInfo(task);
  const ticketId = getTicketId(task);
  const storyPoints = getStoryPoints(task.priority);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`card-transition p-3 bg-[var(--bg-card)] rounded-xl cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] group ${
        needsReview
          ? "border-l-[3px] border-l-red-500 shadow-[0_0_8px_rgba(239,68,68,0.15)] ring-1 ring-red-200 dark:ring-red-900/40"
          : ""
      }`}
    >
      {/* Review badge */}
      {needsReview && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-1.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Needs Review
        </span>
      )}

      {/* Title */}
      <h4 className="text-[13px] font-normal text-[var(--text-primary)] leading-snug line-clamp-2 mb-2.5">
        {task.title}
      </h4>

      {/* Bottom row */}
      <div className="flex items-center gap-1.5">
        {/* Type dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: typeInfo.color }}
          title={typeInfo.label}
        />

        {/* Ticket ID */}
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {ticketId}
        </span>

        {/* Story points */}
        <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-medium text-[var(--text-muted)] bg-[var(--bg-column)] rounded-full">
          {storyPoints}
        </span>

        {/* Priority */}
        <PriorityIcon priority={task.priority} />

        <div className="flex-1" />

        {/* Assignee avatar */}
        {assignee ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-semibold text-white shrink-0"
            style={{ backgroundColor: assignee.color }}
            title={assignee.name}
          >
            {assignee.name.charAt(0)}
          </div>
        ) : (
          <div
            className="w-5 h-5 rounded-full shrink-0 border border-dashed border-[var(--text-muted)]/40"
            title="Unassigned"
          />
        )}
      </div>
    </div>
  );
}
