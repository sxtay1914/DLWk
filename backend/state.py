"""In-memory state manager for the AI-governed dev team backend.

Holds all agents, tasks, sprint, activity log, and escalations.
Provides helper methods that mutate state and emit Socket.IO events.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

import socketio

# ── Terminal logging helpers ──────────────────────────────────────────────────

_ANSI = {
    "agent-boss": "\033[33m",        # amber/yellow
    "agent-pm":   "\033[34m",        # blue
    "agent-sm":   "\033[36m",        # cyan
    "agent-dev":  "\033[32m",        # green
    "agent-dev2": "\033[92m",        # bright green
    "agent-qa":   "\033[38;5;208m",  # orange
    "agent-cr":   "\033[35m",        # purple/magenta
}
_RESET = "\033[0m"
_BOLD  = "\033[1m"
_DIM   = "\033[2m"

_STATUS_ICONS = {
    "idle":        "💤",
    "working":     "⚙️ ",
    "thinking":    "🤔",
    "meeting":     "🤝",
    "celebrating": "🎉",
}


def _ts() -> str:
    return datetime.utcnow().strftime("%H:%M:%S")


def _agent_log(agent_id: str, agent_name: str, msg: str) -> None:
    color = _ANSI.get(agent_id, "")
    print(f"{_DIM}[{_ts()}]{_RESET} {color}{_BOLD}[{agent_name}]{_RESET} {msg}")


from models import (
    ActivityEntry,
    ActivityType,
    Agent,
    AgentRole,
    AgentStatus,
    Artifact,
    Checkpoint,
    CheckpointStatus,
    Escalation,
    PendingFileChange,
    Sprint,
    Task,
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
        self.checkpoints: dict[str, Checkpoint] = {}
        self.artifacts: list[Artifact] = []
        self.pending_file_changes: dict[str, PendingFileChange] = {}
        self._next_ticket: int = 1
        self.workspace_root: str | None = None

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

        log_parts: list[str] = []
        new_status = kwargs.get("status")
        new_activity = kwargs.get("current_activity")
        if new_status is not None:
            status_val = new_status.value if hasattr(new_status, "value") else str(new_status)
            icon = _STATUS_ICONS.get(status_val, "•")
            log_parts.append(f"{icon} {status_val.upper()}")
        if new_activity:
            log_parts.append(f'"{new_activity}"')

        for key, value in kwargs.items():
            if hasattr(agent, key):
                setattr(agent, key, value)

        if log_parts:
            _agent_log(agent_id, agent.name, " — ".join(log_parts))

        await self.sio.emit("agent_update", agent.model_dump(mode="json"))
        return agent

    async def add_task(self, task: Task) -> Task:
        task.ticket_number = self._next_ticket
        self._next_ticket += 1
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
        # Resolve agent name and color from agent_id
        agent_name: Optional[str] = None
        agent_color: Optional[str] = None
        if agent_id and agent_id in self.agents:
            agent = self.agents[agent_id]
            agent_name = agent.name
            agent_color = agent.avatar_color

        entry = ActivityEntry(
            id=f"act-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.utcnow(),
            agent_id=agent_id,
            agent_name=agent_name,
            agent_color=agent_color,
            message=message,
            type=activity_type,
        )
        self.activity_log.append(entry)
        await self.sio.emit("activity", entry.model_dump(mode="json"))
        _agent_log(agent_id or "system", agent_name or "System", f"📋 {message}")
        return entry

    async def add_escalation(self, escalation: Escalation) -> Escalation:
        self.escalations[escalation.id] = escalation
        await self.sio.emit("escalation", escalation.model_dump(mode="json"))
        return escalation

    async def create_sprint(self, sprint: Sprint) -> Sprint:
        self.sprint = sprint
        return sprint

    async def add_checkpoint(self, checkpoint: Checkpoint) -> Checkpoint:
        self.checkpoints[checkpoint.id] = checkpoint
        await self.sio.emit("task_checkpoint", checkpoint.model_dump(mode="json"))
        return checkpoint

    async def resolve_checkpoint(
        self,
        checkpoint_id: str,
        status: CheckpointStatus,
        feedback: Optional[str] = None,
    ) -> Optional[Checkpoint]:
        cp = self.checkpoints.get(checkpoint_id)
        if cp is None:
            return None
        cp.status = status
        await self.sio.emit("checkpoint_resolved", {
            "checkpoint_id": checkpoint_id,
            "status": status.value,
            "feedback": feedback,
        })

        if status == CheckpointStatus.APPROVED:
            # Advance the task to the next status
            await self.update_task(cp.task_id, status=cp.next_status)
            await self.add_activity(
                f'Approved: "{cp.task_title}" → {cp.next_status.value}',
                agent_id=cp.agent_id,
            )
        elif status == CheckpointStatus.CHANGES_REQUESTED:
            await self.add_activity(
                f'Changes requested on "{cp.task_title}": {feedback or "No details"}',
                agent_id=cp.agent_id,
            )
        elif status == CheckpointStatus.PAUSED:
            await self.add_activity(
                f'Paused: "{cp.task_title}"',
                agent_id=cp.agent_id,
            )

        return cp

    async def add_artifact(self, artifact: Artifact) -> Artifact:
        self.artifacts.append(artifact)
        await self.sio.emit("artifact", artifact.model_dump(mode="json"))
        return artifact

    def get_task_artifacts(self, task_id: str) -> list[Artifact]:
        return [a for a in self.artifacts if a.task_id == task_id]

    async def add_file_change(self, change: PendingFileChange) -> PendingFileChange:
        self.pending_file_changes[change.id] = change
        await self.sio.emit("file_change_pending", change.model_dump(mode="json"))
        return change

    async def resolve_file_change(
        self,
        change_id: str,
        action: str,
        feedback: str = "",
    ) -> Optional[PendingFileChange]:
        change = self.pending_file_changes.get(change_id)
        if change is None:
            return None
        change.status = action  # "approved" or "rejected"
        await self.sio.emit("file_change_resolved", {
            "id": change_id,
            "status": action,
            "feedback": feedback,
        })
        if action == "rejected" and change.old_content is not None:
            # Restore old content to disk
            from pathlib import Path
            if self.workspace_root:
                target = Path(self.workspace_root) / change.filename
                if target.exists():
                    target.write_text(change.old_content, encoding="utf-8")
            await self.add_activity(
                f'File change rejected: {change.filename} — {feedback or "No reason given"}',
                agent_id=change.agent_id,
            )
        elif action == "rejected" and change.old_content is None:
            # New file was rejected — delete it
            from pathlib import Path
            if self.workspace_root:
                target = Path(self.workspace_root) / change.filename
                if target.exists():
                    target.unlink()
            await self.add_activity(
                f'New file rejected: {change.filename} — {feedback or "No reason given"}',
                agent_id=change.agent_id,
            )
        elif action == "approved":
            await self.add_activity(
                f'File change approved: {change.filename}',
                agent_id=change.agent_id,
            )
        return change

    # ── Terminal status table ─────────────────────────────────────────────

    def print_status_table(self) -> None:
        """Print a formatted agent status summary to the terminal."""
        sep = "─" * 62
        print(f"\n{_BOLD}{'═' * 62}{_RESET}")
        print(f"{_BOLD}  AGENT STATUS @ {_ts()}{_RESET}")
        print(sep)
        for agent in self.agents.values():
            color = _ANSI.get(agent.id, "")
            icon = _STATUS_ICONS.get(agent.status.value, "•")
            name_col = f"{color}{_BOLD}{agent.name:<16}{_RESET}"
            status_col = f"{icon} {agent.status.value:<12}"
            activity = agent.current_activity or ""
            if len(activity) > 28:
                activity = activity[:25] + "..."
            print(f"  {name_col} {status_col} {_DIM}{activity}{_RESET}")
        print(sep)
        total = len(self.tasks)
        active = sum(1 for t in self.tasks.values() if t.status.value not in ("done", "backlog"))
        pending_cp = sum(1 for c in self.checkpoints.values() if c.status.value == "pending")
        print(
            f"  Tasks: {active} active / {total} total"
            + (f"  |  {_BOLD}⚑ {pending_cp} checkpoint(s) pending{_RESET}" if pending_cp else "")
        )
        print(f"{'═' * 62}\n")
