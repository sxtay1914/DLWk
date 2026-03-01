"""Background simulation that makes the demo look alive.

Every few seconds it randomly:
  - changes agent statuses
  - moves tasks between kanban columns
  - generates activity log entries
  - occasionally triggers Boss escalations
"""

from __future__ import annotations

import asyncio
import random
import uuid
from typing import TYPE_CHECKING

from models import (
    ActivityType,
    AgentStatus,
    Escalation,
    TaskPriority,
    TaskStatus,
)

if TYPE_CHECKING:
    from state import StateManager

# ── Possible simulation events ───────────────────────────────────────────────

_STATUS_TRANSITIONS: dict[TaskStatus, TaskStatus] = {
    TaskStatus.BACKLOG: TaskStatus.IN_PROGRESS,
    TaskStatus.IN_PROGRESS: TaskStatus.REVIEW,
    TaskStatus.REVIEW: TaskStatus.TESTING,
    TaskStatus.TESTING: TaskStatus.DONE,
}

_AGENT_STATUSES = [
    AgentStatus.IDLE,
    AgentStatus.WORKING,
    AgentStatus.THINKING,
    AgentStatus.MEETING,
]

_ACTIVITY_MESSAGES = [
    ("agent-dev", "Pushed 3 new commits to feature branch."),
    ("agent-dev", "Refactored authentication middleware for clarity."),
    ("agent-qa", "Found a flaky test in the auth suite -- investigating."),
    ("agent-qa", "All regression tests passing on staging."),
    ("agent-cr", "Left 4 inline comments on the auth PR."),
    ("agent-cr", "Approved PR #42 after revisions."),
    ("agent-pm", "Updated sprint velocity chart."),
    ("agent-pm", "Moved CI/CD pipeline task to top of backlog."),
    ("agent-sm", "Daily stand-up completed. No blockers reported."),
    ("agent-sm", "Reminded team about Friday demo."),
    ("agent-boss", "Reviewed sprint burndown -- on track."),
    ("agent-boss", "Requested status update from Developer."),
]

_ESCALATION_TEMPLATES = [
    Escalation(
        id="",
        title="Test Coverage Below Threshold",
        description="Overall branch coverage has dropped to 62 %, below the 80 % team standard.",
        recommendation="Block the next merge until coverage is restored.",
        options=[
            "Block merges until 80 % coverage restored",
            "Lower threshold to 70 % temporarily",
            "Assign QA to write missing tests",
        ],
        resolved=False,
    ),
    Escalation(
        id="",
        title="Dependency Vulnerability Detected",
        description="npm audit reports a high-severity CVE in a transitive dependency of the auth module.",
        recommendation="Upgrade the dependency immediately and re-run tests.",
        options=[
            "Upgrade now and hotfix",
            "Defer to next sprint",
            "Replace dependency entirely",
        ],
        resolved=False,
    ),
    Escalation(
        id="",
        title="Sprint Goal at Risk",
        description="Two P0 tasks are still in progress with only 3 days remaining in the sprint.",
        recommendation="Consider reducing scope or extending the sprint by 2 days.",
        options=[
            "Extend sprint by 2 days",
            "Move one P0 to next sprint",
            "Add another developer to help",
        ],
        resolved=False,
    ),
]

_TASK_MOVE_MESSAGES = {
    TaskStatus.IN_PROGRESS: "{agent} started working on \"{task}\".",
    TaskStatus.REVIEW: "{agent} submitted \"{task}\" for code review.",
    TaskStatus.TESTING: "\"{task}\" moved to testing.",
    TaskStatus.DONE: "\"{task}\" completed!",
}


# ── Simulation loop ─────────────────────────────────────────────────────────

