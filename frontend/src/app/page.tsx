"use client";

import { useState, useMemo, useEffect } from "react";
import type { Agent, Task, Checkpoint } from "@/lib/types";
import { getSocket } from "@/lib/socket";

import Header from "@/components/Header";
import PixelOfficeBanner from "@/components/PixelOfficeBanner";
import KanbanBoard from "@/components/KanbanBoard";
import ActivityLog from "@/components/ActivityLog";
import GitGraph from "@/components/GitGraph";
import AgentModal from "@/components/AgentModal";
import EscalationModal from "@/components/EscalationModal";
import ApprovalQueue from "@/components/ApprovalQueue";

import { useAgents } from "@/hooks/useAgents";
import { useTasks } from "@/hooks/useTasks";
import { useActivity } from "@/hooks/useActivity";
import { useEscalation } from "@/hooks/useEscalation";
import { useBossChat } from "@/hooks/useBossChat";
import { useCheckpoints } from "@/hooks/useCheckpoints";
import { useFileChanges } from "@/hooks/useFileChanges";

const STEPS: { status: string; label: string; detail: string }[] = [
  { status: "thinking", label: "Analyzing",  detail: "The Boss is reading your request" },
  { status: "meeting",  label: "Planning",   detail: "Breaking requirements into tasks" },
  { status: "working",  label: "Assigning",  detail: "Dispatching the team" },
];

function SprintLoadingScreen({ agents }: { agents: Agent[] }) {
  const boss = agents.find((a) => a.id === "agent-boss");
  const bossStatus = boss?.status ?? "thinking";
  const bossActivity = boss?.current_activity;

  // Map boss status to step index; idle while pending = last reached step or 0
  const activeStepIdx = Math.max(STEPS.findIndex((s) => s.status === bossStatus), 0);
  const currentStep = STEPS[activeStepIdx];

  return (
    <section className="flex flex-col items-center justify-center py-20 text-center select-none">
      {/* Pulsing ring */}
      <div className="relative w-20 h-20 mb-8">
        <span className="absolute inset-0 rounded-full border-2 border-[var(--accent)] opacity-20 animate-ping" />
        <span className="absolute inset-2 rounded-full border-2 border-[var(--accent)] opacity-40 animate-ping [animation-delay:0.3s]" />
        <span className="absolute inset-4 rounded-full bg-[var(--accent)] opacity-80 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </span>
      </div>

      <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">
        Setting up your sprint
      </p>
      <p className="text-[13px] text-[var(--text-muted)] mb-8 min-h-[18px]">
        {bossActivity || currentStep.detail}
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = i < activeStepIdx;
          const active = i === activeStepIdx;
          return (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all duration-500
                  ${done  ? "bg-[var(--accent)] text-white"
                  : active ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent)]/20"
                  :          "bg-[var(--bg-column)] text-[var(--text-muted)]"}
                `}>
                  {done ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-[11px] font-medium ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-16 h-px mx-2 mb-4 transition-colors duration-500 ${done ? "bg-[var(--accent)]" : "bg-[var(--border-color)]"}`} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
  const [isPending, setIsPending] = useState(false);

  // Clear loading state once tasks appear
  useEffect(() => {
    if (tasks.length > 0) setIsPending(false);
  }, [tasks.length]);

  // Listen for agent_route events — auto-close agent modal and open Chief chat
  useEffect(() => {
    const socket = getSocket();
    const handleRoute = (data: { from_agent_name: string; message: string; reason: string }) => {
      // Open Chief modal and send the routed message
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
    // Flag agents with tasks in review — they need attention
    for (const task of tasks) {
      if (task.status === "review" && task.assigned_agent_id) {
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
              message: `Task in Review & Testing`,
              next_status: "done",
              status: "pending",
              created_at: new Date().toISOString(),
            } as Checkpoint,
          };
        }
      }
    }
    return map;
  }, [checkpoints, tasks]);

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
      done: filter(grouped.done),
    };
  }, [grouped, searchQuery]);

  // Dynamic sprint info from tasks (no mock sprint)
  const sprintName = tasks.length > 0 ? "Sprint 1" : "No Sprint";
  const sprintStatus = tasks.length > 0 ? "active" : "planning";

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
      <main className="flex-1 px-6 py-5 space-y-5 w-full">
        {/* Pixel Office Banner (with integrated Command Bar) */}
        <PixelOfficeBanner
          agents={agents}
          onAgentClick={(agentId) => {
            setSelectedTaskId(null);
            const agent = agents.find((a) => a.id === agentId);
            if (agent) setSelectedAgent(agent);
          }}
          agentNotifications={agentNotifications}
          onSubmit={(message) => {
            const bossAgent = agents.find((a) => a.id === "agent-boss");
            if (bossAgent) setSelectedAgent(bossAgent);
            bossChat.sendMessage(message);
            if (tasks.length === 0) setIsPending(true);
          }}
          hasTasks={tasks.length > 0}
        />

        {tasks.length > 0 ? (
          <>
            {/* Kanban Board */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">
                  Sprint Board
                </h2>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Drag to move columns
                </span>
              </div>
              <KanbanBoard
                grouped={filteredGrouped}
                agents={agents}
                onMoveTask={moveTask}
                onClickTask={(task) => {
                  setSelectedTaskId(task.id);
                  const agentId = task.assigned_agent_id;
                  const agent = agentId ? agents.find((a) => a.id === agentId) : null;
                  if (agent) {
                    setSelectedAgent(agent);
                  }
                }}
              />
            </section>

            {/* Unified Approval Queue */}
            <ApprovalQueue
              checkpoints={checkpoints}
              fileChanges={fileChanges}
              tasks={tasks}
              agents={agents}
              onCheckpointRespond={respondCheckpoint}
              onFileChangeRespond={respondFileChange}
              onMoveTask={moveTask}
            />

            {/* Activity Log + Git Graph */}
            <section className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
              <ActivityLog activities={activities} />
              <GitGraph activities={activities} />
            </section>
          </>
        ) : isPending ? (
          <SprintLoadingScreen agents={agents} />
        ) : (
          <section className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--bg-column)] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">No tasks yet</p>
            <p className="text-[13px] text-[var(--text-muted)] max-w-sm">
              Use the command bar above to describe what you want to build. The Chief will delegate work to the team.
            </p>
          </section>
        )}
      </main>

      {/* Agent Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          activities={activities.filter((a) => a.agent_id === selectedAgent.id).slice(-20)}
          onClose={() => { setSelectedAgent(null); setSelectedTaskId(null); }}
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
