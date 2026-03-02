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
    Artifact,
    ArtifactType,
    Checkpoint,
    Escalation,
    SDLCEvent,
    SDLCPhase,
    Task,
    TaskPriority,
    TaskStatus,
)
from sdlc_store import AGENT_TO_PHASE, extract_risk_flags, infer_artifact_from_message


if TYPE_CHECKING:
    import socketio
    from state import StateManager
    from sdlc_store import SDLCEventStore


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
    # SDLC transparency — trace ID groups all events in one workflow run
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    sdlc_store: "SDLCEventStore | None" = None


# ── SDLC event emission helper ────────────────────────────────────────────────

async def _emit_sdlc_event(
    ctx: RunContextWrapper[TeamContext],
    phase: SDLCPhase,
    summary: str,
    artifact_type: ArtifactType | None = None,
    artifact_ref: str | None = None,
    reasoning_summary: str = "",
    task_id: str | None = None,
    severity: str = "info",
    outcome: str = "success",
    outcome_detail: str | None = None,
    risk_flags: list[str] | None = None,
    is_phase_gate: bool = False,
    tool_name: str | None = None,
) -> None:
    """Emit a structured SDLC event if the context has an sdlc_store."""
    store = ctx.context.sdlc_store
    if store is None:
        return

    agent_id = ctx.context.current_agent_id
    state = ctx.context.state
    agent = state.agents.get(agent_id)

    task_title: str | None = None
    if task_id:
        task = state.tasks.get(task_id)
        if task:
            task_title = task.title

    event = SDLCEvent(
        event_id=f"evt-{uuid.uuid4().hex[:8]}",
        trace_id=ctx.context.trace_id,
        agent_id=agent_id,
        agent_name=agent.name if agent else agent_id,
        agent_color=agent.avatar_color if agent else "#666",
        phase=phase,
        artifact_type=artifact_type,
        artifact_ref=artifact_ref,
        task_id=task_id,
        task_title=task_title,
        summary=summary,
        reasoning_summary=reasoning_summary,
        tool_name=tool_name,
        severity=severity,
        outcome=outcome,
        outcome_detail=outcome_detail,
        risk_flags=risk_flags or [],
        is_phase_gate=is_phase_gate,
        timestamp=datetime.utcnow(),
    )
    await store.ingest(event)


# ── Task management tools ────────────────────────────────────────────────

