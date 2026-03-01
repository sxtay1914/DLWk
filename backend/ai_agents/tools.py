"""Function tools that agents use to interact with the project state.

All tools receive a RunContextWrapper[TeamContext] to access the shared
StateManager, which emits Socket.IO events on every mutation.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from agents import function_tool, RunContextWrapper

if TYPE_CHECKING:
    from state import StateManager

from models import (
    ActivityType,
    AgentStatus,
    Escalation,
    Task,
    TaskPriority,
    TaskStatus,
)


@dataclass
class TeamContext:
    """Shared context passed to all agents during a run."""

    state: "StateManager"
    # Tracks which agent is currently "active" for activity log attribution
    current_agent_id: str = "agent-boss"
    # Collects a summary of everything that happened
    event_log: list[str] = field(default_factory=list)


# ── Task management tools ────────────────────────────────────────────────

@function_tool
async def create_task(
    ctx: RunContextWrapper[TeamContext],
    title: str,
    description: str,
    priority: str = "P1",
    assigned_agent_id: str | None = None,
) -> str:
    """Create a new task on the sprint board. Priority can be P0, P1, or P2."""
    state = ctx.context.state
    prio = TaskPriority(priority) if priority in ("P0", "P1", "P2") else TaskPriority.P1

    task = Task(
        id=f"task-{uuid.uuid4().hex[:6]}",
        title=title,
        description=description,
        status=TaskStatus.BACKLOG,
        assigned_agent_id=assigned_agent_id,
        priority=prio,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await state.add_task(task)
    await state.add_activity(
        f'Created task "{title}" [{priority}]',
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Task created: {title}")
    return f"Task {task.id} created: {title} [{priority}]"


@function_tool
async def list_tasks(ctx: RunContextWrapper[TeamContext]) -> str:
    """List all current tasks with their status and assignee."""
    state = ctx.context.state
    if not state.tasks:
        return "No tasks found."
    lines = []
    for t in state.tasks.values():
        assignee = t.assigned_agent_id or "unassigned"
        lines.append(f"- {t.id}: {t.title} [{t.status.value}] assigned={assignee} priority={t.priority.value}")
    return "\n".join(lines)


@function_tool
async def update_task_status(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
    new_status: str,
) -> str:
    """Move a task to a new status column. Valid statuses: backlog, in_progress, review, testing, done."""
    state = ctx.context.state
    try:
        status = TaskStatus(new_status)
    except ValueError:
        return f"Invalid status '{new_status}'. Use: backlog, in_progress, review, testing, done."

    task = await state.update_task(task_id, status=status)
    if task is None:
        return f"Task {task_id} not found."

    await state.add_activity(
        f'Moved "{task.title}" to {new_status}',
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Task {task_id} → {new_status}")
    return f"Task {task_id} moved to {new_status}."


@function_tool
async def assign_task(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
    agent_id: str,
) -> str:
    """Assign a task to an agent. Agent IDs: agent-dev, agent-qa, agent-cr, agent-pm, agent-sm, agent-boss."""
    state = ctx.context.state

    if agent_id not in state.agents:
        return f"Agent {agent_id} not found. Valid: {', '.join(state.agents.keys())}"

    task = await state.update_task(task_id, assigned_agent_id=agent_id)
    if task is None:
        return f"Task {task_id} not found."

    agent = state.agents[agent_id]
    await state.update_agent(agent_id, current_task=task_id)
    await state.add_activity(
        f'Assigned "{task.title}" to {agent.name}',
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Assigned {task_id} to {agent.name}")
    return f"Task {task_id} assigned to {agent.name}."


@function_tool
async def get_sprint_info(ctx: RunContextWrapper[TeamContext]) -> str:
    """Get current sprint information including task counts per status."""
    state = ctx.context.state
    if not state.sprint:
        return "No active sprint."

    counts: dict[str, int] = {}
    for t in state.tasks.values():
        counts[t.status.value] = counts.get(t.status.value, 0) + 1

    lines = [
        f"Sprint: {state.sprint.name}",
        f"Status: {state.sprint.status.value}",
        f"Period: {state.sprint.start_date.date()} to {state.sprint.end_date.date()}",
        f"Total tasks: {len(state.tasks)}",
    ]
    for status, count in counts.items():
        lines.append(f"  {status}: {count}")
    return "\n".join(lines)


# ── Agent status tools ───────────────────────────────────────────────────

@function_tool
async def update_agent_status(
    ctx: RunContextWrapper[TeamContext],
    agent_id: str,
    status: str,
) -> str:
    """Update an agent's visual status. Valid: idle, working, thinking, meeting, celebrating."""
    state = ctx.context.state
    try:
        agent_status = AgentStatus(status)
    except ValueError:
        return f"Invalid status '{status}'. Use: idle, working, thinking, meeting, celebrating."

    agent = await state.update_agent(agent_id, status=agent_status)
    if agent is None:
        return f"Agent {agent_id} not found."
    return f"{agent.name} status set to {status}."


