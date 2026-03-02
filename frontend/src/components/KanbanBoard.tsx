"use client";

import React from "react";
import type { Agent, Task, TaskStatus } from "@/lib/types";
import { COLUMN_ORDER, COLUMN_LABELS } from "@/lib/types";
import type { GroupedTasks } from "@/hooks/useTasks";
import TaskCard from "./TaskCard";

interface KanbanBoardProps {
  grouped: GroupedTasks;
  agents: Agent[];
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onClickTask?: (task: Task) => void;
}

export default function KanbanBoard({
  grouped,
  agents,
  onMoveTask,
  onClickTask,
}: KanbanBoardProps) {
  // Build a lookup map for agent resolution
  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const column = (e.currentTarget as HTMLElement);
    column.classList.add("drag-over");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const column = (e.currentTarget as HTMLElement);
    column.classList.remove("drag-over");
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const column = (e.currentTarget as HTMLElement);
    column.classList.remove("drag-over");
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onMoveTask(taskId, status);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-2">
      {COLUMN_ORDER.map((status) => {
        const tasks = grouped[status];

        return (
          <div
            key={status}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
            className="flex flex-col rounded-lg bg-[var(--bg-column)] transition-colors min-h-[200px]"
          >
            {/* Column header - Jira style: plain text + count */}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {COLUMN_LABELS[status]}
                </h3>
                <span className="text-[11px] font-bold text-[var(--text-muted)]">
                  {tasks.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-1.5 px-2 pb-2 flex-1">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} agentMap={agentMap} onClickTask={onClickTask} />
              ))}

              {tasks.length === 0 && (
                <div className="flex items-center justify-center flex-1 min-h-[80px]">
                  <span className="text-xs text-[var(--text-muted)]">
                    No tasks
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
