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
    Sprint,
    SprintCreate,
    SprintStatus,
    Task,
    TaskCreate,
    TaskUpdate,
)
from conversation import ConversationManager, ConversationPhase
from state import StateManager

# Load environment variables (.env has OPENAI_API_KEY)
load_dotenv()

# ── Socket.IO server ────────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
)

# ── Shared state ─────────────────────────────────────────────────────────────

state = StateManager(sio)
conversations = ConversationManager()

# ── Lifespan: start the simulation background task ───────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    from simulation import run_simulation
    task = asyncio.create_task(run_simulation(state))
    yield
    task.cancel()


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

    await state.resolve_checkpoint(checkpoint_id, status, feedback)


# Socket.IO event: user approves the Boss's plan
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
