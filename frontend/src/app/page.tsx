"use client";

import { useState, useMemo, useEffect } from "react";
import type { Agent, Task, Checkpoint } from "@/lib/types";
import { getSocket } from "@/lib/socket";

import Header from "@/components/Header";
import CommandBar from "@/components/CommandBar";
import PixelOfficeBanner from "@/components/PixelOfficeBanner";
import KanbanBoard from "@/components/KanbanBoard";
import ActivityLog from "@/components/ActivityLog";
import GitGraph from "@/components/GitGraph";
import AgentModal from "@/components/AgentModal";
import EscalationModal from "@/components/EscalationModal";
import FileChangeReview from "@/components/FileChangeReview";

import { useAgents } from "@/hooks/useAgents";
import { useTasks } from "@/hooks/useTasks";
import { useActivity } from "@/hooks/useActivity";
import { useEscalation } from "@/hooks/useEscalation";
import { useBossChat } from "@/hooks/useBossChat";
import { useCheckpoints } from "@/hooks/useCheckpoints";
import { useFileChanges } from "@/hooks/useFileChanges";

export default function Home() {
  const { agents, connected } = useAgents();
  const { tasks, grouped, moveTask } = useTasks();
  const { activities } = useActivity();
  const { escalation, respond, dismiss } = useEscalation();
  const bossChat = useBossChat();
  const { checkpoints, respond: respondCheckpoint } = useCheckpoints();
  const { fileChanges, respond: respondFileChange } = useFileChanges();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Listen for agent_route events — auto-close agent modal and open Boss chat
  useEffect(() => {
    const socket = getSocket();
    const handleRoute = (data: { from_agent_name: string; message: string; reason: string }) => {
      // Open Boss modal and send the routed message
      const bossAgent = agents.find((a) => a.id === "agent-boss");
      if (bossAgent) {
        setSelectedAgent(bossAgent);
        bossChat.sendMessage(`[From ${data.from_agent_name}] ${data.message}`);
      }
    };
    socket.on("agent_route", handleRoute);
    return () => { socket.off("agent_route", handleRoute); };
  }, [agents, bossChat]);

  // Build agent notification map from pending checkpoints
  // Also map review-status tasks → their assigned agent gets a bubble
  const agentNotifications = useMemo(() => {
    const map: Record<string, { count: number; checkpoint: Checkpoint }> = {};
    for (const cp of checkpoints) {
      if (cp.status !== "pending") continue;
      if (!map[cp.agent_id]) {
        map[cp.agent_id] = { count: 0, checkpoint: cp };
      }
      map[cp.agent_id].count++;
      map[cp.agent_id].checkpoint = cp; // latest
    }
    // Flag agents with tasks in review/testing — they need attention
    for (const task of tasks) {
      if ((task.status === "review" || task.status === "testing") && task.assigned_agent_id) {
        const aid = task.assigned_agent_id;
        if (!map[aid]) {
          // Synthesize a notification entry so the red bubble shows
          map[aid] = {
            count: 1,
            checkpoint: {
              id: `synth-${task.id}`,
              task_id: task.id,
              task_title: task.title,
              agent_id: aid,
              agent_name: "",
              agent_color: "",
              message: `Task in ${task.status}`,
              next_status: task.status === "review" ? "testing" : "done",
              status: "pending",
              created_at: new Date().toISOString(),
            } as Checkpoint,
          };
        }
      }
    }
    return map;
  }, [checkpoints, tasks]);

  // Build task→checkpoint map so clicking a task card finds its checkpoint
  const taskCheckpoints = useMemo(() => {
    const map: Record<string, Checkpoint> = {};
    for (const cp of checkpoints) {
      map[cp.task_id] = cp;
    }
    return map;
  }, [checkpoints]);

  // Filter grouped tasks by search query
  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    const q = searchQuery.toLowerCase();
    const filter = (arr: Task[]) =>
      arr.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    return {
      backlog: filter(grouped.backlog),
      in_progress: filter(grouped.in_progress),
      review: filter(grouped.review),
      testing: filter(grouped.testing),
      done: filter(grouped.done),
    };
  }, [grouped, searchQuery]);

  // Dynamic sprint info from tasks (no mock sprint)
  const sprintName = tasks.length > 0 ? "Sprint 1" : "No Sprint";
  const sprintStatus = tasks.length > 0 ? "active" : "planning";

  // Find checkpoint: try real checkpoint first, then synthesize one for review/testing tasks
  const selectedAgentCheckpoint = useMemo<Checkpoint | null>(() => {
    if (!selectedAgent) return null;

    // 1. Real checkpoint by task ID
    if (selectedTaskId && taskCheckpoints[selectedTaskId]) {
      return taskCheckpoints[selectedTaskId];
    }

    // 2. Real checkpoint by agent ID
    const agentCp = agentNotifications[selectedAgent.id]?.checkpoint;
    if (agentCp) return agentCp;

    // 3. Synthesize a checkpoint for reviewable tasks (review/testing) that have no real checkpoint
    if (selectedTaskId) {
      const task = tasks.find((t) => t.id === selectedTaskId);
      if (task && (task.status === "review" || task.status === "testing")) {
        const agent = task.assigned_agent_id ? agents.find((a) => a.id === task.assigned_agent_id) : null;
        return {
          id: `synth-${task.id}`,
          task_id: task.id,
          task_title: task.title,
          agent_id: task.assigned_agent_id || selectedAgent.id,
          agent_name: agent?.name || selectedAgent.name,
          agent_color: agent?.color || selectedAgent.color,
          message: `Task is in ${task.status === "review" ? "Review" : "Testing"}. Approve to advance or request changes.`,
          next_status: task.status === "review" ? "testing" : "done",
          status: "pending",
          created_at: new Date().toISOString(),
        } as Checkpoint;
      }
    }

    return null;
  }, [selectedAgent, selectedTaskId, taskCheckpoints, agentNotifications, tasks, agents]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <Header
        sprintName={sprintName}
        sprintStatus={sprintStatus}
        agentCount={agents.length}
        connectedToBackend={connected}
        onSearch={setSearchQuery}
      />

      {/* Main content */}
      <main className="flex-1 px-6 py-5 space-y-5 max-w-[1600px] w-full mx-auto">
        {/* Command Bar */}
        <CommandBar
          onSubmit={(message) => {
            const bossAgent = agents.find((a) => a.id === "agent-boss");
            if (bossAgent) setSelectedAgent(bossAgent);
            bossChat.sendMessage(message);
          }}
          hasTasks={tasks.length > 0}
        />

        {/* Pixel Office Banner */}
        <PixelOfficeBanner
          agents={agents}
          onAgentClick={(agentId) => {
            setSelectedTaskId(null);
            const agent = agents.find((a) => a.id === agentId);
            if (agent) setSelectedAgent(agent);
          }}
          agentNotifications={agentNotifications}
        />

        {/* Kanban Board */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">
              Sprint Board
            </h2>
            {tasks.length > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">
                Drag to move columns
              </span>
            )}
          </div>
          <KanbanBoard
            grouped={filteredGrouped}
            agents={agents}
            onMoveTask={moveTask}
            onClickTask={(task) => {
              // Open the assigned agent's modal so user can review/approve
              setSelectedTaskId(task.id);
              const agentId = task.assigned_agent_id;
              const agent = agentId ? agents.find((a) => a.id === agentId) : null;
              if (agent) {
                setSelectedAgent(agent);
              }
            }}
          />
        </section>

        {/* File Change Review — Claude Code-style diff approval */}
        <FileChangeReview
          fileChanges={fileChanges}
          onRespond={respondFileChange}
        />

        {/* Activity Log + Git Graph */}
        <section className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
          <ActivityLog activities={activities} />
          <GitGraph activities={activities} />
        </section>
      </main>

      {/* Agent Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          activities={activities.filter((a) => a.agent_id === selectedAgent.id).slice(-20)}
          onClose={() => { setSelectedAgent(null); setSelectedTaskId(null); }}
          checkpoint={selectedAgentCheckpoint}
          onCheckpointRespond={(cpId, action, feedback) => {
            if (cpId.startsWith("synth-") && action === "approve") {
              // Synthetic checkpoint — move task to next status
              const taskId = cpId.replace("synth-", "");
              const task = tasks.find((t) => t.id === taskId);
              if (task) {
                const nextStatus = task.status === "review" ? "testing" : "done";
                moveTask(taskId, nextStatus as import("@/lib/types").TaskStatus);
              }
              setSelectedAgent(null);
              setSelectedTaskId(null);
            } else {
              respondCheckpoint(cpId, action, feedback);
            }
          }}
          {...(selectedAgent.id === "agent-boss" ? {
            bossMessages: bossChat.messages,
            onBossSend: bossChat.sendMessage,
            bossPlan: bossChat.plan,
            onBossApprovePlan: bossChat.approvePlan,
            bossIsStreaming: bossChat.isStreaming,
          } : {})}
        />
      )}

      {/* Escalation Modal */}
      {escalation && (
        <EscalationModal
          escalation={escalation}
          onRespond={respond}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