async def run_simulation(state: StateManager) -> None:
    """Infinite loop that mutates state to keep the dashboard lively."""

    await asyncio.sleep(5)  # let the server start up first

    while True:
        try:
            action = random.choices(
                ["agent_status", "move_task", "activity", "escalation"],
                weights=[30, 25, 35, 10],
                k=1,
            )[0]

            if action == "agent_status":
                await _sim_agent_status(state)
            elif action == "move_task":
                await _sim_move_task(state)
            elif action == "activity":
                await _sim_activity(state)
            elif action == "escalation":
                await _sim_escalation(state)

        except Exception as exc:
            # Never let the simulation crash the server
            print(f"[simulation] error: {exc}")

        delay = random.uniform(4, 10)
        await asyncio.sleep(delay)


# ── Individual simulation actions ────────────────────────────────────────────

async def _sim_agent_status(state: StateManager) -> None:
    agent_id = random.choice(list(state.agents.keys()))
    new_status = random.choice(_AGENT_STATUSES)
    agent = state.agents[agent_id]

    # If the agent transitions to WORKING, maybe assign a task
    current_task = agent.current_task
    if new_status == AgentStatus.WORKING and current_task is None:
        in_progress = [
            t for t in state.tasks.values()
            if t.status == TaskStatus.IN_PROGRESS and t.assigned_agent_id is None
        ]
        if in_progress:
            chosen = random.choice(in_progress)
            chosen.assigned_agent_id = agent_id
            current_task = chosen.id

    # If going idle, release any task assignment from the agent object
    if new_status == AgentStatus.IDLE:
        current_task = None

    # Slightly randomise position to simulate movement
    old_pos = agent.position
    new_pos = {
        "x": max(5, min(95, old_pos["x"] + random.randint(-5, 5))),
        "y": max(5, min(95, old_pos["y"] + random.randint(-5, 5))),
    }

    await state.update_agent(
        agent_id,
        status=new_status,
        current_task=current_task,
        position=new_pos,
    )


async def _sim_move_task(state: StateManager) -> None:
    movable = [
        t for t in state.tasks.values()
        if t.status in _STATUS_TRANSITIONS
    ]
    if not movable:
        return

    task = random.choice(movable)
    new_status = _STATUS_TRANSITIONS[task.status]

    # Determine which agent "did" this
    agent_id = task.assigned_agent_id
    if new_status == TaskStatus.REVIEW:
        agent_id = "agent-cr"
    elif new_status == TaskStatus.TESTING:
        agent_id = "agent-qa"

    await state.update_task(task.id, status=new_status, assigned_agent_id=agent_id)

    # Also emit an activity entry describing the move
    msg_template = _TASK_MOVE_MESSAGES.get(new_status)
    if msg_template:
        agent_name = state.agents[agent_id].name if agent_id and agent_id in state.agents else "System"
        msg = msg_template.format(agent=agent_name, task=task.title)
        await state.add_activity(msg, agent_id=agent_id)


async def _sim_activity(state: StateManager) -> None:
    agent_id, message = random.choice(_ACTIVITY_MESSAGES)
    await state.add_activity(message, agent_id=agent_id)


async def _sim_escalation(state: StateManager) -> None:
    # Only escalate if we don't already have too many unresolved
    unresolved = [e for e in state.escalations.values() if not e.resolved]
    if len(unresolved) >= 3:
        # Resolve the oldest one instead
        oldest = unresolved[0]
        oldest.resolved = True
        await state.sio.emit("escalation", oldest.model_dump(mode="json"))
        await state.add_activity(
            f"Escalation \"{oldest.title}\" resolved.",
            agent_id="agent-boss",
            activity_type=ActivityType.WARNING,
        )
        return

    template = random.choice(_ESCALATION_TEMPLATES)
    esc = Escalation(
        id=f"esc-{uuid.uuid4().hex[:8]}",
        title=template.title,
        description=template.description,
        recommendation=template.recommendation,
        options=list(template.options),
        resolved=False,
    )
    await state.add_escalation(esc)
    await state.add_activity(
        f"Boss escalated: {esc.title}",
        agent_id="agent-boss",
        activity_type=ActivityType.ESCALATION,
    )
