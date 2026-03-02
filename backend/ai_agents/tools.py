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

from models import (
    ActivityType,
    AgentStatus,
    Checkpoint,
    Escalation,
    Task,
    TaskPriority,
    TaskStatus,
)


if TYPE_CHECKING:
    import socketio
    from state import StateManager


@dataclass
class TeamContext:
    """Shared context passed to all agents during a run."""

    state: "StateManager"
    sio: "socketio.AsyncServer | None" = None
    # Tracks which agent is currently "active" for activity log attribution
    current_agent_id: str = "agent-boss"
    # Collects a summary of everything that happened
    event_log: list[str] = field(default_factory=list)
    # Conversation session ID for multi-turn chat
    session_id: str | None = None


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
    """Assign a task to an agent. Agent IDs: agent-dev, agent-dev2, agent-qa, agent-cr, agent-pm, agent-sm, agent-boss."""
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
    activity: str = "",
) -> str:
    """Update an agent's visual status and what they're currently doing.
    Status: idle, working, thinking, meeting, celebrating.
    Activity: short description, e.g. 'Writing auth.py', 'Reviewing PR #3'. Leave empty to clear.
    """
    state = ctx.context.state
    try:
        agent_status = AgentStatus(status)
    except ValueError:
        return f"Invalid status '{status}'. Use: idle, working, thinking, meeting, celebrating."

    updates: dict = {"status": agent_status}
    if activity:
        updates["current_activity"] = activity
    elif agent_status == AgentStatus.IDLE:
        updates["current_activity"] = None

    agent = await state.update_agent(agent_id, **updates)
    if agent is None:
        return f"Agent {agent_id} not found."
    return f"{agent.name} status set to {status}." + (f" Activity: {activity}" if activity else "")


# ── Work simulation tools (Developer, QA, Code Reviewer) ────────────────

