"""In-memory state manager for the AI-governed dev team backend.

Holds all agents, tasks, sprint, activity log, and escalations.
Provides helper methods that mutate state and emit Socket.IO events.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
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
    SprintStatus,
    Task,
    TaskPriority,
    TaskStatus,
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

        self._init_mock_data()

    # ── Mock data bootstrap ──────────────────────────────────────────────

    def _init_mock_data(self) -> None:
        """Seed the state with realistic demo data."""

        now = datetime.utcnow()

        # -- Agents --------------------------------------------------------
        agents_raw = [
            Agent(
                id="agent-boss",
                name="Boss",
                role=AgentRole.BOSS,
                status=AgentStatus.THINKING,
                current_task=None,
                avatar_color="#F59E0B",
                position={"x": 50, "y": 30},
            ),
            Agent(
                id="agent-pm",
                name="PM",
                role=AgentRole.PM,
                status=AgentStatus.THINKING,
                current_task=None,
                avatar_color="#3B82F6",
                position={"x": 30, "y": 50},
            ),
            Agent(
                id="agent-sm",
                name="Scrum Master",
                role=AgentRole.SCRUM_MASTER,
                status=AgentStatus.MEETING,
                current_task=None,
                avatar_color="#14B8A6",
                position={"x": 70, "y": 50},
            ),
            Agent(
                id="agent-dev",
                name="Developer",
                role=AgentRole.DEVELOPER,
                status=AgentStatus.WORKING,
                current_task="task-1",
                avatar_color="#22C55E",
                position={"x": 40, "y": 70},
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
                status=AgentStatus.WORKING,
                current_task="task-3",
                avatar_color="#8B5CF6",
                position={"x": 50, "y": 90},
            ),
        ]
        for a in agents_raw:
            self.agents[a.id] = a

        # -- Tasks ---------------------------------------------------------
        tasks_raw = [
            Task(
                id="task-1",
                title="Implement user authentication",
                description="Build JWT-based auth flow with login, register, and token refresh endpoints.",
                status=TaskStatus.IN_PROGRESS,
                assigned_agent_id="agent-dev",
                priority=TaskPriority.P0,
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(hours=3),
            ),
            Task(
                id="task-2",
                title="Set up database schema",
                description="Design and apply Postgres migrations for users, projects, and tasks tables.",
                status=TaskStatus.DONE,
                assigned_agent_id="agent-dev",
                priority=TaskPriority.P0,
                created_at=now - timedelta(days=3),
                updated_at=now - timedelta(days=1),
            ),
            Task(
                id="task-3",
                title="Write unit tests for auth module",
                description="Cover login, registration, token refresh, and error cases with pytest.",
                status=TaskStatus.REVIEW,
                assigned_agent_id="agent-cr",
                priority=TaskPriority.P1,
                created_at=now - timedelta(days=1),
                updated_at=now - timedelta(hours=1),
            ),
            Task(
                id="task-4",
                title="Create CI/CD pipeline",
                description="Set up GitHub Actions for linting, tests, and deploy on merge to main.",
                status=TaskStatus.BACKLOG,
                assigned_agent_id=None,
                priority=TaskPriority.P1,
                created_at=now - timedelta(hours=12),
                updated_at=now - timedelta(hours=12),
            ),
            Task(
                id="task-5",
                title="Implement role-based access control",
                description="Add RBAC middleware to protect admin and team-lead routes.",
                status=TaskStatus.BACKLOG,
                assigned_agent_id=None,
                priority=TaskPriority.P2,
                created_at=now - timedelta(hours=6),
                updated_at=now - timedelta(hours=6),
            ),
            Task(
                id="task-6",
                title="Build dashboard analytics API",
                description="Aggregate sprint velocity, burndown, and per-agent throughput metrics.",
                status=TaskStatus.TESTING,
                assigned_agent_id="agent-qa",
                priority=TaskPriority.P1,
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(hours=5),
            ),
        ]
        for t in tasks_raw:
            self.tasks[t.id] = t

        # -- Sprint --------------------------------------------------------
        self.sprint = Sprint(
            id="sprint-1",
            name="Sprint 1 - Foundation",
            tasks=[t.id for t in tasks_raw],
            start_date=now - timedelta(days=7),
            end_date=now + timedelta(days=7),
            status=SprintStatus.ACTIVE,
        )

        # -- Activity log --------------------------------------------------
        self.activity_log = [
            ActivityEntry(
                id="act-1",
                timestamp=now - timedelta(hours=4),
                agent_id="agent-dev",
                message="Started working on user authentication.",
                type=ActivityType.INFO,
            ),
            ActivityEntry(
                id="act-2",
                timestamp=now - timedelta(hours=3),
                agent_id="agent-cr",
                message="Began code review for auth unit tests.",
                type=ActivityType.INFO,
            ),
            ActivityEntry(
                id="act-3",
                timestamp=now - timedelta(hours=2),
                agent_id="agent-pm",
                message="Reprioritised backlog: CI/CD pipeline moved up.",
                type=ActivityType.INFO,
            ),
            ActivityEntry(
                id="act-4",
                timestamp=now - timedelta(hours=1),
                agent_id="agent-boss",
                message="Flagged potential scope creep on RBAC task.",
                type=ActivityType.WARNING,
            ),
            ActivityEntry(
                id="act-5",
                timestamp=now - timedelta(minutes=30),
                agent_id="agent-qa",
                message="Dashboard analytics API ready for testing.",
                type=ActivityType.INFO,
            ),
        ]

        # -- Escalations ---------------------------------------------------
        esc = Escalation(
            id="esc-1",
            title="Scope Creep Risk on RBAC",
            description=(
                "The RBAC task has expanded to include tenant-level isolation, "
                "which was not in the original spec. This may delay Sprint 1."
            ),
            recommendation="Defer tenant isolation to Sprint 2 and keep RBAC scoped to role checks only.",
            options=[
                "Accept recommendation - defer tenant isolation",
                "Expand Sprint 1 deadline by 3 days",
                "Split into two separate tasks",
            ],
            resolved=False,
        )
        self.escalations[esc.id] = esc

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
