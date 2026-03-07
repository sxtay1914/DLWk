"""FastAPI + Socket.IO backend for the AI-governed dev team dashboard."""

from __future__ import annotations

import asyncio
import random
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import socketio
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import (
    AgentStatus,
    Sprint,
    SprintCreate,
    SprintStatus,
    Task,
    TaskCreate,
    TaskStatus,
    TaskUpdate,
)
from conversation import ConversationManager, ConversationPhase
from state import StateManager

# Load environment variables (.env has OPENAI_API_KEY)
load_dotenv()

# ── Socket.IO server ────────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)

# ── Shared state ─────────────────────────────────────────────────────────────

state = StateManager(sio)
conversations = ConversationManager()

# ── Background monitors ───────────────────────────────────────────────────────

async def _periodic_status_log(interval: int = 30) -> None:
    """Print a formatted agent status table every `interval` seconds."""
    while True:
        await asyncio.sleep(interval)
        state.print_status_table()


_last_auto_resume: float = 0.0


async def _idle_work_monitor(check_interval: float = 2.0) -> None:
    """Watches for idle agents and advances stalled work automatically.

    Two behaviours:
      1. All agents idle — each in_progress task gets a random 5–10 s timer.
         When a task's timer fires it is promoted to review individually.
      2. All agents idle ≥ 60 s with backlog tasks and no pending checkpoints
         → resume pipeline via resume_pipeline()
    """
    global _last_auto_resume
    all_idle_since: float | None = None
    # Per-task promotion deadline: task_id → monotonic time to promote
    promote_at: dict[str, float] = {}

    while True:
        await asyncio.sleep(check_interval)

        if not state.tasks:
            all_idle_since = None
            promote_at.clear()
            continue

        now = asyncio.get_event_loop().time()
        all_idle = all(a.status.value == "idle" for a in state.agents.values())

        if not all_idle:
            all_idle_since = None
            promote_at.clear()
            continue

        # Record when this idle run started
        if all_idle_since is None:
            all_idle_since = now

        # ── Behaviour 1: per-task random promotion (5–10 s) → review ─────────
        in_progress = [t for t in state.tasks.values() if t.status.value == "in_progress"]

        # Assign a random deadline to each newly-seen in_progress task
        for task in in_progress:
            if task.id not in promote_at:
                delay = random.uniform(5.0, 10.0)
                promote_at[task.id] = all_idle_since + delay
                print(
                    f"\033[2m[monitor] {task.id} \"{task.title}\" "
                    f"scheduled → review in {delay:.1f}s\033[0m"
                )

        # Fire any tasks whose deadline has passed
        for task in in_progress:
            if now >= promote_at.get(task.id, float("inf")):
                del promote_at[task.id]
                idle_secs = now - all_idle_since
                await state.update_task(task.id, status=TaskStatus.REVIEW)
                await state.add_activity(
                    f'Auto-advanced "{task.title}" → review '
                    f'(agents idle {idle_secs:.0f}s)',
                    agent_id=task.assigned_agent_id or "agent-boss",
                )
                print(
                    f"\033[2m[monitor] {task.id} \"{task.title}\" "
                    f"→ review (idle {idle_secs:.0f}s)\033[0m"
                )

        # Clean up promote_at entries for tasks no longer in_progress
        gone = [tid for tid in promote_at if tid not in {t.id for t in in_progress}]
        for tid in gone:
            del promote_at[tid]

        # ── Behaviour 2: resume pipeline after 60 s idle ──────────────────────
        has_pending_cps = any(
            c.status.value == "pending" for c in state.checkpoints.values()
        )
        if has_pending_cps:
            continue

        remaining = [
            t for t in state.tasks.values()
            if t.status.value in ("backlog", "in_progress")
        ]
        if not remaining:
            continue

        if now - _last_auto_resume < 60.0:
            continue
        _last_auto_resume = now

        task_lines = "\n".join(
            f"  - [{t.id}] {t.title} ({t.status.value})"
            for t in remaining
        )
        print(
            f"\n\033[1m[monitor] {len(remaining)} unfinished task(s), all agents idle "
            f"— resuming pipeline\033[0m\n{task_lines}"
        )

        async def _do_resume(tasks: list) -> None:
            from ai_agents.runner import resume_pipeline
            await resume_pipeline(tasks, state, sio)

        asyncio.create_task(_do_resume(remaining))


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    state.print_status_table()
    tasks = [
        asyncio.create_task(_periodic_status_log(30)),
        asyncio.create_task(_idle_work_monitor()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()


# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Dev Team Backend",
    description="Backend for the AI-governed development team dashboard.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Wrap FastAPI with Socket.IO ASGI app ─────────────────────────────────────

combined_app = socketio.ASGIApp(sio, app)


# ══════════════════════════════════════════════════════════════════════════════
# REST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

# ── Agents ───────────────────────────────────────────────────────────────────

@app.get("/api/agents")
async def list_agents():
    """Return all agents and their current states."""
    return list(state.agents.values())


# ── Tasks ────────────────────────────────────────────────────────────────────

@app.get("/api/tasks")
async def list_tasks_endpoint():
    """Return all tasks."""
    return list(state.tasks.values())


@app.post("/api/tasks", status_code=201)
async def create_task_endpoint(payload: TaskCreate):
    """Create a new task and add it to the current sprint."""
    task = Task(
        id=f"task-{uuid.uuid4().hex[:8]}",
        title=payload.title,
        description=payload.description,
        status=payload.status,
        assigned_agent_id=payload.assigned_agent_id,
        priority=payload.priority,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    await state.add_task(task)
    await state.add_activity(f"Task \"{task.title}\" created.", agent_id=None)
    return task


@app.patch("/api/tasks/{task_id}")
async def update_task_endpoint(task_id: str, payload: TaskUpdate):
    """Update a task (move columns, reassign, change priority, etc.)."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    task = await state.update_task(task_id, **updates)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


@app.delete("/api/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    """Delete a task."""
    ok = await state.delete_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"detail": "Task deleted."}


# ── Sprint ───────────────────────────────────────────────────────────────────

@app.get("/api/sprint")
async def get_sprint():
    """Return current sprint information."""
    if state.sprint is None:
        raise HTTPException(status_code=404, detail="No active sprint.")
    return state.sprint


@app.post("/api/sprint", status_code=201)
async def create_sprint(payload: SprintCreate):
    """Create a new sprint (replaces the current one)."""
    sprint = Sprint(
        id=f"sprint-{uuid.uuid4().hex[:8]}",
        name=payload.name,
        tasks=[],
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=SprintStatus.ACTIVE,
    )
    await state.create_sprint(sprint)
    await state.add_activity(f"New sprint \"{sprint.name}\" started.")
    return sprint


# ── Activity log ─────────────────────────────────────────────────────────────

@app.get("/api/activity")
async def get_activity():
    """Return the full activity log, most-recent first."""
    return sorted(state.activity_log, key=lambda e: e.timestamp, reverse=True)


# ── Escalations ──────────────────────────────────────────────────────────────

@app.get("/api/escalations")
async def get_escalations():
    """Return all escalations."""
    return list(state.escalations.values())


# ── Chief Chat (session-based, multi-turn) ────────────────────────────────────

class BossMessage(BaseModel):
    content: str
    session_id: str | None = None

@app.post("/api/chat/boss")
async def chat_boss(payload: BossMessage):
    """Send a message to The Chief with session tracking.

    If no session_id, a new conversation session is created.
    Responses stream via Socket.IO events:
    - boss_chat_stream: incremental text deltas
    - boss_chat_complete: final output with event log
    - boss_plan: plan for user approval
    """
    # Get or create session
    session = None
    if payload.session_id:
        session = conversations.get_session(payload.session_id)
    if session is None:
        session = conversations.create_session()

    # Record user message
    session.add_message("user", payload.content)

    # Run in background so we return immediately while events stream
    asyncio.create_task(
        _run_boss_chat(payload.content, session.id)
    )
    return {
        "status": "processing",
        "session_id": session.id,
        "message": "Chief is thinking...",
    }


class PlanApproval(BaseModel):
    session_id: str

@app.post("/api/chat/boss/approve-plan")
async def approve_plan(payload: PlanApproval):
    """User approves the Chief's plan. Triggers execution."""
    session = conversations.get_session(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    conversations.set_phase(payload.session_id, ConversationPhase.APPROVED)

    # Build rich Phase 3 context so the new Boss instance knows exactly what to do
    workspace = state.workspace_root or "(not set)"

    # Extract the original user request from conversation history
    original_request = ""
    for msg in session.messages:
        if msg["role"] == "user":
            original_request = msg["content"]
            break

    # Extract the plan from the last assistant message (Boss described it)
    plan_recap = ""
    for msg in reversed(session.messages):
        if msg["role"] == "assistant":
            plan_recap = msg["content"]
            break

    session.add_message("user", "Approved. Go ahead and execute the plan.")

    execution_msg = (
        "PHASE 3 — EXECUTE NOW. The user has approved the plan.\n"
        "Phase 1 (Clarify) and Phase 2 (Plan) are COMPLETE. Do NOT repeat them.\n"
        "Do NOT ask for the workspace or present a plan again.\n\n"
        f"Workspace (already set): {workspace}\n"
        f"Original user request: {original_request}\n"
        f"Your approved plan summary: {plan_recap[:500]}\n\n"
        "Execute these steps IN ORDER right now:\n"
        "1. Call update_agent_status('agent-boss', 'working', 'Coordinating team')\n"
        "2. Call execute_approved_plan with a brief plan summary.\n"
        "3. Call delegate_to_pm with the FULL feature description and constraints.\n"
        "   Read the PM's JSON output — you need it for step 4.\n"
        "4. Call delegate_to_scrum_master — paste the PM's JSON and say:\n"
        "   'Here is the task plan from PM. Publish these tasks, assign them, "
        "and run agents in parallel.'\n"
        "5. Call list_tasks to verify tasks were created.\n"
        "6. Reply to the user with a brief status update."
    )

    asyncio.create_task(
        _run_boss_chat(execution_msg, session.id)
    )
    return {"status": "processing", "message": "Plan approved, executing..."}


async def _run_boss_chat(content: str, session_id: str) -> None:
    """Background task to run Chief chat with conversation history."""
    try:
        from ai_agents.runner import chat_with_boss

        session = conversations.get_session(session_id)
        history = session.get_history() if session else None

        final = await chat_with_boss(
            content, state, sio,
            conversation_history=history,
            session_id=session_id,
        )

        # Record the Chief's reply in conversation history
        if session:
            session.add_message("assistant", final)
    except Exception as e:
        print(f"[agent] Error in Chief chat: {e}")
        await sio.emit("boss_chat_complete", {
            "session_id": session_id,
            "output": f"Sorry, I encountered an error: {str(e)}",
            "event_log": [],
        })


# ── Direct Agent Chat (role-enforced) ─────────────────────────────────────────

class AgentMessage(BaseModel):
    content: str

@app.post("/api/chat/{agent_id}")
async def chat_agent(agent_id: str, payload: AgentMessage):
    """Chat directly with a specific agent. The agent responds in character
    and routes out-of-scope requests to the Chief.

    Responses stream via Socket.IO:
    - agent_chat_stream: text deltas
    - agent_chat_complete: final output
    - agent_route: if the agent routes the request to another agent
    """
    if agent_id not in state.agents:
        raise HTTPException(status_code=404, detail="Agent not found.")

    # Chief chat goes through the session-based endpoint
    if agent_id == "agent-boss":
        asyncio.create_task(_run_boss_chat_direct(payload.content))
        return {"status": "processing", "message": "Chief is thinking..."}

    asyncio.create_task(_run_agent_chat(agent_id, payload.content))
    return {"status": "processing", "agent_id": agent_id}


async def _run_agent_chat(agent_id: str, content: str) -> None:
    """Background task to run direct agent chat."""
    try:
        from ai_agents.runner import chat_with_agent
        await chat_with_agent(agent_id, content, state, sio)
    except Exception as e:
        print(f"[agent] Error in agent chat ({agent_id}): {e}")
        await sio.emit("agent_chat_complete", {
            "agent_id": agent_id,
            "output": f"Sorry, I encountered an error: {str(e)}",
        })


async def _run_boss_chat_direct(content: str) -> None:
    """Chief chat without session (from direct agent click)."""
    session = conversations.create_session()
    session.add_message("user", content)
    await _run_boss_chat(content, session.id)


# ── Checkpoint REST endpoint (for OpenClaw / external callers) ──────────────

class CheckpointDecision(BaseModel):
    action: str     # "approve" | "request_changes" | "pause"
    feedback: str = ""

@app.post("/api/checkpoints/{checkpoint_id}/decide")
async def decide_checkpoint(checkpoint_id: str, payload: CheckpointDecision):
    """Approve, request changes, or pause a task checkpoint via REST.

    This mirrors the checkpoint_response Socket.IO handler but as a REST
    endpoint so OpenClaw (or any external tool) can interact without Socket.IO.
    """
    from models import CheckpointStatus

    status_map = {
        "approve": CheckpointStatus.APPROVED,
        "request_changes": CheckpointStatus.CHANGES_REQUESTED,
        "pause": CheckpointStatus.PAUSED,
    }
    status = status_map.get(payload.action)
    if status is None:
        raise HTTPException(status_code=400, detail=f"Invalid action '{payload.action}'. Use: approve, request_changes, pause.")

    cp = await state.resolve_checkpoint(checkpoint_id, status, payload.feedback)
    if cp is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found.")

    # If changes requested, re-invoke the agent with the feedback
    if status == CheckpointStatus.CHANGES_REQUESTED and payload.feedback:
        asyncio.create_task(_rerun_agent_with_feedback(cp, payload.feedback))

    return {"status": "ok", "checkpoint_id": checkpoint_id, "action": payload.action}


@app.get("/api/checkpoints")
async def list_checkpoints():
    """List all checkpoints (for OpenClaw to discover pending ones)."""
    return [c.model_dump(mode="json") for c in state.checkpoints.values()]


# ── File Change Review (staged writes approval) ─────────────────────────────

class FileChangeDecision(BaseModel):
    action: str     # "approve" | "reject"
    feedback: str = ""

@app.get("/api/file-changes")
async def list_file_changes():
    """List all pending file changes for review."""
    return [c.model_dump(mode="json") for c in state.pending_file_changes.values()
            if c.status == "pending"]

@app.post("/api/file-changes/{change_id}/decide")
async def decide_file_change(change_id: str, payload: FileChangeDecision):
    """Approve or reject a staged file change."""
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'.")
    change = await state.resolve_file_change(change_id, payload.action, payload.feedback)
    if change is None:
        raise HTTPException(status_code=404, detail="File change not found.")
    # If rejected, re-invoke the agent with feedback
    if payload.action == "reject" and change:
        asyncio.create_task(_rerun_agent_after_file_rejection(change, payload.feedback or ""))
    return {"status": "ok", "id": change_id, "action": payload.action}


# ══════════════════════════════════════════════════════════════════════════════
# SOCKET.IO EVENT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

@sio.event
async def connect(sid, environ):
    print(f"[ws] client connected: {sid}")
    # Send the current full state so the UI can hydrate immediately
    await sio.emit(
        "initial_state",
        {
            "agents": [a.model_dump(mode="json") for a in state.agents.values()],
            "tasks": [t.model_dump(mode="json") for t in state.tasks.values()],
            "sprint": state.sprint.model_dump(mode="json") if state.sprint else None,
            "activity": [e.model_dump(mode="json") for e in state.activity_log[-20:]],
            "escalations": [e.model_dump(mode="json") for e in state.escalations.values()],
            "checkpoints": [c.model_dump(mode="json") for c in state.checkpoints.values() if c.status.value == "pending"],
            "file_changes": [c.model_dump(mode="json") for c in state.pending_file_changes.values() if c.status == "pending"],
        },
        to=sid,
    )


@sio.event
async def disconnect(sid):
    print(f"[ws] client disconnected: {sid}")


# Socket.IO event: user sends message to Chief via websocket
@sio.event
async def boss_message(sid, data):
    """Handle Chief chat messages sent via Socket.IO with session tracking."""
    if not isinstance(data, dict):
        return
    content = data.get("content", "")
    session_id = data.get("session_id")

    if not content:
        return

    # Get or create session
    session = None
    if session_id:
        session = conversations.get_session(session_id)
    if session is None:
        session = conversations.create_session()

    session.add_message("user", content)

    # Acknowledge with session_id
    await sio.emit("boss_session", {"session_id": session.id}, to=sid)

    asyncio.create_task(_run_boss_chat(content, session.id))


# Socket.IO event: user drags a task to a new column
@sio.event
async def move_task(sid, data):
    """Persist a drag-and-drop task move from the kanban board.

    Also updates the assigned agent's visual status so the pixel office
    reacts to board changes.
    """
    if not isinstance(data, dict):
        return
    task_id = data.get("task_id")
    new_status = data.get("status")
    if not task_id or not new_status:
        return
    try:
        status = TaskStatus(new_status)
    except ValueError:
        return
    await state.update_task(task_id, status=status)

    # Update assigned agent status based on where the task landed
    task = state.tasks.get(task_id)
    if task and task.assigned_agent_id:
        agent_id = task.assigned_agent_id
        if status == TaskStatus.IN_PROGRESS:
            await state.update_agent(
                agent_id, status=AgentStatus.WORKING,
                current_activity=f"Working on: {task.title}"
            )
        elif status == TaskStatus.REVIEW:
            # Dev goes idle; QA and CR both start thinking
            await state.update_agent(
                agent_id, status=AgentStatus.IDLE, current_activity=None
            )
            await state.update_agent(
                "agent-cr", status=AgentStatus.THINKING,
                current_activity=f"Reviewing: {task.title}"
            )
            await state.update_agent(
                "agent-qa", status=AgentStatus.THINKING,
                current_activity=f"Testing: {task.title}"
            )
        elif status == TaskStatus.DONE:
            await state.update_agent(
                agent_id, status=AgentStatus.IDLE, current_activity=None
            )


# Socket.IO event: user responds to an escalation
@sio.event
async def escalation_response(sid, data):
    """Handle escalation decisions from the user."""
    if not isinstance(data, dict):
        return
    escalation_id = data.get("escalation_id")
    action = data.get("action")
    if not escalation_id or not action:
        return

    esc = state.escalations.get(escalation_id)
    if esc is None:
        return
    esc.resolved = True
    await state.sio.emit("escalation_resolved", {"escalation_id": escalation_id})
    await state.add_activity(
        f'Escalation "{esc.title}" resolved — action: {action}',
        agent_id="agent-boss",
    )


# Socket.IO event: user responds to a task checkpoint
@sio.event
async def checkpoint_response(sid, data):
    """Handle checkpoint approval/rejection/pause from the user."""
    if not isinstance(data, dict):
        return
    checkpoint_id = data.get("checkpoint_id")
    action = data.get("action")  # "approve", "request_changes", "pause"
    feedback = data.get("feedback")

    if not checkpoint_id or not action:
        return

    from models import CheckpointStatus

    status_map = {
        "approve": CheckpointStatus.APPROVED,
        "request_changes": CheckpointStatus.CHANGES_REQUESTED,
        "pause": CheckpointStatus.PAUSED,
    }
    status = status_map.get(action)
    if status is None:
        return

    cp = await state.resolve_checkpoint(checkpoint_id, status, feedback)

    # If changes requested, re-invoke the agent with the feedback
    if status == CheckpointStatus.CHANGES_REQUESTED and cp and feedback:
        asyncio.create_task(_rerun_agent_with_feedback(cp, feedback))


async def _rerun_agent_with_feedback(cp, feedback: str) -> None:
    """Re-invoke the full agent (not the chat agent) with user feedback."""
    task = state.tasks.get(cp.task_id)
    task_desc = f"{task.title}: {task.description}" if task else cp.task_title

    prompt = (
        f"The human reviewed your work on '{cp.task_title}' and requested changes:\n\n"
        f"\"{feedback}\"\n\n"
        f"Your original work summary: {cp.message}\n"
        f"Task: {task_desc}\n"
        f"Task ID: {cp.task_id}\n"
        f"Your agent ID: {cp.agent_id}\n\n"
        f"Please address the feedback, revise your work, and call report_task_completion "
        f"again with an updated summary when done."
    )

    try:
        from agents import Runner
        from ai_agents.definitions import get_agent_for_role
        from ai_agents.tools import TeamContext

        agent_def = get_agent_for_role(cp.agent_id)
        if agent_def is None:
            # Fallback to chat agent for non-specialist roles
            from ai_agents.runner import chat_with_agent
            await chat_with_agent(cp.agent_id, prompt, state, sio)
            return

        context = TeamContext(state=state, sio=sio, current_agent_id=cp.agent_id, workspace_root=state.workspace_root)
        await state.update_agent(cp.agent_id, status="working", current_activity=f"Revising: {cp.task_title}")

        result = await Runner.run(agent_def, prompt, context=context, max_turns=25)

        await state.update_agent(cp.agent_id, status="idle", current_activity=None)
        await state.add_activity(
            f'{cp.agent_name} revised work on "{cp.task_title}"',
            agent_id=cp.agent_id,
        )
    except Exception as e:
        print(f"[checkpoint] Error re-invoking {cp.agent_id}: {e}")
        await state.update_agent(cp.agent_id, status="idle", current_activity=None)
        await state.add_activity(
            f"Failed to re-invoke {cp.agent_name}: {e}",
            agent_id=cp.agent_id,
        )


# Socket.IO event: user approves the Chief's plan
@sio.event
async def pause_agent(sid, data):
    """Pause an agent: set to idle, move their current task back to backlog."""
    if not isinstance(data, dict):
        return
    agent_id = data.get("agent_id")
    if not agent_id or agent_id not in state.agents:
        return
    agent = state.agents[agent_id]
    task_id = agent.current_task
    await state.update_agent(agent_id, status=AgentStatus.IDLE, current_task=None, current_activity=None)
    if task_id and task_id in state.tasks:
        await state.update_task(task_id, status=TaskStatus.BACKLOG)
    await state.add_activity(f"{agent.name} paused by user.", agent_id=agent_id)


@sio.event
async def reassign_task(sid, data):
    """Unassign an agent's current task so it can be reassigned."""
    if not isinstance(data, dict):
        return
    agent_id = data.get("agent_id")
    if not agent_id or agent_id not in state.agents:
        return
    agent = state.agents[agent_id]
    task_id = agent.current_task
    await state.update_agent(agent_id, status=AgentStatus.IDLE, current_task=None, current_activity=None)
    if task_id and task_id in state.tasks:
        await state.update_task(task_id, status=TaskStatus.BACKLOG, assigned_agent_id=None)
    await state.add_activity(f"Task unassigned from {agent.name} — ready for reassignment.", agent_id=agent_id)


@sio.event
async def cancel_task(sid, data):
    """Cancel (delete) an agent's current task."""
    if not isinstance(data, dict):
        return
    agent_id = data.get("agent_id")
    if not agent_id or agent_id not in state.agents:
        return
    agent = state.agents[agent_id]
    task_id = agent.current_task
    await state.update_agent(agent_id, status=AgentStatus.IDLE, current_task=None, current_activity=None)
    if task_id:
        task = state.tasks.get(task_id)
        task_title = task.title if task else task_id
        await state.delete_task(task_id)
        await state.add_activity(f'Task "{task_title}" cancelled by user.', agent_id=agent_id)


@sio.event
async def file_change_response(sid, data):
    """Handle file change approval/rejection via Socket.IO."""
    if not isinstance(data, dict):
        return
    change_id = data.get("change_id")
    action = data.get("action")  # "approve" | "reject"
    feedback = data.get("feedback", "")
    if not change_id or not action or action not in ("approve", "reject"):
        return
    change = await state.resolve_file_change(change_id, action, feedback)

    # If rejected, re-invoke the agent with the rejection feedback
    if action == "reject" and change:
        asyncio.create_task(_rerun_agent_after_file_rejection(change, feedback))


async def _rerun_agent_after_file_rejection(change, feedback: str) -> None:
    """Re-invoke the agent whose file change was rejected so they can retry."""
    agent_id = change.agent_id
    agent = state.agents.get(agent_id)
    agent_name = agent.name if agent else agent_id

    # Find the task context
    task_desc = ""
    if change.task_id:
        task = state.tasks.get(change.task_id)
        if task:
            task_desc = f"\nTask: [{task.id}] {task.title} — {task.description}"

    reason = feedback.strip() if feedback and feedback.strip() else "No specific reason given."

    prompt = (
        f"Your file change to '{change.filename}' ({change.change_type}) was REJECTED by the human reviewer.\n\n"
        f"Rejection reason: \"{reason}\"\n\n"
        f"File: {change.filename}\n"
        f"Change type: {change.change_type}\n"
        f"Description: {change.description}\n"
        f"Your agent ID: {agent_id}{task_desc}\n\n"
        f"Please address the feedback and try again. If the rejection reason is unclear "
        f"and you cannot proceed, explain what you need to know."
    )

    try:
        from agents import Runner
        from ai_agents.definitions import get_agent_for_role
        from ai_agents.tools import TeamContext

        agent_def = get_agent_for_role(agent_id)
        if agent_def is None:
            from ai_agents.runner import chat_with_agent
            await chat_with_agent(agent_id, prompt, state, sio)
            return

        ws = str(state._get_workspace())
        context = TeamContext(state=state, sio=sio, current_agent_id=agent_id, workspace_root=ws)
        await state.update_agent(agent_id, status="working", current_activity=f"Revising: {change.filename}")

        result = await Runner.run(agent_def, prompt, context=context, max_turns=25)

        await state.update_agent(agent_id, status="idle", current_activity=None)
        await state.add_activity(
            f'{agent_name} revised "{change.filename}" after rejection',
            agent_id=agent_id,
        )
    except Exception as e:
        print(f"[file-reject] Error re-invoking {agent_id}: {e}")
        await state.update_agent(agent_id, status="idle", current_activity=None)
        await state.add_activity(
            f"Failed to re-invoke {agent_name} after file rejection: {e}",
            agent_id=agent_id,
        )


@sio.event
async def approve_plan_ws(sid, data):
    """Handle plan approval via Socket.IO."""
    if not isinstance(data, dict):
        return
    session_id = data.get("session_id")
    if not session_id:
        return

    session = conversations.get_session(session_id)
    if session is None:
        return

    conversations.set_phase(session_id, ConversationPhase.APPROVED)

    workspace = state.workspace_root or "(not set)"
    original_request = ""
    for msg in session.messages:
        if msg["role"] == "user":
            original_request = msg["content"]
            break
    plan_recap = ""
    for msg in reversed(session.messages):
        if msg["role"] == "assistant":
            plan_recap = msg["content"]
            break

    session.add_message("user", "Approved. Go ahead and execute the plan.")

    execution_msg = (
        "PHASE 3 — EXECUTE NOW. The user has approved the plan.\n"
        "Phase 1 (Clarify) and Phase 2 (Plan) are COMPLETE. Do NOT repeat them.\n"
        "Do NOT ask for the workspace or present a plan again.\n\n"
        f"Workspace (already set): {workspace}\n"
        f"Original user request: {original_request}\n"
        f"Your approved plan summary: {plan_recap[:500]}\n\n"
        "Execute these steps IN ORDER right now:\n"
        "1. Call update_agent_status('agent-boss', 'working', 'Coordinating team')\n"
        "2. Call execute_approved_plan with a brief plan summary.\n"
        "3. Call delegate_to_pm with the FULL feature description and constraints.\n"
        "   Read the PM's JSON output — you need it for step 4.\n"
        "4. Call delegate_to_scrum_master — paste the PM's JSON and say:\n"
        "   'Here is the task plan from PM. Publish these tasks, assign them, "
        "and run agents in parallel.'\n"
        "5. Call list_tasks to verify tasks were created.\n"
        "6. Reply to the user with a brief status update."
    )

    asyncio.create_task(_run_boss_chat(execution_msg, session_id))


# ══════════════════════════════════════════════════════════════════════════════
# ENTRYPOINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    uvicorn.run(
        combined_app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
