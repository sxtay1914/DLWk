"use client";

import { useState, useMemo } from "react";
import type { Agent, Task } from "@/lib/types";

import Header from "@/components/Header";
import CommandBar from "@/components/CommandBar";
import PixelOfficeBanner from "@/components/PixelOfficeBanner";
import KanbanBoard from "@/components/KanbanBoard";
import ActivityLog from "@/components/ActivityLog";
import SprintInfo from "@/components/SprintInfo";
import AgentModal from "@/components/AgentModal";
import EscalationModal from "@/components/EscalationModal";
import BossChatPanel from "@/components/BossChatPanel";
import CheckpointCard from "@/components/CheckpointCard";

import { useAgents } from "@/hooks/useAgents";
import { useTasks } from "@/hooks/useTasks";
import { useActivity } from "@/hooks/useActivity";
import { useEscalation } from "@/hooks/useEscalation";
import { useBossChat } from "@/hooks/useBossChat";
import { useCheckpoints } from "@/hooks/useCheckpoints";

export default function Home() {
  const { agents, connected } = useAgents();
  const { tasks, grouped, moveTask } = useTasks();
  const { activities } = useActivity();
  const { escalation, respond, dismiss } = useEscalation();
  const bossChat = useBossChat();
  const { checkpoints, respond: respondCheckpoint } = useCheckpoints();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleTaskClick = (task: Task) => {
    if (task.assigned_agent_id) {
      const agent = agents.find((a) => a.id === task.assigned_agent_id);
      if (agent) {
        setSelectedAgent(agent);
        return;
      }
    }
    console.log("Task clicked:", task);
  };

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
          onSubmit={(message) => bossChat.openChat(message)}
          hasTasks={tasks.length > 0}
        />

        {/* Pixel Office Banner */}
        <PixelOfficeBanner
          agents={agents}
          onAgentClick={(agentId) => {
            const agent = agents.find((a) => a.id === agentId);
            if (agent) setSelectedAgent(agent);
          }}
        />

        {/* Kanban Board */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">
              Sprint Board
            </h2>
            {tasks.length > 0 && (
              <span className="text-[12px] text-[var(--text-muted)]">
                Drag to move
              </span>
            )}
          </div>
          <KanbanBoard
            grouped={filteredGrouped}
            agents={agents}
            onMoveTask={moveTask}
            onClickTask={handleTaskClick}
          />
        </section>

        {/* Checkpoints - shown above activity log when agents need approval */}
        {checkpoints.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
              Awaiting Review ({checkpoints.length})
            </h3>
            {checkpoints.map((cp) => (
              <CheckpointCard
                key={cp.id}
                checkpoint={cp}
                onRespond={respondCheckpoint}
              />
            ))}
          </section>
        )}

        {/* Activity Log + Sprint Info (two-column) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ActivityLog activities={activities} />
          </div>
          <div>
            <SprintInfo
              sprint={{
                id: "sprint-1",
                name: sprintName,
                status: sprintStatus as "planning" | "active" | "completed",
                total_tasks: tasks.length,
                completed_tasks: tasks.filter((t) => t.status === "done").length,
                start_date: null,
                end_date: null,
              }}
              agents={agents}
            />
          </div>
        </section>
      </main>

      {/* Boss Chat Panel */}
      <BossChatPanel
        isOpen={bossChat.isOpen}
        onClose={bossChat.closeChat}
        messages={bossChat.messages}
        onSend={bossChat.sendMessage}
        plan={bossChat.plan}
        onApprovePlan={bossChat.approvePlan}
        isStreaming={bossChat.isStreaming}
      />

      {/* Agent Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          activities={activities.filter((a) => a.agent_id === selectedAgent.id).slice(-20)}
          onClose={() => setSelectedAgent(null)}
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