# ── Work simulation tools (Developer, QA, Code Reviewer) ────────────────

@function_tool
async def write_code(
    ctx: RunContextWrapper[TeamContext],
    filename: str,
    description: str,
) -> str:
    """Write code to a file. Describe what you're implementing."""
    state = ctx.context.state
    await state.update_agent("agent-dev", status=AgentStatus.WORKING)
    await state.add_activity(
        f"Writing {filename}: {description}",
        agent_id="agent-dev",
    )
    ctx.context.event_log.append(f"Code written: {filename}")
    return f"Successfully wrote {filename}. {description}"


@function_tool
async def run_command(
    ctx: RunContextWrapper[TeamContext],
    command: str,
    expected_output: str = "Success",
) -> str:
    """Run a shell command (e.g., npm install, pytest, git commit)."""
    state = ctx.context.state
    await state.add_activity(
        f"Running: `{command}`",
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Command: {command}")
    return f"$ {command}\n{expected_output}"


@function_tool
async def run_tests(
    ctx: RunContextWrapper[TeamContext],
    test_description: str,
    tests_passed: int = 8,
    tests_total: int = 8,
) -> str:
    """Run a test suite and report results."""
    state = ctx.context.state
    await state.update_agent("agent-qa", status=AgentStatus.WORKING)

    all_pass = tests_passed == tests_total
    activity_type = ActivityType.INFO if all_pass else ActivityType.WARNING

    await state.add_activity(
        f"Tests: {test_description} — {tests_passed}/{tests_total} passed",
        agent_id="agent-qa",
        activity_type=activity_type,
    )
    ctx.context.event_log.append(f"Tests: {tests_passed}/{tests_total} passed")

    if all_pass:
        return f"All {tests_total} tests passed for: {test_description}"
    return f"{tests_passed}/{tests_total} tests passed for: {test_description}. Some tests failed."


@function_tool
async def review_code(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
    feedback: str,
    approved: bool = True,
) -> str:
    """Review code for a task. Provide feedback and approve/reject."""
    state = ctx.context.state
    await state.update_agent("agent-cr", status=AgentStatus.WORKING)

    status = "Approved" if approved else "Changes requested"
    await state.add_activity(
        f"Code review for {task_id}: {status} — {feedback}",
        agent_id="agent-cr",
    )
    ctx.context.event_log.append(f"Review {task_id}: {status}")

    if approved:
        return f"Code review APPROVED for {task_id}. {feedback}"
    return f"Code review REJECTED for {task_id}. Changes needed: {feedback}"


# ── Escalation tools ────────────────────────────────────────────────────

@function_tool
async def create_escalation(
    ctx: RunContextWrapper[TeamContext],
    title: str,
    description: str,
    recommendation: str,
    options: str,
) -> str:
    """Escalate a decision to the human. Options should be comma-separated."""
    state = ctx.context.state
    option_list = [o.strip() for o in options.split(",")]

    esc = Escalation(
        id=f"esc-{uuid.uuid4().hex[:6]}",
        title=title,
        description=description,
        recommendation=recommendation,
        options=option_list,
        resolved=False,
    )
    await state.add_escalation(esc)
    await state.add_activity(
        f"Escalation: {title}",
        agent_id="agent-boss",
        activity_type=ActivityType.ESCALATION,
    )
    ctx.context.event_log.append(f"Escalation: {title}")
    return f"Escalation created: {title}. Waiting for human decision."


@function_tool
async def log_activity(
    ctx: RunContextWrapper[TeamContext],
    message: str,
    activity_type: str = "info",
) -> str:
    """Log a message to the activity feed. Types: info, warning, escalation."""
    state = ctx.context.state
    try:
        atype = ActivityType(activity_type)
    except ValueError:
        atype = ActivityType.INFO

    await state.add_activity(
        message,
        agent_id=ctx.context.current_agent_id,
        activity_type=atype,
    )
    return f"Logged: {message}"
