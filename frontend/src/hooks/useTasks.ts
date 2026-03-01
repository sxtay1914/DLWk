"use client";

import { useState, useEffect, useMemo } from "react";
import type { Task, TaskStatus } from "@/lib/types";
import { getSocket, API_BASE } from "@/lib/socket";

export type GroupedTasks = Record<TaskStatus, Task[]>;

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await fetch(`${API_BASE}/api/tasks`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setTasks(data);
          }
        }
      } catch {
        console.log("[useTasks] Backend unavailable");
      } finally {
        setLoading(false);
      }
    }

    fetchTasks();

    const socket = getSocket();

    socket.on("initial_state", (data: { tasks?: Task[] }) => {
      if (data.tasks && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        setLoading(false);
      }
    });

    socket.on("task_update", (payload: { action: string; task?: Task; task_id?: string }) => {
      if (payload.action === "delete" && payload.task_id) {
        setTasks((prev) => prev.filter((t) => t.id !== payload.task_id));
      } else if (payload.task) {
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === payload.task!.id);
          if (exists) {
            return prev.map((t) => (t.id === payload.task!.id ? payload.task! : t));
          }
          return [...prev, payload.task!];
        });
      }
    });

    return () => {
      socket.off("initial_state");
      socket.off("task_update");
    };
  }, []);

  const grouped = useMemo<GroupedTasks>(() => {
    return {
      backlog: tasks.filter((t) => t.status === "backlog"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      review: tasks.filter((t) => t.status === "review"),
      done: tasks.filter((t) => t.status === "done"),
    };
  }, [tasks]);

  const moveTask = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
      )
    );

    // Notify backend
    const socket = getSocket();
    socket.emit("move_task", { task_id: taskId, status: newStatus });
  };

  return { tasks, grouped, loading, moveTask };
}
