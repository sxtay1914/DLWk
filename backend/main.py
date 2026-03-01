"""FastAPI + Socket.IO backend for the AI-governed dev team dashboard."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import socketio
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    ChatMessage,
    ChatRole,
    Sprint,
    SprintCreate,
    SprintStatus,
    Task,
    TaskCreate,
    TaskUpdate,
)
from simulation import run_simulation
from state import StateManager

# ── Socket.IO server ────────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
)

# ── Shared state ─────────────────────────────────────────────────────────────

state = StateManager(sio)

# ── Lifespan: start the simulation background task ───────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(run_simulation(state))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


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
async def list_tasks():
    """Return all tasks."""
    return list(state.tasks.values())


@app.post("/api/tasks", status_code=201)
async def create_task(payload: TaskCreate):
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
async def update_task(task_id: str, payload: TaskUpdate):
    """Update a task (move columns, reassign, change priority, etc.)."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    task = await state.update_task(task_id, **updates)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
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


# ── Chat (placeholder) ──────────────────────────────────────────────────────

@app.post("/api/chat/{agent_id}")
async def chat_with_agent(agent_id: str, message: ChatMessage):
    """Placeholder endpoint: pretend the agent responds."""
    if agent_id not in state.agents:
        raise HTTPException(status_code=404, detail="Agent not found.")

    agent = state.agents[agent_id]
    reply = ChatMessage(
        role=ChatRole.AGENT,
        content=f"[{agent.name}] Thanks for the message! I'm currently {agent.status.value}. (This is a placeholder response.)",
        timestamp=datetime.utcnow(),
    )
    return reply


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
        },
        to=sid,
    )


@sio.event
async def disconnect(sid):
    print(f"[ws] client disconnected: {sid}")


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