@function_tool
async def create_task(
    ctx: RunContextWrapper[TeamContext],
    title: str,
    description: str,
    priority: str = "P1",
    assigned_agent_id: str | None = None,
    sdlc_stage: str | None = None,
    definition_of_done: str | None = None,
    risk_tags: str | None = None,
    estimated_size: str | None = None,
    dependencies: str | None = None,
) -> str:
    """Create a new task on the sprint board.

    priority: P0 (critical), P1 (normal), P2 (nice-to-have)
    sdlc_stage: Plan | Design | Build | Test | Review | Deploy | Maintain
    definition_of_done: bullet-point checklist of what "done" means for this task
    risk_tags: comma-separated risk labels, e.g. auth,db,migration,security,perf
    estimated_size: S (< 4h) | M (4–16h) | L (> 16h)
    dependencies: comma-separated titles of tasks that must complete first
    """
    state = ctx.context.state
    prio = TaskPriority(priority) if priority in ("P0", "P1", "P2") else TaskPriority.P1

    task = Task(
        id=f"task-{uuid.uuid4().hex[:6]}",
        title=title,
        description=description,
        status=TaskStatus.BACKLOG,
        assigned_agent_id=assigned_agent_id,
        priority=prio,
        sdlc_stage=sdlc_stage,
        definition_of_done=definition_of_done,
        risk_tags=risk_tags,
        estimated_size=estimated_size,
        dependencies=dependencies,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await state.add_task(task)
    await state.add_activity(
        f'Created task "{title}" [{priority}]',
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Task created: {title}")

    # SDLC event — task creation is always a Planning phase artifact
    parsed_risk_flags = [r.strip() for r in (risk_tags or "").split(",") if r.strip()]
    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.PLANNING,
        summary=f'Task created: "{title}" [{priority}]',
        artifact_type=ArtifactType.TASK_BACKLOG,
        artifact_ref=task.id,
        reasoning_summary=(
            f"Priority: {priority} · Size: {estimated_size or 'unset'} · "
            f"Stage: {sdlc_stage or 'unset'} · DoD: {(definition_of_done or '')[:100]}"
        ),
        task_id=task.id,
        risk_flags=parsed_risk_flags,
        severity="warning" if any(f in parsed_risk_flags for f in ("auth", "security")) else "info",
        tool_name="create_task",
    )
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

    # Switch context identity so subsequent tool calls are attributed to this agent
    if agent_id in state.agents:
        ctx.context.current_agent_id = agent_id

    return f"{agent.name} status set to {status}." + (f" Activity: {activity}" if activity else "")


# ── Work simulation tools (Developer, QA, Code Reviewer) ────────────────

@function_tool
async def write_code(
    ctx: RunContextWrapper[TeamContext],
    filename: str,
    description: str,
    code: str,
    language: str = "",
) -> str:
    """Write code to a file. You MUST provide the actual code content.

    filename: The file path (e.g., 'src/auth.py', 'components/Login.tsx')
    description: Brief explanation of what this code does
    code: The FULL source code content of the file. Write complete, production-quality code.
    language: Programming language (e.g., 'python', 'typescript', 'javascript')
    """
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Writing {filename}")

    # Find the task this agent is working on
    agent = state.agents.get(agent_id)
    task_id = agent.current_task if agent else None

    # Store as artifact
    artifact = Artifact(
        id=f"art-{uuid.uuid4().hex[:6]}",
        task_id=task_id or "",
        agent_id=agent_id,
        filename=filename,
        content=code,
        language=language or _guess_language(filename),
    )
    await state.add_artifact(artifact)

    await state.add_activity(
        f"Wrote {filename}: {description}",
        agent_id=agent_id,
    )
    ctx.context.event_log.append(f"Code written: {filename}")

    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.BUILD,
        summary=f"Wrote {filename}",
        artifact_type=ArtifactType.CODE_FILE,
        artifact_ref=filename,
        reasoning_summary=description[:300],
        risk_flags=extract_risk_flags(description),
        tool_name="write_code",
    )
    return f"Successfully wrote {filename} ({len(code.splitlines())} lines). {description}"


def _guess_language(filename: str) -> str:
    """Guess language from file extension."""
    ext_map = {
        ".py": "python", ".ts": "typescript", ".tsx": "typescript",
        ".js": "javascript", ".jsx": "javascript", ".rs": "rust",
        ".go": "go", ".java": "java", ".css": "css", ".html": "html",
        ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".sql": "sql",
    }
    for ext, lang in ext_map.items():
        if filename.endswith(ext):
            return lang
    return ""


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

    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.BUILD,
        summary=f"Command: `{command}`",
        artifact_type=ArtifactType.COMMAND_OUTPUT,
        reasoning_summary=f"Expected: {expected_output[:100]}",
        tool_name="run_command",
    )
    return f"$ {command}\n{expected_output}"


