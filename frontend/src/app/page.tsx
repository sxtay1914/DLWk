"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Agent, Task, Checkpoint, ActivityEntry } from "@/lib/types";
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
import { useAgentChat } from "@/hooks/useAgentChat";

const STEPS: { status: string; label: string; detail: string }[] = [
  { status: "thinking", label: "Analyzing",  detail: "The Chief is reading your request" },
  { status: "meeting",  label: "Planning",   detail: "Breaking requirements into tasks" },
  { status: "working",  label: "Assigning",  detail: "Dispatching the team" },
];

function SprintLoadingScreen({ agents }: { agents: Agent[] }) {
  const boss = agents.find((a) => a.id === "agent-boss");
  const bossStatus = boss?.status ?? "thinking";
  const bossActivity = boss?.current_activity;

  // Map boss status to step index — only ever move forward, never backward
  const rawIdx = STEPS.findIndex((s) => s.status === bossStatus);
  const maxStepRef = useRef(0);
  if (rawIdx > maxStepRef.current) {
    maxStepRef.current = rawIdx;
  }
  const activeStepIdx = maxStepRef.current;
  const currentStep = STEPS[activeStepIdx];

  return (
    <section className="flex flex-col items-center justify-center py-20 text-center select-none">
      {/* Pulsing ring */}
      <div className="relative w-20 h-20 mb-8">
        <span className="absolute inset-0 rounded-full border-2 border-[#3B82F6] opacity-20 animate-ping" />
        <span className="absolute inset-2 rounded-full border-2 border-[#3B82F6] opacity-40 animate-ping [animation-delay:0.3s]" />
        <span className="absolute inset-4 rounded-full bg-[#3B82F6] flex items-center justify-center text-[15px] font-bold text-white shadow-sm">
          sA
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
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all duration-500 text-white"
                  style={{
                    backgroundColor: done || active ? "#3B82F6" : "var(--bg-column)",
                    color: done || active ? "white" : "var(--text-muted)",
                    boxShadow: active ? "0 0 0 4px #3B82F620" : "none",
                  }}
                >
                  {done ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span
                  className="text-[11px] font-medium transition-colors duration-500"
                  style={{ color: active ? "#3B82F6" : "var(--text-muted)" }}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="w-16 h-px mx-2 mb-4 transition-colors duration-500"
                  style={{ backgroundColor: done ? "#3B82F6" : "var(--border-color)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Chalkboard({ agents, activities }: { agents: Agent[]; activities: ActivityEntry[] }) {
  const pm = agents.find((a) => a.id === "agent-pm");
  const pmActivity = pm?.current_activity;
  const pmEntries = activities.filter((a) => a.agent_id === "agent-pm");

  return (
    <section className="mx-auto w-full max-w-2xl select-none">
      <div
        className="relative rounded-xl px-8 py-6 shadow-lg border border-[#2a4a2a]"
        style={{
          background: "linear-gradient(135deg, #2d5016 0%, #1a3a0a 50%, #2d5016 100%)",
          minHeight: 200,
        }}
      >
        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: "#3B82F6" }} />
          <span
            className="text-[13px] font-semibold tracking-wide"
            style={{ color: "#c8dbb4", fontFamily: "var(--font-jetbrains-mono), monospace" }}
          >
            PM is planning your sprint...
          </span>
        </div>

        <div className="space-y-2 min-h-[80px]">
          {pmEntries.length === 0 && pmActivity && (
            <p className="text-[13px] leading-relaxed" style={{ color: "#e8f0dc", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
              {pmActivity}
            </p>
          )}
          {pmEntries.map((entry, i) => (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="text-[10px] mt-0.5 shrink-0" style={{ color: "#7a9a5a", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: i === pmEntries.length - 1 ? "#e8f0dc" : "#a8c890", fontFamily: "var(--font-jetbrains-mono), monospace" }}
              >
                {entry.message}
              </p>
            </div>
          ))}
          {pmEntries.length === 0 && !pmActivity && (
            <div className="flex items-center gap-2">
              <span className="text-[13px]" style={{ color: "#a8c890", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
                Waiting for the Chief to hand off...
              </span>
              <span className="inline-block w-2 h-4 bg-[#a8c890] animate-pulse" />
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
          <div className="w-8 h-1.5 rounded-full bg-white/15" />
          <div className="w-5 h-1.5 rounded-full bg-white/10" />
          <div className="w-3 h-1.5 rounded-full bg-white/8" />
        </div>
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
  const agentChat = useAgentChat();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showChalkboard, setShowChalkboard] = useState(false);

  // Transition: loading screen → chalkboard once PM starts working
  useEffect(() => {
    if (!isPending) return;
    const pm = agents.find((a) => a.id === "agent-pm");
    if (pm && pm.status !== "idle") {
      setIsPending(false);
      setShowChalkboard(true);
    }
  }, [agents, isPending]);

  // Chalkboard goes away once tasks appear (SM populated kanban)
  useEffect(() => {
    if (tasks.length > 0) {
      setIsPending(false);
      setShowChalkboard(false);
    }
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
        ) : showChalkboard ? (
          <Chalkboard agents={agents} activities={activities} />
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
          } : {
            agentMessages: agentChat.getMessages(selectedAgent.id),
            onAgentSend: (msg: string) => agentChat.sendMessage(selectedAgent.id, selectedAgent.name, selectedAgent.color, msg),
            agentIsStreaming: agentChat.getIsStreaming(selectedAgent.id),
          })}
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
