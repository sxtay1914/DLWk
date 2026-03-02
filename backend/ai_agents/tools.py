"""Function tools that agents use to interact with the project state.

All tools receive a RunContextWrapper[TeamContext] to access the shared
StateManager, which emits Socket.IO events on every mutation.
"""

from __future__ import annotations

import asyncio
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from agents import function_tool, RunContextWrapper

from models import (
    ActivityType,
    AgentStatus,
    Artifact,
    Checkpoint,
    Escalation,
    PendingFileChange,
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
    # Workspace directory for real filesystem I/O
    workspace_root: str | None = None


# ── Workspace helpers ──────────────────────────────────────────────────────

def _resolve_workspace(ctx: RunContextWrapper[TeamContext]) -> Path:
    """Return the workspace root as a Path, creating it if needed.

    Resolution order: ctx.context.workspace_root → WORKSPACE_ROOT env → <project>/workspace
    """
    root = ctx.context.workspace_root or os.environ.get("WORKSPACE_ROOT")
    if root:
        ws = Path(root)
    else:
        ws = Path(__file__).resolve().parent.parent.parent / "workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


def _safe_path(workspace: Path, relative: str) -> Path:
    """Resolve a relative path inside the workspace, rejecting traversal attacks."""
    # Strip leading slashes and . components
    clean = relative.lstrip("/").lstrip("\\")
    target = (workspace / clean).resolve()
    if not str(target).startswith(str(workspace.resolve())):
        raise ValueError(f"Path traversal blocked: {relative!r} escapes workspace.")
    return target


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
    """Create a NEW file with code. Only for files that do NOT exist yet.

    If the file already exists, this tool will REFUSE. Use read_file to inspect it,
    then edit_file for targeted changes instead.

    filename: The file path (e.g., 'src/auth.py', 'components/Login.tsx')
    description: Brief explanation of what this code does
    code: The FULL source code content of the file. Write complete, production-quality code.
    language: Programming language (e.g., 'python', 'typescript', 'javascript')
    """
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id

    # Block overwrites — force edit_file for existing files
    try:
        workspace = _resolve_workspace(ctx)
        target = _safe_path(workspace, filename)
        if target.exists():
            size = target.stat().st_size
            return (
                f"REFUSED: {filename} already exists ({size} bytes). "
                f"Use read_file('{filename}') to inspect it, then edit_file for targeted changes. "
                f"Do NOT rewrite entire files — make precise edits."
            )
    except (ValueError, Exception):
        pass  # workspace not set yet, proceed with write

    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Writing {filename}")

    # Find the task this agent is working on
    agent = state.agents.get(agent_id)
    task_id = agent.current_task if agent else None

    # Write to real filesystem
    disk_status = ""
    try:
        workspace = _resolve_workspace(ctx)
        target = _safe_path(workspace, filename)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(code, encoding="utf-8")
        disk_status = f" [written to disk: {target}]"
    except Exception as e:
        disk_status = f" [disk write failed: {e}]"

    # Store as artifact (powers dashboard code viewer)
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

    # Stage file change for human review
    agent = state.agents.get(agent_id)
    file_change = PendingFileChange(
        id=f"fc-{uuid.uuid4().hex[:8]}",
        agent_id=agent_id,
        agent_name=agent.name if agent else agent_id,
        task_id=agent.current_task if agent else None,
        filename=filename,
        change_type="create",
        old_content=None,
        new_content=code,
        description=description,
    )
    await state.add_file_change(file_change)

    return f"Successfully wrote {filename} ({len(code.splitlines())} lines).{disk_status} {description}"


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
    working_directory: str = "",
) -> str:
    """Run a real shell command in the workspace.

    command: The shell command to execute (e.g., 'npm install', 'pytest', 'ls -la')
    working_directory: Subdirectory inside workspace to run in (empty = workspace root)
    """
    state = ctx.context.state
    await state.add_activity(
        f"Running: `{command}`",
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Command: {command}")

    workspace = _resolve_workspace(ctx)
    if working_directory:
        try:
            cwd = _safe_path(workspace, working_directory)
        except ValueError as e:
            return str(e)
    else:
        cwd = workspace

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return f"$ {command}\n[TIMEOUT after 120s — process killed]"

        stdout = stdout_bytes.decode("utf-8", errors="replace")[:8000]
        stderr = stderr_bytes.decode("utf-8", errors="replace")[:8000]
        exit_code = proc.returncode

        output_parts = [f"$ {command}", f"Exit code: {exit_code}"]
        if stdout.strip():
            output_parts.append(f"STDOUT:\n{stdout}")
        if stderr.strip():
            output_parts.append(f"STDERR:\n{stderr}")
        result_text = "\n".join(output_parts)
    except Exception as e:
        result_text = f"$ {command}\n[Error executing command: {e}]"

    return result_text


@function_tool
async def run_tests(
    ctx: RunContextWrapper[TeamContext],
    test_file: str,
    test_code: str,
    test_command: str = "",
    language: str = "",
) -> str:
    """Write a test file to disk and run it. Returns real test output.

    test_file: The test file path (e.g., 'tests/test_auth.py')
    test_code: The FULL test source code. Write real, runnable test cases.
    test_command: Command to run the tests (e.g., 'python -m pytest tests/test_auth.py -v').
                  If empty, auto-inferred from file extension.
    language: Programming language (e.g., 'python', 'typescript')
    """
    state = ctx.context.state
    agent_id = ctx.context.current_agent_id
    await state.update_agent(agent_id, status=AgentStatus.WORKING, current_activity=f"Testing: {test_file}")

    # Write test file to disk
    workspace = _resolve_workspace(ctx)
    try:
        target = _safe_path(workspace, test_file)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(test_code, encoding="utf-8")
    except Exception as e:
        return f"Failed to write test file: {e}"

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

    # Stage file change for human review
    file_change = PendingFileChange(
        id=f"fc-{uuid.uuid4().hex[:8]}",
        agent_id=agent_id,
        agent_name=agent.name if agent else agent_id,
        task_id=agent.current_task if agent else None,
        filename=test_file,
        change_type="create",
        old_content=None,
        new_content=test_code,
        description=f"Test file for {test_file}",
    )
    await state.add_file_change(file_change)

    # Auto-infer test command if not provided
    if not test_command:
        if test_file.endswith(".py"):
            test_command = f"python -m pytest {test_file} -v"
        elif test_file.endswith((".ts", ".js", ".tsx", ".jsx")):
            test_command = f"npx jest {test_file} --verbose"
        else:
            test_command = f"cat {test_file}"  # fallback: just show the file

    # Run the tests via real subprocess
    try:
        proc = await asyncio.create_subprocess_shell(
            test_command,
            cwd=str(workspace),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            test_output = "[TIMEOUT after 120s — tests killed]"
            exit_code = -1
        else:
            stdout = stdout_bytes.decode("utf-8", errors="replace")[:8000]
            stderr = stderr_bytes.decode("utf-8", errors="replace")[:8000]
            exit_code = proc.returncode
            test_output = ""
            if stdout.strip():
                test_output += stdout
            if stderr.strip():
                test_output += ("\n" if test_output else "") + stderr
    except Exception as e:
        test_output = f"[Error running tests: {e}]"
        exit_code = -1

    all_pass = exit_code == 0
    activity_type = ActivityType.INFO if all_pass else ActivityType.WARNING

    summary = f"Tests {test_file}: {'PASSED' if all_pass else 'FAILED'} (exit code {exit_code})"
    await state.add_activity(summary, agent_id=agent_id, activity_type=activity_type)
    ctx.context.event_log.append(summary)

    return f"$ {test_command}\nExit code: {exit_code}\n\n{test_output}"


@function_tool
async def get_task_code(
    ctx: RunContextWrapper[TeamContext],
    task_id: str,
) -> str:
    """Retrieve all code artifacts written for a task. Reads from disk first, falls back to in-memory."""
    state = ctx.context.state
    artifacts = state.get_task_artifacts(task_id)
    if not artifacts:
        return f"No code artifacts found for task {task_id}."

    workspace = _resolve_workspace(ctx)
    output = []
    for art in artifacts:
        output.append(f"--- {art.filename} ({art.language}) ---")
        # Try reading from disk first (most up-to-date)
        try:
            disk_path = _safe_path(workspace, art.filename)
            if disk_path.exists():
                content = disk_path.read_text(encoding="utf-8", errors="replace")
                output.append(content)
            else:
                output.append(art.content)
        except (ValueError, Exception):
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

    if approved:
        return f"Code review APPROVED for {task_id}. {feedback}"
    return f"Code review REJECTED for {task_id}. Changes needed: {feedback}"


# ── Checkpoint tools (human-in-the-loop approval) ──────────────────────

# Map current status → next status for the checkpoint flow
_NEXT_STATUS = {
    TaskStatus.IN_PROGRESS: TaskStatus.REVIEW,
    TaskStatus.REVIEW: TaskStatus.DONE,
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
    """Clear an agent's persistent memory. Only the Chief should use this.

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
        f"Chief cleared {agent.name}'s memory ({count} entries){': ' + reason if reason else ''}",
        agent_id="agent-boss",
    )
    return f"Cleared {agent.name}'s memory ({count} entries removed)."


@function_tool
async def summarize_and_flush_memory(
    ctx: RunContextWrapper[TeamContext],
    agent_id: str,
    summary: str,
) -> str:
    """Replace an agent's memory with a compressed summary. Only the Chief should use this.

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
        f"Chief compressed {agent.name}'s memory ({old_count} entries → 1 summary)",
        agent_id="agent-boss",
    )
    return f"Compressed {agent.name}'s memory from {old_count} entries to 1 summary."


# ── Chief conversation tools ──────────────────────────────────────────

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

    # Deduplicate — skip tasks whose titles already exist on the board
    existing_titles = {t.title.lower().strip() for t in state.tasks.values()}

    created = []
    skipped = 0
    for item in task_list:
        title = item.get("title", "Untitled")
        description = item.get("description", "")
        priority = item.get("priority", "P1")

        if title.lower().strip() in existing_titles:
            skipped += 1
            continue

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
        existing_titles.add(title.lower().strip())
        created.append(f"  - {task.id}: {title} [{priority}]")

    if not created and skipped > 0:
        return f"All {skipped} tasks already exist on the board. Do NOT call publish_task_plan again. Proceed to list_tasks and assign."

    await state.add_activity(
        f"Published {len(created)} tasks to the sprint board",
        agent_id=ctx.context.current_agent_id,
    )
    ctx.context.event_log.append(f"Published {len(created)} tasks")

    return f"Published {len(created)} tasks:\n" + "\n".join(created)


async def run_phases(context: TeamContext) -> str:
    """Execute the full agent pipeline in sequenced phases.

    Callable directly (for programmatic resume) or via the run_agents_parallel
    function_tool (called by the Scrum Master LLM).

    Phase 1 — Development:      agent-dev and agent-dev2 run in parallel.
    Phase 2 — Review & Testing: agent-qa and agent-cr run in parallel after
                                 Phase 1 checkpoints are approved by a human.
    Tasks move from backlog → in_progress at the start of their phase.
    """
    import asyncio
    from agents import Runner
    from models import CheckpointStatus

    state = context.state
    sio   = context.sio

    # Collect assigned backlog tasks grouped by agent
    agent_tasks: dict[str, list] = {}
    for task in state.tasks.values():
        if task.status == TaskStatus.BACKLOG and task.assigned_agent_id:
            aid = task.assigned_agent_id
            agent_tasks.setdefault(aid, []).append(task)

    if not agent_tasks:
        return "No backlog tasks with assigned agents found. Assign tasks first."

    from ai_agents.definitions import get_agent_for_role

    # ── Single-agent runner ───────────────────────────────────────────────

    async def run_single_agent(agent_id: str, tasks: list) -> str:
        agent_def = get_agent_for_role(agent_id)
        if agent_def is None:
            return f"{agent_id}: No agent definition — skipped."

        task_desc = "\n".join(f"- {t.id}: {t.title} — {t.description}" for t in tasks)
        agent_data = state.agents.get(agent_id)
        memory_ctx = ""
        if agent_data and agent_data.memory:
            memory_ctx = "\n\nYour persistent memory:\n" + "\n".join(
                f"- {m}" for m in agent_data.memory
            )

        prompt = (
            f"You have been assigned the following tasks. Work on ALL of them now.\n"
            f"Your agent ID is {agent_id}. Use it when updating your status.\n\n"
            f"{task_desc}{memory_ctx}"
        )
        agent_ctx = TeamContext(
            state=state, sio=sio,
            current_agent_id=agent_id,
            workspace_root=context.workspace_root,
        )
        try:
            result = await Runner.run(agent_def, prompt, context=agent_ctx, max_turns=10)
            return f"{agent_id}: {result.final_output or 'Done.'}"
        except Exception as e:
            await state.update_agent(agent_id, status=AgentStatus.IDLE, current_activity=None)
            return f"{agent_id}: Error — {e}"

    # ── Checkpoint gate ───────────────────────────────────────────────────

    async def wait_for_checkpoints(snapshot_before: set[str], phase_name: str) -> bool:
        """Block until every checkpoint created in this phase is resolved.
        Returns False if any were paused (pipeline should stop)."""
        phase_cp_ids = {cp_id for cp_id in state.checkpoints if cp_id not in snapshot_before}
        if not phase_cp_ids:
            return True

        print(f"\n\033[1m[pipeline] ⏳  Awaiting approval — {phase_name} "
              f"({len(phase_cp_ids)} checkpoint(s))\033[0m")
        for cp_id in sorted(phase_cp_ids):
            cp = state.checkpoints[cp_id]
            print(f"  ⏳  [{cp.agent_name}] \"{cp.task_title}\"")

        if sio:
            await sio.emit("pipeline_gate", {
                "phase": phase_name, "checkpoint_ids": list(phase_cp_ids), "status": "waiting",
            })

        dots = 0
        while True:
            pending_ids = {
                cp_id for cp_id in phase_cp_ids
                if state.checkpoints.get(cp_id) and
                   state.checkpoints[cp_id].status == CheckpointStatus.PENDING
            }
            if not pending_ids:
                break
            dots += 1
            if dots % 6 == 1:
                print(f"\033[2m[pipeline] Still waiting on {len(pending_ids)} "
                      f"approval(s) for {phase_name}...\033[0m")
            await asyncio.sleep(5.0)

        approved = changes = paused = 0
        for cp_id in phase_cp_ids:
            cp = state.checkpoints.get(cp_id)
            if cp:
                if cp.status == CheckpointStatus.APPROVED:        approved += 1
                elif cp.status == CheckpointStatus.CHANGES_REQUESTED: changes += 1
                elif cp.status == CheckpointStatus.PAUSED:        paused  += 1

        print(f"\033[1m[pipeline] Gate cleared — {phase_name}\033[0m  "
              f"({approved} approved, {changes} changes requested, {paused} paused)")
        if sio:
            await sio.emit("pipeline_gate", {
                "phase": phase_name, "checkpoint_ids": list(phase_cp_ids),
                "status": "cleared", "approved": approved,
                "changes_requested": changes, "paused": paused,
            })
        return paused == 0

    # ── Phase runner ──────────────────────────────────────────────────────

    all_results: list[tuple[str, str]] = []

    async def run_phase(ids: list[str], phase_name: str) -> bool:
        if not ids:
            return True
        print(f"\n\033[1m[pipeline] ── {phase_name} ──\033[0m")
        for aid in ids:
            a = state.agents.get(aid)
            print(f"  ▶ {a.name if a else aid}")

        for aid in ids:
            for task in agent_tasks.get(aid, []):
                if task.status == TaskStatus.BACKLOG:
                    await state.update_task(task.id, status=TaskStatus.IN_PROGRESS)
                    print(f"\033[2m[pipeline]   {task.id} → in_progress\033[0m")

        cp_snapshot = set(state.checkpoints.keys())
        phase_results = await asyncio.gather(
            *[run_single_agent(aid, agent_tasks[aid]) for aid in ids],
            return_exceptions=True,
        )
        for aid, result in zip(ids, phase_results):
            all_results.append((aid, f"Error — {result}" if isinstance(result, Exception) else str(result)))

        print(f"\033[2m[pipeline] {phase_name} done — waiting for checkpoint approval\033[0m")
        return await wait_for_checkpoints(cp_snapshot, phase_name)

    # ── Execute ───────────────────────────────────────────────────────────

    dev_ids    = [aid for aid in agent_tasks if aid in ("agent-dev", "agent-dev2")]
    review_ids = [aid for aid in agent_tasks if aid in ("agent-qa", "agent-cr")]
    other_ids  = [aid for aid in agent_tasks if aid not in dev_ids + review_ids]

    ok = await run_phase(dev_ids + other_ids, "Phase 1 — Development")
    if ok:
        await run_phase(review_ids, "Phase 2 — Review & Testing")
    else:
        print("\033[33m[pipeline] Phase 1 paused — skipping Review & Testing\033[0m")

    total = len(dev_ids) + len(review_ids) + len(other_ids)
    context.event_log.append(
        f"Sequenced execution: {len(dev_ids)} dev(s) → {len(review_ids)} review/QA"
    )
    summary_lines = [f"{aid}: {res}" for aid, res in all_results]
    return f"Sequenced execution complete ({total} agents, 2 phases):\n" + "\n".join(summary_lines)


@function_tool
async def run_agents_parallel(ctx: RunContextWrapper[TeamContext]) -> str:
    """Run all assigned agents in sequenced phases.

    Call this AFTER assigning tasks (tasks should still be in backlog — this tool
    moves them to in_progress phase-by-phase as work begins).
    Execution order (each phase waits for human checkpoint approval before continuing):
      Phase 1 — Development:      agent-dev and agent-dev2 run in parallel
      Phase 2 — Review & Testing: agent-qa and agent-cr run in parallel after devs finish
    Returns a summary when all phases and approvals are complete.
    """
    return await run_phases(ctx.context)


# ── Agent routing tool ──────────────────────────────────────────────

@function_tool
async def route_to_boss(
    ctx: RunContextWrapper[TeamContext],
    message: str,
    reason: str,
) -> str:
    """Route a request to the Chief because it's outside your role.
    Use this when the user asks you to do something that isn't your job.

    message: The user's original request.
    reason: Why you're routing it (e.g., 'This is a coding task, not QA').
    """
    state = ctx.context.state
    sio = ctx.context.sio

    agent = state.agents.get(ctx.context.current_agent_id)
    agent_name = agent.name if agent else "Unknown"

    await state.add_activity(
        f"{agent_name} routed request to Chief: {reason}",
        agent_id=ctx.context.current_agent_id,
    )

    if sio:
        await sio.emit("agent_route", {
            "from_agent_id": ctx.context.current_agent_id,
            "from_agent_name": agent_name,
            "message": message,
            "reason": reason,
        })

    return f"Request routed to the Chief. {reason}"


# ── Workspace configuration tool ──────────────────────────────────────────

@function_tool
async def set_workspace(
    ctx: RunContextWrapper[TeamContext],
    path: str,
) -> str:
    """Set the workspace directory where agents will read/write files.

    path: Absolute path to the project directory (e.g., '/Users/me/projects/my-app')
    The directory will be created if it doesn't exist.
    """
    expanded = os.path.expanduser(path)
    target = Path(expanded).resolve()

    try:
        target.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return f"Cannot create workspace at {path}: {e}"

    if not target.is_dir():
        return f"Not a valid directory: {path}"

    ctx.context.workspace_root = str(target)
    # Persist on state so it survives across conversation turns
    ctx.context.state.workspace_root = str(target)
    ctx.context.event_log.append(f"Workspace set to: {target}")

    state = ctx.context.state
    await state.add_activity(
        f"Workspace set to: {target}",
        agent_id=ctx.context.current_agent_id,
    )

    # List existing contents so the Chief can relay what's already there
    contents = list(target.iterdir())
    if contents:
        items = [f"  {p.name}{'/' if p.is_dir() else ''}" for p in sorted(contents)[:20]]
        listing = "\n".join(items)
        return f"Workspace set to: {target}\n\nExisting contents:\n{listing}"
    return f"Workspace set to: {target} (empty directory — starting fresh)"


# ── Filesystem tools ──────────────────────────────────────────────────────

@function_tool
async def read_file(
    ctx: RunContextWrapper[TeamContext],
    filepath: str,
) -> str:
    """Read a file from the workspace.

    filepath: Relative path inside the workspace (e.g., 'src/auth.py')
    """
    workspace = _resolve_workspace(ctx)
    try:
        target = _safe_path(workspace, filepath)
    except ValueError as e:
        return str(e)

    if not target.exists():
        return f"File not found: {filepath}"
    if not target.is_file():
        return f"Not a file: {filepath}"

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"Error reading {filepath}: {e}"

    # Truncate very large files
    if len(content) > 15000:
        content = content[:15000] + f"\n\n... [truncated — file is {len(content)} chars total]"

    return f"--- {filepath} ---\n{content}"


@function_tool
async def edit_file(
    ctx: RunContextWrapper[TeamContext],
    filepath: str,
    old_text: str,
    new_text: str,
    description: str = "",
) -> str:
    """Edit an existing file by replacing a specific text block. Claude Code-style targeted edit.

    filepath: Relative path inside the workspace (e.g., 'src/auth.py')
    old_text: The exact text to find and replace (must appear exactly once)
    new_text: The replacement text
    description: Brief explanation of what this edit does
    """
    workspace = _resolve_workspace(ctx)
    try:
        target = _safe_path(workspace, filepath)
    except ValueError as e:
        return str(e)

    if not target.exists():
        return f"File not found: {filepath}. Use write_code to create new files."

    try:
        content = target.read_text(encoding="utf-8")
    except Exception as e:
        return f"Error reading {filepath}: {e}"

    count = content.count(old_text)
    if count == 0:
        return f"old_text not found in {filepath}. Check your text matches exactly."
    if count > 1:
        return f"old_text appears {count} times in {filepath}. Provide more context to make it unique."

    old_content = content  # Capture before edit for diff
    new_content = content.replace(old_text, new_text, 1)
    target.write_text(new_content, encoding="utf-8")

    # Update in-memory artifact if one exists for this file
    state = ctx.context.state
    for art in state.artifacts:
        if art.filename == filepath:
            art.content = new_content
            break

    agent_id = ctx.context.current_agent_id
    await state.add_activity(
        f"Edited {filepath}: {description}" if description else f"Edited {filepath}",
        agent_id=agent_id,
    )
    ctx.context.event_log.append(f"File edited: {filepath}")

    # Stage file change for human review
    agent = state.agents.get(agent_id)
    file_change = PendingFileChange(
        id=f"fc-{uuid.uuid4().hex[:8]}",
        agent_id=agent_id,
        agent_name=agent.name if agent else agent_id,
        task_id=agent.current_task if agent else None,
        filename=filepath,
        change_type="edit",
        old_content=old_content,
        new_content=new_content,
        description=description or "Targeted edit",
    )
    await state.add_file_change(file_change)

    return f"Successfully edited {filepath}. {description}"


@function_tool
async def list_directory(
    ctx: RunContextWrapper[TeamContext],
    path: str = "",
    recursive: bool = False,
) -> str:
    """List files and directories in the workspace.

    path: Relative path inside workspace (empty string = workspace root)
    recursive: If true, list all files recursively
    """
    workspace = _resolve_workspace(ctx)
    try:
        target = _safe_path(workspace, path) if path else workspace
    except ValueError as e:
        return str(e)

    if not target.exists():
        return f"Directory not found: {path or '.'}"
    if not target.is_dir():
        return f"Not a directory: {path}"

    entries = []
    if recursive:
        for p in sorted(target.rglob("*")):
            if len(entries) >= 500:
                entries.append("... (capped at 500 entries)")
                break
            rel = p.relative_to(workspace)
            marker = "  " if p.is_file() else "/ "
            entries.append(f"{marker}{rel}")
    else:
        for p in sorted(target.iterdir()):
            rel = p.relative_to(workspace)
            if p.is_dir():
                entries.append(f"  {rel}/")
            else:
                size = p.stat().st_size
                entries.append(f"  {rel}  ({size} bytes)")

    if not entries:
        return f"Directory is empty: {path or '.'}"

    header = f"Listing: {path or '.'} ({'recursive' if recursive else 'top-level'})\n"
    return header + "\n".join(entries)


@function_tool
async def search_code(
    ctx: RunContextWrapper[TeamContext],
    pattern: str,
    path: str = "",
    file_glob: str = "",
) -> str:
    """Search for a regex pattern across workspace files.

    pattern: Regular expression to search for (e.g., 'def login', 'import.*auth')
    path: Subdirectory to search in (empty = entire workspace)
    file_glob: File pattern filter (e.g., '*.py', '*.ts')
    """
    workspace = _resolve_workspace(ctx)
    try:
        search_root = _safe_path(workspace, path) if path else workspace
    except ValueError as e:
        return str(e)

    if not search_root.exists():
        return f"Path not found: {path or '.'}"

    try:
        regex = re.compile(pattern)
    except re.error as e:
        return f"Invalid regex pattern: {e}"

    glob_pattern = file_glob or "*"
    matches = []
    files_searched = 0

    for filepath in sorted(search_root.rglob(glob_pattern)):
        if not filepath.is_file():
            continue
        # Skip binary / very large files
        if filepath.stat().st_size > 1_000_000:
            continue
        files_searched += 1
        try:
            text = filepath.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        for lineno, line in enumerate(text.splitlines(), 1):
            if regex.search(line):
                rel = filepath.relative_to(workspace)
                display_line = line[:200]
                matches.append(f"{rel}:{lineno}: {display_line}")
                if len(matches) >= 100:
                    break
        if len(matches) >= 100:
            break

    if not matches:
        return f"No matches for /{pattern}/ in {files_searched} files."

    header = f"Found {len(matches)} match(es) for /{pattern}/ in {files_searched} files:\n"
    return header + "\n".join(matches)


# ── Project memory tools ──────────────────────────────────────────────────

_PROJ_MEM_FILE = "PROJ_MEM.md"
_PROJ_MEM_SECTIONS = ["Architecture", "Decisions", "Patterns", "Dependencies", "Gotchas", "Todo"]


@function_tool
async def read_proj_memory(
    ctx: RunContextWrapper[TeamContext],
) -> str:
    """Read the shared project memory file (PROJ_MEM.md) from the workspace.

    This contains architecture decisions, patterns, dependencies, gotchas, and todos
    written by the team. Always read this before starting work on a task.
    """
    workspace = _resolve_workspace(ctx)
    mem_path = workspace / _PROJ_MEM_FILE

    if not mem_path.exists():
        return "No PROJ_MEM.md yet. You are the first to work in this workspace. Create it by calling update_proj_memory."

    try:
        content = mem_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"Error reading PROJ_MEM.md: {e}"

    if len(content) > 15000:
        content = content[:15000] + "\n\n... [truncated]"

    return f"--- PROJ_MEM.md ---\n{content}"


@function_tool
async def update_proj_memory(
    ctx: RunContextWrapper[TeamContext],
    section: str,
    content: str,
) -> str:
    """Update a section in the shared project memory file (PROJ_MEM.md).

    Call this after completing work to record decisions, patterns, and context for the team.

    section: One of: Architecture, Decisions, Patterns, Dependencies, Gotchas, Todo
    content: Bullet-point content for this section (e.g., '- Next.js app with TypeScript\\n- Calculator logic in src/lib/calc.ts')
    """
    if section not in _PROJ_MEM_SECTIONS:
        return f"Invalid section '{section}'. Use one of: {', '.join(_PROJ_MEM_SECTIONS)}"

    workspace = _resolve_workspace(ctx)
    mem_path = workspace / _PROJ_MEM_FILE

    # Read existing or create skeleton
    if mem_path.exists():
        existing = mem_path.read_text(encoding="utf-8", errors="replace")
    else:
        existing = "# Project Memory\n\nShared context for the AI dev team.\n\n"

    section_header = f"## {section}"

    if section_header in existing:
        # Replace existing section content (everything between this header and next ## or EOF)
        lines = existing.split("\n")
        new_lines = []
        in_section = False
        replaced = False
        for line in lines:
            if line.strip() == section_header:
                in_section = True
                replaced = True
                new_lines.append(section_header)
                new_lines.append(content)
                new_lines.append("")
                continue
            if in_section:
                if line.startswith("## "):
                    in_section = False
                    new_lines.append(line)
                # else: skip old content
                continue
            new_lines.append(line)
        new_content = "\n".join(new_lines)
    else:
        # Append new section
        new_content = existing.rstrip() + f"\n\n{section_header}\n{content}\n"

    mem_path.write_text(new_content, encoding="utf-8")

    agent_id = ctx.context.current_agent_id
    agent = ctx.context.state.agents.get(agent_id)
    agent_name = agent.name if agent else agent_id

    await ctx.context.state.add_activity(
        f"{agent_name} updated PROJ_MEM.md [{section}]",
        agent_id=agent_id,
    )
    ctx.context.event_log.append(f"PROJ_MEM.md updated: {section}")

    return f"Updated PROJ_MEM.md [{section}]."