@function_tool
async def run_tests(
    ctx: RunContextWrapper[TeamContext],
    test_file: str,
    test_code: str,
    test_results: str,
    language: str = "",
) -> str:
    """Write and run tests. You MUST provide the actual test code and detailed results.

    test_file: The test file path (e.g., 'tests/test_auth.py')
    test_code: The FULL test source code. Write real, runnable test cases.
    test_results: Detailed test output showing each test case and its result.
        Format each line as: PASS test_name or FAIL test_name: reason
        Example:
        PASS test_login_valid_credentials
        PASS test_login_invalid_password
        FAIL test_login_rate_limit: Expected 429 status, got 200
    language: Programming language (e.g., 'python', 'typescript')
    """
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Testing: {test_file}")

    # Store test code as artifact
    agent = state.agents.get(agent_id)
    task_id = agent.current_task if agent else None

    artifact = Artifact(
        id=f"art-{uuid.uuid4().hex[:6]}",
        task_id=task_id or "",
        agent_id=agent_id,
        filename=test_file,
        content=test_code,
        language=language or _guess_language(test_file),
    )
    await state.add_artifact(artifact)

    # Parse results
    lines = [l.strip() for l in test_results.strip().splitlines() if l.strip()]
    passed = sum(1 for l in lines if l.startswith("PASS"))
    failed = sum(1 for l in lines if l.startswith("FAIL"))
    total = passed + failed

    all_pass = failed == 0
    activity_type = ActivityType.INFO if all_pass else ActivityType.WARNING

    await state.add_activity(
        f"Tests {test_file}: {passed}/{total} passed" + ("" if all_pass else f" ({failed} failed)"),
        agent_id=agent_id,
        activity_type=activity_type,
    )
    ctx.context.event_log.append(f"Tests: {passed}/{total} passed")


    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.TEST,
        summary=f"Tests: {passed}/{total} passed — {test_file}",
        artifact_type=ArtifactType.TEST_CASE_SUITE,
        reasoning_summary=f"{passed}/{total} tests passed",
        severity="info" if all_pass else "warning",
        outcome="success" if all_pass else "blocked",
        outcome_detail=None if all_pass else f"{failed} test(s) failed",
        tool_name="run_tests",
    )

    return f"Test results for {test_file}:\n{test_results}\n\nSummary: {passed}/{total} passed."


@function_tool
async def get_task_code(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
) -> str:
    """Retrieve all code artifacts written for a task. Use this before reviewing."""
    state = ctx.context.state
    artifacts = state.get_task_artifacts(task_id)
    if not artifacts:
        return f"No code artifacts found for task {task_id}."

    output = []
    for art in artifacts:
        output.append(f"--- {art.filename} ({art.language}) ---")
        output.append(art.content)
        output.append("")
    return "\n".join(output)


