"use client";

import { useMemo } from "react";
import type { Agent, Task, Checkpoint, PendingFileChange, ApprovalGroup, Priority, TaskStatus } from "@/lib/types";

const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

export function useApprovalQueue(
  checkpoints: Checkpoint[],
  fileChanges: PendingFileChange[],
  tasks: Task[],
  agents: Agent[]
) {
  const groups = useMemo<ApprovalGroup[]>(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Index: task_id → checkpoint (only pending)
    const cpByTask = new Map<string, Checkpoint>();
    for (const cp of checkpoints) {
      if (cp.status === "pending") {
        cpByTask.set(cp.task_id, cp);
      }
    }

    // Index: agent_id → file changes (only pending)
    const fcByAgent = new Map<string, PendingFileChange[]>();
    for (const fc of fileChanges) {
      if (fc.status === "pending") {
        const list = fcByAgent.get(fc.agent_id) || [];
        list.push(fc);
        fcByAgent.set(fc.agent_id, list);
      }
    }

    // Link file changes to tasks via agent_id → task.assigned_agent_id
    const fcByTask = new Map<string, PendingFileChange[]>();
    const usedFcIds = new Set<string>();

    for (const task of tasks) {
      if (!task.assigned_agent_id) continue;
      const agentFcs = fcByAgent.get(task.assigned_agent_id);
      if (agentFcs && agentFcs.length > 0) {
        fcByTask.set(task.id, agentFcs);
        for (const fc of agentFcs) usedFcIds.add(fc.id);
      }
    }

    // Build groups from tasks that have either a checkpoint or file changes
    const groupMap = new Map<string, ApprovalGroup>();

    // From real checkpoints
    for (const [taskId, cp] of cpByTask) {
      const task = taskMap.get(taskId);
      const agent = agentMap.get(cp.agent_id);
      groupMap.set(taskId, {
        task_id: taskId,
        task_title: cp.task_title || task?.title || "Unknown Task",
        priority: task?.priority || "P2",
        agent_id: cp.agent_id,
        agent_name: agent?.name || cp.agent_name,
        agent_color: agent?.color || cp.agent_color,
        created_at: cp.created_at,
        checkpoint: cp,
        fileChanges: fcByTask.get(taskId) || [],
      });
    }

    // From file changes linked to tasks (if task not already in groupMap)
    for (const [taskId, fcs] of fcByTask) {
      if (groupMap.has(taskId)) continue;
      const task = taskMap.get(taskId);
      if (!task) continue;
      const agent = task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : null;
      groupMap.set(taskId, {
        task_id: taskId,
        task_title: task.title,
        priority: task.priority,
        agent_id: task.assigned_agent_id || "",
        agent_name: agent?.name || task.assigned_agent_name || "",
        agent_color: agent?.color || task.assigned_agent_color || "",
        created_at: fcs[0].created_at,
        checkpoint: null,
        fileChanges: fcs,
      });
    }

    // Synthetic checkpoints for review tasks without a real checkpoint or file changes
    for (const task of tasks) {
      if (task.status !== "review") continue;
      if (groupMap.has(task.id)) continue;
      const agent = task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : null;
      const synthCp: Checkpoint = {
        id: `synth-${task.id}`,
        task_id: task.id,
        task_title: task.title,
        agent_id: task.assigned_agent_id || "",
        agent_name: agent?.name || task.assigned_agent_name || "",
        agent_color: agent?.color || task.assigned_agent_color || "",
        message: "Task is in Review & Testing. Approve to advance to Done.",
        next_status: "done" as TaskStatus,
        status: "pending",
        created_at: task.updated_at || task.created_at,
      };
      groupMap.set(task.id, {
        task_id: task.id,
        task_title: task.title,
        priority: task.priority,
        agent_id: task.assigned_agent_id || "",
        agent_name: agent?.name || task.assigned_agent_name || "",
        agent_color: agent?.color || task.assigned_agent_color || "",
        created_at: task.updated_at || task.created_at,
        checkpoint: synthCp,
        fileChanges: [],
      });
    }

    // Orphan file changes (not linked to any task)
    const orphanFcs = fileChanges.filter(
      (fc) => fc.status === "pending" && !usedFcIds.has(fc.id)
    );
    if (orphanFcs.length > 0) {
      const agent = agentMap.get(orphanFcs[0].agent_id);
      groupMap.set("__orphan__", {
        task_id: "__orphan__",
        task_title: "Unlinked File Changes",
        priority: "P1",
        agent_id: orphanFcs[0].agent_id,
        agent_name: agent?.name || orphanFcs[0].agent_name,
        agent_color: agent?.color || "#6B7280",
        created_at: orphanFcs[0].created_at,
        checkpoint: null,
        fileChanges: orphanFcs,
      });
    }

    // Sort: priority (P0 first) → then created_at (oldest first)
    return Array.from(groupMap.values()).sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [checkpoints, fileChanges, tasks, agents]);

  const totalCount = groups.reduce(
    (sum, g) => sum + (g.checkpoint ? 1 : 0) + g.fileChanges.length,
    0
  );

  return { groups, totalCount };
}
