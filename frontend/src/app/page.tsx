"use client";

import { useState } from "react";
import type { Agent, Task } from "@/lib/types";
import { MOCK_SPRINT } from "@/lib/mockData";

import Header from "@/components/Header";
import PixelOfficeBanner from "@/components/PixelOfficeBanner";
import KanbanBoard from "@/components/KanbanBoard";
import ActivityLog from "@/components/ActivityLog";
import SprintInfo from "@/components/SprintInfo";
import AgentModal from "@/components/AgentModal";
import EscalationModal from "@/components/EscalationModal";

import { useAgents } from "@/hooks/useAgents";
import { useTasks } from "@/hooks/useTasks";
import { useActivity } from "@/hooks/useActivity";
import { useEscalation } from "@/hooks/useEscalation";

export default function Home() {
  const { agents, connected } = useAgents();
  const { grouped, moveTask } = useTasks();
  const { activities } = useActivity();
  const { escalation, respond, dismiss } = useEscalation();

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const handleTaskClick = (task: Task) => {
    // Find the assigned agent to show in modal
    if (task.assigned_agent_id) {
      const agent = agents.find((a) => a.id === task.assigned_agent_id);
      if (agent) {
        setSelectedAgent(agent);
        return;
      }
    }
    console.log("Task clicked:", task);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <Header
        sprintName={MOCK_SPRINT.name}
        sprintStatus={MOCK_SPRINT.status}
        agentCount={agents.length}
        connectedToBackend={connected}
      />

      {/* Main content */}
      <main className="flex-1 p-5 space-y-5 max-w-[1600px] w-full mx-auto">
        {/* Pixel Office Banner */}
        <PixelOfficeBanner agents={agents} />

        {/* Kanban Board */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Sprint Board
            </h2>
            <span className="text-[11px] text-[var(--text-muted)]">
              Drag cards to move between columns
            </span>
          </div>
          <KanbanBoard
            grouped={grouped}
            onMoveTask={moveTask}
            onClickTask={handleTaskClick}
          />
        </section>

        {/* Activity Log + Sprint Info (two-column) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ActivityLog activities={activities} />
          </div>
          <div>
            <SprintInfo sprint={MOCK_SPRINT} agents={agents} />
          </div>
        </section>
      </main>

      {/* Agent Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
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
