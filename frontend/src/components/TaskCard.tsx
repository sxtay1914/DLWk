"use client";

import type { Task } from "@/lib/types";
import React from "react";

interface TaskCardProps {
  task: Task;
  onClickTask?: (task: Task) => void;
}

// Map task type keywords to colors (Jira-style colored squares)
function getTypeInfo(task: Task): { color: string; label: string } {
  const title = task.title.toLowerCase();
  if (title.includes("bug") || title.includes("fix") || title.includes("vulnerability") || title.includes("security")) {
    return { color: "#e5493a", label: "Bug" }; // red
  }
  if (title.includes("review") || title.includes("test") || title.includes("refactor") || title.includes("improvement") || title.includes("validation") || title.includes("logging") || title.includes("configure") || title.includes("ci/cd")) {
    return { color: "#36b37e", label: "Improvement" }; // green
  }
  return { color: "#0065ff", label: "Feature" }; // blue (default = feature/story)
}

// Generate ticket ID from task id: "task-3" -> "DEV-203"
function getTicketId(taskId: string): string {
  const num = taskId.replace(/\D/g, "");
  return `DEV-${200 + parseInt(num || "0", 10)}`;
}

// Map priority to arrow icons
function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "P0") {
    // Critical - double red arrow up
    return (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 3L4 7h3v2H4l4 4 4-4H9V7h3L8 3z" fill="#e5493a" />
      </svg>
    );
  }
  if (priority === "P1") {
    // High - orange arrow up
    return (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 4L4 9h8L8 4z" fill="#f59e0b" />
      </svg>
    );
  }
  // P2 - Low - blue arrow down
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 12l4-5H4l4 5z" fill="#0065ff" />
    </svg>
  );
}

// Story points derived from priority
function getStoryPoints(priority: string): number {
  if (priority === "P0") return 8;
  if (priority === "P1") return 5;
  return 3;
}

export default function TaskCard({ task, onClickTask }: TaskCardProps) {
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
    } else {
      console.log("Task clicked:", task);
    }
  };

  const typeInfo = getTypeInfo(task);
  const ticketId = getTicketId(task.id);
  const storyPoints = getStoryPoints(task.priority);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className="card-transition p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded cursor-pointer hover:bg-[var(--bg-card-hover)] group"
    >
      {/* Title */}
      <h4 className="text-sm text-[var(--text-primary)] leading-snug line-clamp-2 mb-3">
        {task.title}
      </h4>

      {/* Bottom row: type icon, ticket ID, story points, priority, avatar */}
      <div className="flex items-center gap-2">
        {/* Type icon (colored square) */}
        <div
          className="w-4 h-4 rounded-sm shrink-0"
          style={{ backgroundColor: typeInfo.color }}
          title={typeInfo.label}
        />

        {/* Ticket ID */}
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {ticketId}
        </span>

        {/* Story points */}
        <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-column)] rounded-full">
          {storyPoints}
        </span>

        {/* Priority arrow */}
        <PriorityIcon priority={task.priority} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Assignee avatar (right-aligned) */}
        {task.assigned_agent_name ? (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: task.assigned_agent_color || "#97a0af" }}
            title={task.assigned_agent_name}
          >
            {task.assigned_agent_name.charAt(0)}
          </div>
        ) : (
          <div
            className="w-6 h-6 rounded-full shrink-0 border-2 border-dashed border-[var(--text-muted)]"
            title="Unassigned"
          />
        )}
      </div>
    </div>
  );
}