@function_tool
async def review_code(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
    feedback: str,
    approved: bool = True,
) -> str:
    """Review code for a task. You should call get_task_code first to read the actual code,
    then provide specific, line-level feedback referencing real code.

    task_id: The task being reviewed
    feedback: Specific feedback referencing actual code (mention filenames, function names, line issues)
    approved: Whether the code passes review
    """
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Reviewing {task_id}")

    status = "Approved" if approved else "Changes requested"
    await state.add_activity(
        f"Code review for {task_id}: {status} — {feedback}",
        agent_id=agent_id,
    )
    ctx.context.event_log.append(f"Review {task_id}: {status}")

    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.REVIEW,
        summary=f"Code review for {task_id}: {status}",
        artifact_type=ArtifactType.REVIEW_DECISION,
        artifact_ref=task_id,
        reasoning_summary=feedback[:300],
        task_id=task_id,
        severity="info" if approved else "warning",
        outcome="success" if approved else "blocked",
        tool_name="review_code",
    )

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

    # Derive the phase from the task's sdlc_stage field
    _stage_to_phase = {
        "build":    SDLCPhase.BUILD,
        "test":     SDLCPhase.TEST,
        "review":   SDLCPhase.REVIEW,
        "planning": SDLCPhase.PLANNING,
        "design":   SDLCPhase.DESIGN,
        "deploy":   SDLCPhase.DEPLOY,
        "maintain": SDLCPhase.MAINTAIN,
    }
    task_phase = _stage_to_phase.get(
        (task.sdlc_stage or "build").lower(), SDLCPhase.BUILD
    )
    # Infer phase from the agent role when no task stage is set
    if not task.sdlc_stage:
        task_phase = AGENT_TO_PHASE.get(ctx.context.current_agent_id, SDLCPhase.BUILD)

    await _emit_sdlc_event(
        ctx,
        phase=task_phase,
        summary=f'Checkpoint: "{task.title}" — awaiting human approval',
        reasoning_summary=summary,
        task_id=task_id,
        is_phase_gate=True,
        severity="gate",
        outcome="pending",
        tool_name="report_task_completion",
    )

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
    severity: str = "medium",
) -> str:
    """Escalate a decision to the human. Options should be comma-separated.
    Severity: low, medium, high, critical."""
    from models import EscalationSeverity

    state = ctx.context.state
    option_list = [o.strip() for o in options.split(",")]

    try:
        sev = EscalationSeverity(severity)
    except ValueError:
        sev = EscalationSeverity.MEDIUM

    agent = state.agents.get(ctx.context.current_agent_id)
    agent_name = agent.name if agent else "Unknown"

    esc = Escalation(
        id=f"esc-{uuid.uuid4().hex[:6]}",
        title=title,
        description=description,
        recommendation=recommendation,
        options=option_list,
        severity=sev,
        agent_id=ctx.context.current_agent_id,
        agent_name=agent_name,
        resolved=False,
    )
    await state.add_escalation(esc)
    await state.add_activity(
        f"Escalation: {title}",
        agent_id=ctx.context.current_agent_id,
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

    # Emit an SDLC event for substantive log messages (skip trivial one-liners)
    if len(message) > 40:
        phase = AGENT_TO_PHASE.get(ctx.context.current_agent_id, SDLCPhase.PLANNING)
        artifact = infer_artifact_from_message(message)
        risk = extract_risk_flags(message)
        sev = "warning" if activity_type == "warning" else "info"
        await _emit_sdlc_event(
            ctx,
            phase=phase,
            summary=message[:120],
            artifact_type=artifact,
            reasoning_summary=message[:400],
            risk_flags=risk,
            severity=sev,
            tool_name="log_activity",
        )

    return f"Logged: {message}"


# ── Agent memory tools ─────────────────────────────────────────────

@function_tool
async def save_memory(
    ctx: RunContextWrapper[TeamContext],
    entry: str,
) -> str:
    """Save something to your persistent memory. This persists across tasks and sessions.
    Use this to remember important decisions, patterns, user preferences, or lessons learned.

    entry: A concise note to remember (e.g., 'User prefers TypeScript over JavaScript',
           'Auth module uses JWT with 24h expiry', 'Error handling pattern: always wrap in try/catch')
    """
    state = ctx.context.state
    agent = state.agents.get(ctx.context.current_agent_id)
    if agent is None:
        return "Agent not found."

    agent.memory.append(entry)
    # Keep memory bounded
    if len(agent.memory) > 50:
        agent.memory = agent.memory[-50:]

    return f"Saved to memory ({len(agent.memory)} entries total): {entry}"


@function_tool
async def recall_memory(
    ctx: RunContextWrapper[TeamContext],
) -> str:
    """Recall everything in your persistent memory."""
    state = ctx.context.state
    agent = state.agents.get(ctx.context.current_agent_id)
    if agent is None:
        return "Agent not found."

    if not agent.memory:
        return "Memory is empty. No previous notes saved."

    lines = [f"- {m}" for m in agent.memory]
    return f"Your memory ({len(agent.memory)} entries):\n" + "\n".join(lines)


@function_tool
async def flush_agent_memory(
    ctx: RunContextWrapper[TeamContext],
    agent_id: str,
    reason: str = "",
) -> str:
    """Clear an agent's persistent memory. Only the Boss should use this.

    agent_id: The agent whose memory to clear (e.g., 'agent-dev', 'agent-qa')
    reason: Why you're clearing their memory (e.g., 'Starting fresh project', 'Outdated context')
    """
    state = ctx.context.state
    agent = state.agents.get(agent_id)
    if agent is None:
        return f"Agent {agent_id} not found."

    count = len(agent.memory)
    agent.memory.clear()

    await state.add_activity(
        f"Boss cleared {agent.name}'s memory ({count} entries){': ' + reason if reason else ''}",
        agent_id="agent-boss",
    )
    return f"Cleared {agent.name}'s memory ({count} entries removed)."


@function_tool
async def summarize_and_flush_memory(
    ctx: RunContextWrapper[TeamContext],
    agent_id: str,
    summary: str,
) -> str:
    """Replace an agent's memory with a compressed summary. Only the Boss should use this.

    Instead of wiping memory entirely, this replaces all entries with a single
    condensed summary that preserves the most important context.

    agent_id: The agent whose memory to compress (e.g., 'agent-dev', 'agent-qa')
    summary: A concise summary of what's worth keeping from the agent's memory.
             Include key decisions, user preferences, and lessons learned.
    """
    state = ctx.context.state
    agent = state.agents.get(agent_id)
    if agent is None:
        return f"Agent {agent_id} not found."

    old_count = len(agent.memory)
    agent.memory.clear()
    agent.memory.append(f"[Compressed memory] {summary}")

    await state.add_activity(
        f"Boss compressed {agent.name}'s memory ({old_count} entries → 1 summary)",
        agent_id="agent-boss",
    )
    return f"Compressed {agent.name}'s memory from {old_count} entries to 1 summary."


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

    if sio:
        await sio.emit("boss_plan_approved", {
            "session_id": ctx.context.session_id,
            "summary": plan_summary,
        })

    ctx.context.event_log.append(f"Plan approved: {plan_summary}")
    return (
        f"Plan approved. Now:\n"
        f"1. Delegate to the PM with this plan: {plan_summary}\n"
        f"   The PM will return a JSON task breakdown — do NOT expect tasks on the board yet.\n"
        f"2. Take the PM's JSON output and delegate to the Scrum Master with it.\n"
        f"   Tell the SM: 'Here is the task plan from PM: <paste JSON>. "
        f"Publish these tasks using publish_task_plan, assign all tasks "
        f"(split coding between agent-dev and agent-dev2), and call run_agents_parallel.'"
    )


# ── Parallel execution tool ─────────────────────────────────────────

@function_tool
async def publish_task_plan(
    ctx: RunContextWrapper[TeamContext],
    tasks_json: str,
) -> str:
    """Publish a batch of tasks to the sprint board atomically.

    tasks_json: A JSON array of task objects. Each object must have:
      - title (str): The task title
      - description (str): What needs to be done
      - priority (str): P0, P1, or P2
    Example: [{"title": "Build auth", "description": "JWT login flow", "priority": "P1"}]

    This creates all tasks at once on the kanban board. Only the Scrum Master should call this.
    """
    import json as _json

    state = ctx.context.state

    try:
        task_list = _json.loads(tasks_json)
    except _json.JSONDecodeError:
        return "Error: tasks_json is not valid JSON."

    if not isinstance(task_list, list) or len(task_list) == 0:
        return "Error: tasks_json must be a non-empty JSON array."

    created = []
    for item in task_list:
        title = item.get("title", "Untitled")
        description = item.get("description", "")
        priority = item.get("priority", "P1")
        prio = TaskPriority(priority) if priority in ("P0", "P1", "P2") else TaskPriority.P1

        task = Task(
            id=f"task-{uuid.uuid4().hex[:6]}",
            title=title,
            description=description,
            status=TaskStatus.BACKLOG,
            priority=prio,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        await state.add_task(task)
        created.append(f"  - {task.id}: {title} [{priority}]")

    await state.add_activity(
        f"Published {len(created)} tasks to the sprint board",
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Published {len(created)} tasks")

    # Emit SDLC event — publishing tasks is a PLANNING phase artifact
    await _emit_sdlc_event(
        ctx,
        phase=SDLCPhase.PLANNING,
        summary=f"Published {len(created)} tasks to sprint board",
        artifact_type=ArtifactType.TASK_BACKLOG,
        reasoning_summary=", ".join(item.get("title", "") for item in task_list),
        tool_name="publish_task_plan",
    )

    return f"Published {len(created)} tasks:\n" + "\n".join(created)


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

        # Include agent memory if available
        agent_data = state.agents.get(agent_id)
        memory_ctx = ""
        if agent_data and agent_data.memory:
            memory_lines = "\n".join(f"- {m}" for m in agent_data.memory)
            memory_ctx = f"\n\nYour persistent memory:\n{memory_lines}\n"

        prompt = (
            f"You have been assigned the following tasks. Work on ALL of them now.\n"
            f"Your agent ID is {agent_id}. Use it when updating your status.\n\n"
            f"{task_desc}"
            f"{memory_ctx}"
        )

        agent_ctx = TeamContext(
            state=state,
            sio=sio,
            current_agent_id=agent_id,
            # Inherit trace so sub-agent events belong to the same workflow
            trace_id=ctx.context.trace_id,
            sdlc_store=ctx.context.sdlc_store,
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
