"""FastAPI + Socket.IO backend for the AI-governed dev team dashboard."""

from __future__ import annotations

import asyncio
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
    SDLCPhase,
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

# ── Lifespan: start the simulation background task ───────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


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


# ── Boss Chat (session-based, multi-turn) ────────────────────────────────────

class BossMessage(BaseModel):
    content: str
    session_id: str | None = None

@app.post("/api/chat/boss")
async def chat_boss(payload: BossMessage):
    """Send a message to The Boss with session tracking.

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
        "message": "Boss is thinking...",
    }


class PlanApproval(BaseModel):
    session_id: str

@app.post("/api/chat/boss/approve-plan")
async def approve_plan(payload: PlanApproval):
    """User approves the Boss's plan. Triggers execution."""
    session = conversations.get_session(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    conversations.set_phase(payload.session_id, ConversationPhase.APPROVED)

    # Send approval as a user message and let Boss proceed
    session.add_message("user", "Approved. Go ahead and execute the plan.")

    asyncio.create_task(
        _run_boss_chat("The user has approved the plan. Proceed with execution.", session.id)
    )
    return {"status": "processing", "message": "Plan approved, executing..."}


async def _run_boss_chat(content: str, session_id: str) -> None:
    """Background task to run boss chat with conversation history."""
    try:
        from ai_agents.runner import chat_with_boss

        session = conversations.get_session(session_id)
        history = session.get_history() if session else None

        final = await chat_with_boss(
            content, state, sio,
            conversation_history=history,
            session_id=session_id,
        )

        # Record the Boss's reply in conversation history
        if session:
            session.add_message("assistant", final)
    except Exception as e:
        print(f"[agent] Error in boss chat: {e}")
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
    and routes out-of-scope requests to the Boss.

    Responses stream via Socket.IO:
    - agent_chat_stream: text deltas
    - agent_chat_complete: final output
    - agent_route: if the agent routes the request to another agent
    """
    if agent_id not in state.agents:
        raise HTTPException(status_code=404, detail="Agent not found.")

    # Boss chat goes through the session-based endpoint
    if agent_id == "agent-boss":
        asyncio.create_task(_run_boss_chat_direct(payload.content))
        return {"status": "processing", "message": "Boss is thinking..."}

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
    """Boss chat without session (from direct agent click)."""
    session = conversations.create_session()
    session.add_message("user", content)
    await _run_boss_chat(content, session.id)


# ── SDLC Transparency ────────────────────────────────────────────────────────

@app.get("/api/sdlc/phases")
async def get_phase_snapshots():
    """Return PhaseSnapshots for the active trace (used by the Progress Bar)."""
    trace_id = state.sdlc_store.active_trace_id
    if not trace_id:
        # No active trace yet — return empty not_started snapshots
        from models import PhaseSnapshot
        from sdlc_store import PHASE_ORDER
        return [
            PhaseSnapshot(trace_id="none", phase=p, status="not_started").model_dump(mode="json")
            for p in PHASE_ORDER
        ]
    return [s.model_dump(mode="json") for s in state.sdlc_store.get_phase_snapshots(trace_id)]


@app.get("/api/sdlc/phases/{phase}")
async def get_phase_events(phase: str):
    """Return all events for a specific phase in the active trace."""
    trace_id = state.sdlc_store.active_trace_id
    if not trace_id:
        return []
    try:
        sdlc_phase = SDLCPhase(phase)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown phase '{phase}'. Valid: {[p.value for p in SDLCPhase]}")
    events = state.sdlc_store.get_phase_events(trace_id, sdlc_phase)
    return [e.model_dump(mode="json") for e in events]


@app.get("/api/sdlc/task/{task_id}")
async def get_task_sdlc_events(task_id: str):
    """Return all SDLC events for a specific task (Task Activity Panel data)."""
    events = state.sdlc_store.get_task_events(task_id)
    artifacts = state.sdlc_store.get_task_artifacts(task_id)
    return {
        "events": [e.model_dump(mode="json") for e in events],
        "artifacts_by_phase": artifacts,
    }


class GateDecision(BaseModel):
    decision: str   # "approved" | "rejected" | "refined"
    feedback: str = ""


@app.post("/api/sdlc/gates/{gate_event_id}/decide")
async def decide_gate(gate_event_id: str, payload: GateDecision):
    """Record a human decision on a phase gate.

    When approved, also resolves the matching checkpoint (advancing the task)
    and triggers the next agent in the pipeline.
    """
    ok = await state.sdlc_store.decide_gate(gate_event_id, payload.decision, payload.feedback)
    if not ok:
        raise HTTPException(status_code=404, detail="Gate event not found.")

    # If approved, find and resolve the pending checkpoint for the same task
    if payload.decision == "approved":
        from models import CheckpointStatus

        gate_event = state.sdlc_store.events.get(gate_event_id)
        if gate_event and gate_event.task_id:
            # Find the pending checkpoint for this task
            for cp in state.checkpoints.values():
                if cp.task_id == gate_event.task_id and cp.status == CheckpointStatus.PENDING:
                    resolved = await state.resolve_checkpoint(cp.id, CheckpointStatus.APPROVED)
                    if resolved:
                        asyncio.create_task(
                            _auto_chain_next_agent(resolved.task_id, resolved.next_status)
                        )
                    break

    return {"status": "ok", "decision": payload.decision}


# ══════════════════════════════════════════════════════════════════════════════
# SOCKET.IO EVENT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

@sio.event
async def connect(sid, environ):
    print(f"[ws] client connected: {sid}")
    # Send the current full state so the UI can hydrate immediately
    # Build phase snapshots for active trace
    trace_id = state.sdlc_store.active_trace_id
    if trace_id:
        phase_snapshots = [s.model_dump(mode="json") for s in state.sdlc_store.get_phase_snapshots(trace_id)]
    else:
        from models import PhaseSnapshot
        from sdlc_store import PHASE_ORDER
        phase_snapshots = [
            PhaseSnapshot(trace_id="none", phase=p, status="not_started").model_dump(mode="json")
            for p in PHASE_ORDER
        ]

    await sio.emit(
        "initial_state",
        {
            "agents": [a.model_dump(mode="json") for a in state.agents.values()],
            "tasks": [t.model_dump(mode="json") for t in state.tasks.values()],
            "sprint": state.sprint.model_dump(mode="json") if state.sprint else None,
            "activity": [e.model_dump(mode="json") for e in state.activity_log[-20:]],
            "escalations": [e.model_dump(mode="json") for e in state.escalations.values()],
            "checkpoints": [c.model_dump(mode="json") for c in state.checkpoints.values() if c.status.value == "pending"],
            "phase_snapshots": phase_snapshots,
        },
        to=sid,
    )


@sio.event
async def disconnect(sid):
    print(f"[ws] client disconnected: {sid}")


# Socket.IO event: user sends message to boss via websocket
@sio.event
async def boss_message(sid, data):
    """Handle boss chat messages sent via Socket.IO with session tracking."""
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
    """Persist a drag-and-drop task move from the kanban board."""
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

    # Sync SDLC gate: find the gate event for this task and resolve it
    if cp and status == CheckpointStatus.APPROVED:
        # Find the pending gate event for this task
        for evt in state.sdlc_store.events.values():
            if (
                evt.is_phase_gate
                and evt.task_id == cp.task_id
                and not evt.gate_decision
            ):
                await state.sdlc_store.decide_gate(evt.event_id, "approved")
                break

        # Auto-chain: assign the next agent in the pipeline
        asyncio.create_task(_auto_chain_next_agent(cp.task_id, cp.next_status))

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

        context = TeamContext(state=state, sio=sio, current_agent_id=cp.agent_id)
        await state.update_agent(cp.agent_id, status="working", current_activity=f"Revising: {cp.task_title}")

        result = await Runner.run(agent_def, prompt, context=context, max_turns=10)

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


async def _auto_chain_next_agent(task_id: str, next_status: TaskStatus) -> None:
    """Auto-assign the next agent in the pipeline after a checkpoint approval.

    REVIEW  → Code Reviewer runs
    TESTING → QA runs
    DONE    → no further agent needed
    """
    # Map task status to the agent that should handle it
    status_to_agent: dict[TaskStatus, str] = {
        TaskStatus.REVIEW: "agent-cr",
        TaskStatus.TESTING: "agent-qa",
    }

    agent_id = status_to_agent.get(next_status)
    if agent_id is None:
        return  # DONE or other terminal status — nothing to chain

    task = state.tasks.get(task_id)
    if task is None:
        return

    try:
        from agents import Runner
        from ai_agents.definitions import get_agent_for_role
        from ai_agents.tools import TeamContext

        agent_def = get_agent_for_role(agent_id)
        if agent_def is None:
            return

        agent_obj = state.agents.get(agent_id)
        agent_name = agent_obj.name if agent_obj else agent_id

        # Assign the task to this agent
        await state.update_task(task_id, assigned_agent_id=agent_id)
        await state.update_agent(
            agent_id,
            status="working",
            current_task=task_id,
            current_activity=f"Working on: {task.title}",
        )
        await state.add_activity(
            f'{agent_name} auto-assigned to "{task.title}"',
            agent_id=agent_id,
        )

        # Build a role-appropriate prompt
        if agent_id == "agent-cr":
            prompt = (
                f"Review the code for task '{task.title}'.\n"
                f"Task description: {task.description}\n"
                f"Task ID: {task_id}\n"
                f"Your agent ID: {agent_id}\n\n"
                f"Follow your review workflow: read code, review, log findings, "
                f"and call report_task_completion with your decision."
            )
        else:  # agent-qa
            prompt = (
                f"Test the implementation for task '{task.title}'.\n"
                f"Task description: {task.description}\n"
                f"Task ID: {task_id}\n"
                f"Your agent ID: {agent_id}\n\n"
                f"Follow your QA workflow: draft test strategy, write tests, "
                f"run them, and call report_task_completion with your QA decision."
            )

        # Inherit active SDLC trace so events show on the progress bar
        context = TeamContext(state=state, sio=sio, current_agent_id=agent_id)

        result = await Runner.run(agent_def, prompt, context=context, max_turns=10)

        await state.update_agent(agent_id, status="idle", current_task=None, current_activity=None)

    except Exception as e:
        print(f"[auto-chain] Error running {agent_id} on {task_id}: {e}")
        await state.update_agent(agent_id, status="idle", current_task=None, current_activity=None)
        await state.add_activity(
            f"Auto-chain failed for {agent_id}: {e}",
            agent_id=agent_id,
        )


# Socket.IO event: user approves the Boss's plan
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
    session.add_message("user", "Approved. Go ahead and execute the plan.")
    asyncio.create_task(
        _run_boss_chat("The user has approved the plan. Proceed with execution.", session_id)
    )


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