@function_tool
async def write_code(
    ctx: RunContextWrapper[TeamContext],
    filename: str,
    description: str,
) -> str:
    """Write code to a file. Describe what you're implementing."""
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Writing {filename}")
    await state.add_activity(
        f"Writing {filename}: {description}",
        agent_id=agent_id,
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
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Testing: {test_description}")

    all_pass = tests_passed == tests_total
    activity_type = ActivityType.INFO if all_pass else ActivityType.WARNING

    await state.add_activity(
        f"Tests: {test_description} — {tests_passed}/{tests_total} passed",
        agent_id=agent_id,
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
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Reviewing {task_id}")

    status = "Approved" if approved else "Changes requested"
    await state.add_activity(
        f"Code review for {task_id}: {status} — {feedback}",
        agent_id=agent_id,
    )
    ctx.context.event_log.append(f"Review {task_id}: {status}")

    if approved:
        return f"Code review APPROVED for {task_id}. {feedback}"
    return f"Code review REJECTED for {task_id}. Changes needed: {feedback}"


# ── Checkpoint tools (human-in-the-loop approval) ──────────────────────

# Map current status → next status for the checkpoint flow
_NEXT_STATUS = {
    TaskStatus.IN_PROGRESS: TaskStatus.REVIEW,
    TaskStatus.REVIEW: TaskStatus.TESTING,
    TaskStatus.TESTING: TaskStatus.DONE,
}


@function_tool
async def report_task_completion(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
    summary: str,
) -> str:
    """Report that you've finished working on a task. This creates a checkpoint
    for the human to review before the task advances to the next stage.

    task_id: The task you finished.
    summary: A brief description of what you did (e.g., 'Built the checkout form component with Stripe CardElement').
    """
    state = ctx.context.state
    task = state.tasks.get(task_id)
    if task is None:
        return f"Task {task_id} not found."

    next_status = _NEXT_STATUS.get(task.status)
    if next_status is None:
        return f"Task {task_id} is in '{task.status.value}' — no checkpoint needed."

    agent = state.agents.get(ctx.context.current_agent_id)
    agent_name = agent.name if agent else "Unknown"
    agent_color = agent.avatar_color if agent else "#666"

    checkpoint = Checkpoint(
        id=f"cp-{uuid.uuid4().hex[:6]}",
        task_id=task_id,
        task_title=task.title,
        agent_id=ctx.context.current_agent_id,
        agent_name=agent_name,
        agent_color=agent_color,
        message=summary,
        next_status=next_status,
    )
    await state.add_checkpoint(checkpoint)

    await state.add_activity(
        f'{agent_name}: Completed work on "{task.title}" — awaiting approval',
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Checkpoint: {task.title} → {next_status.value}")

    return (
        f"Checkpoint created for '{task.title}'. The human will review and decide whether to "
        f"advance it to {next_status.value}, request changes, or pause. Do NOT move this task yourself."
    )


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


# ── Boss conversation tools ──────────────────────────────────────────

@function_tool
async def present_plan(
    ctx: RunContextWrapper[TeamContext],
    plan_items: str,
) -> str:
    """Present a numbered plan to the user for approval.

    plan_items should be a pipe-separated list of plan steps, e.g.:
    "Set up project structure|Implement auth module|Write tests|Deploy"

    The plan will be shown to the user who can approve or request changes.
    """
    items = [item.strip() for item in plan_items.split("|") if item.strip()]
    if not items:
        return "Error: No plan items provided."

    sio = ctx.context.sio
    if sio:
        await sio.emit("boss_plan", {
            "session_id": ctx.context.session_id,
            "plan": items,
        })

    ctx.context.event_log.append(f"Plan presented: {len(items)} steps")
    return (
        f"Plan with {len(items)} steps has been presented to the user. "
        "Wait for their approval before proceeding. Do NOT delegate to PM or SM yet."
    )


@function_tool
async def execute_approved_plan(
    ctx: RunContextWrapper[TeamContext],
    plan_summary: str,
) -> str:
    """Execute a plan that the user has approved. This triggers the PM to create tasks
    and the SM to begin execution.

    plan_summary: A brief summary of what was approved.
    """
    state = ctx.context.state
    sio = ctx.context.sio

    await state.add_activity(
        f"Plan approved — starting execution: {plan_summary}",
        agent_id="agent-boss",
    )
    if sio:
        await sio.emit("boss_plan_approved", {
            "session_id": ctx.context.session_id,
            "summary": plan_summary,
        })

    ctx.context.event_log.append(f"Plan approved: {plan_summary}")
    return (
        f"Plan approved. Now delegate to the PM with this plan: {plan_summary}. "
        "After the PM creates tasks, delegate to the Scrum Master and tell them: "
        "'List all backlog tasks, move each to in_progress, assign to agents (split coding work between agent-dev and agent-dev2), then call run_agents_parallel to execute all work concurrently.'"
    )


# ── Parallel execution tool ─────────────────────────────────────────

@function_tool
async def run_agents_parallel(
    ctx: RunContextWrapper[TeamContext],
) -> str:
    """Run all assigned agents in parallel on their in_progress tasks.

    Call this AFTER you have moved tasks to in_progress and assigned agents.
    All agents will work concurrently — developers code, QA tests, CR reviews — at the same time.
    Returns a summary when all agents have finished their current work.
    """
    import asyncio

    from agents import Runner

    state = ctx.context.state
    sio = ctx.context.sio

    # Find all in_progress tasks grouped by assigned agent
    agent_tasks: dict[str, list] = {}
    for task in state.tasks.values():
        if task.status == TaskStatus.IN_PROGRESS and task.assigned_agent_id:
            aid = task.assigned_agent_id
            if aid not in agent_tasks:
                agent_tasks[aid] = []
            agent_tasks[aid].append(task)

    if not agent_tasks:
        return "No in_progress tasks with assigned agents found. Assign tasks first."

    # Lazy import to avoid circular deps (definitions imports tools)
    from ai_agents.definitions import get_agent_for_role

    async def run_single_agent(agent_id: str, tasks: list) -> str:
        """Run one agent on its assigned tasks."""
        agent_def = get_agent_for_role(agent_id)
        if agent_def is None:
            return f"{agent_id}: No agent definition — skipped."

        task_desc = "\n".join(
            f"- {t.id}: {t.title} — {t.description}" for t in tasks
        )
        prompt = (
            f"You have been assigned the following tasks. Work on ALL of them now.\n"
            f"Your agent ID is {agent_id}. Use it when updating your status.\n\n"
            f"{task_desc}"
        )

        agent_ctx = TeamContext(
            state=state,
            sio=sio,
            current_agent_id=agent_id,
        )

        try:
            result = await Runner.run(
                agent_def,
                prompt,
                context=agent_ctx,
                max_turns=10,
            )
            # Set agent idle when done
            await state.update_agent(agent_id, status=AgentStatus.IDLE, current_activity=None)
            return f"{agent_id}: {result.final_output or 'Done.'}"
        except Exception as e:
            await state.update_agent(agent_id, status=AgentStatus.IDLE, current_activity=None)
            return f"{agent_id}: Error — {e}"

    # Run all agents concurrently
    agent_ids = list(agent_tasks.keys())
    results = await asyncio.gather(
        *[run_single_agent(aid, agent_tasks[aid]) for aid in agent_ids],
        return_exceptions=True,
    )

    summary_lines = []
    for aid, result in zip(agent_ids, results):
        if isinstance(result, Exception):
            summary_lines.append(f"{aid}: Error — {result}")
        else:
            summary_lines.append(str(result))

    ctx.context.event_log.append(f"Parallel execution: {len(agent_ids)} agents ran concurrently")
    return "Parallel execution complete:\n" + "\n".join(summary_lines)


# ── Agent routing tool ──────────────────────────────────────────────

@function_tool
async def route_to_boss(
    ctx: RunContextWrapper[TeamContext],
    message: str,
    reason: str,
) -> str:
    """Route a request to the Boss because it's outside your role.
    Use this when the user asks you to do something that isn't your job.

    message: The user's original request.
    reason: Why you're routing it (e.g., 'This is a coding task, not QA').
    """
    state = ctx.context.state
    sio = ctx.context.sio

    agent = state.agents.get(ctx.context.current_agent_id)
    agent_name = agent.name if agent else "Unknown"

    await state.add_activity(
        f"{agent_name} routed request to Boss: {reason}",
        agent_id=ctx.context.current_agent_id,
    )

    if sio:
        await sio.emit("agent_route", {
            "from_agent_id": ctx.context.current_agent_id,
            "from_agent_name": agent_name,
            "message": message,
            "reason": reason,
        })

    return f"Request routed to the Boss. {reason}"
