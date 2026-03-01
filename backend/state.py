"""In-memory state manager for the AI-governed dev team backend.

Holds all agents, tasks, sprint, activity log, and escalations.
Provides helper methods that mutate state and emit Socket.IO events.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import socketio

from models import (
    ActivityEntry,
    ActivityType,
    Agent,
    AgentRole,
    AgentStatus,
    Escalation,
    Sprint,
    Task,
)


class StateManager:
    """Central store for every piece of runtime data."""

    def __init__(self, sio: socketio.AsyncServer) -> None:
        self.sio = sio

        # Collections keyed by id
        self.agents: dict[str, Agent] = {}
        self.tasks: dict[str, Task] = {}
        self.sprint: Optional[Sprint] = None
        self.activity_log: list[ActivityEntry] = []
        self.escalations: dict[str, Escalation] = {}

        self._init_agents_only()

    # ── Bootstrap: agents only, everything else empty ────────────────────

    def _init_agents_only(self) -> None:
        """Create the 7 agents in IDLE state. No tasks, sprint, or activity."""

        agents_raw = [
            Agent(
                id="agent-boss",
                name="Boss",
                role=AgentRole.BOSS,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#F59E0B",
                position={"x": 50, "y": 30},
            ),
            Agent(
                id="agent-pm",
                name="PM",
                role=AgentRole.PM,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#3B82F6",
                position={"x": 30, "y": 50},
            ),
            Agent(
                id="agent-sm",
                name="Scrum Master",
                role=AgentRole.SCRUM_MASTER,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#14B8A6",
                position={"x": 70, "y": 50},
            ),
            Agent(
                id="agent-dev",
                name="Developer 1",
                role=AgentRole.DEVELOPER,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#22C55E",
                position={"x": 35, "y": 70},
            ),
            Agent(
                id="agent-dev2",
                name="Developer 2",
                role=AgentRole.DEVELOPER,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#22C55E",
                position={"x": 55, "y": 70},
            ),
            Agent(
                id="agent-qa",
                name="QA",
                role=AgentRole.QA,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#F97316",
                position={"x": 60, "y": 70},
            ),
            Agent(
                id="agent-cr",
                name="Code Reviewer",
                role=AgentRole.CODE_REVIEWER,
                status=AgentStatus.IDLE,
                current_task=None,
                avatar_color="#8B5CF6",
                position={"x": 50, "y": 90},
            ),
        ]
        for a in agents_raw:
            self.agents[a.id] = a

    # ── Mutation helpers (emit events) ───────────────────────────────────

    async def update_agent(self, agent_id: str, **kwargs) -> Optional[Agent]:
        agent = self.agents.get(agent_id)
        if agent is None:
            return None
        for key, value in kwargs.items():
            if hasattr(agent, key):
                setattr(agent, key, value)
        await self.sio.emit("agent_update", agent.model_dump(mode="json"))
        return agent

    async def add_task(self, task: Task) -> Task:
        self.tasks[task.id] = task
        if self.sprint:
            self.sprint.tasks.append(task.id)
        await self.sio.emit("task_update", {"action": "create", "task": task.model_dump(mode="json")})
        return task

    async def update_task(self, task_id: str, **kwargs) -> Optional[Task]:
        task = self.tasks.get(task_id)
        if task is None:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(task, key):
                setattr(task, key, value)
        task.updated_at = datetime.utcnow()
        await self.sio.emit("task_update", {"action": "update", "task": task.model_dump(mode="json")})
        return task

    async def delete_task(self, task_id: str) -> bool:
        if task_id not in self.tasks:
            return False
        del self.tasks[task_id]
        if self.sprint and task_id in self.sprint.tasks:
            self.sprint.tasks.remove(task_id)
        await self.sio.emit("task_update", {"action": "delete", "task_id": task_id})
        return True

    async def add_activity(
        self,
        message: str,
        agent_id: Optional[str] = None,
        activity_type: ActivityType = ActivityType.INFO,
    ) -> ActivityEntry:
        entry = ActivityEntry(
            id=f"act-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.utcnow(),
            agent_id=agent_id,
            message=message,
            type=activity_type,
        )
        self.activity_log.append(entry)
        await self.sio.emit("activity", entry.model_dump(mode="json"))
        return entry

    async def add_escalation(self, escalation: Escalation) -> Escalation:
        self.escalations[escalation.id] = escalation
        await self.sio.emit("escalation", escalation.model_dump(mode="json"))
        return escalation

    async def create_sprint(self, sprint: Sprint) -> Sprint:
        self.sprint = sprint
        return sprint
