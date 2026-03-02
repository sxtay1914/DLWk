"""Agent runner — executes agent workflows and streams events to Socket.IO."""

from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING

from agents import Runner
from openai.types.responses import ResponseTextDeltaEvent

from ai_agents.definitions import create_boss_agent, create_chat_agent, get_any_agent
from ai_agents.tools import TeamContext

if TYPE_CHECKING:
    import socketio
    from state import StateManager


def _workspace_root(state: "StateManager | None" = None) -> str | None:
    """Read workspace root from state (persisted across turns) or environment."""
    if state and state.workspace_root:
        return state.workspace_root
    return os.environ.get("WORKSPACE_ROOT")


async def run_agent_task(
    user_message: str,
    state: "StateManager",
    sio: "socketio.AsyncServer",
) -> str:
    """Run the Boss agent with a user message, streaming events to Socket.IO.

    Returns the final output text from the Boss.
    """
    boss = create_boss_agent()
    context = TeamContext(state=state, current_agent_id="agent-boss", workspace_root=_workspace_root(state))

    # Boss starts thinking when user sends a message
    from models import AgentStatus
    await state.update_agent("agent-boss", status=AgentStatus.THINKING, current_activity="Analyzing request...")

    # Stream the agent run
    result = Runner.run_streamed(
        boss,
        user_message,
        context=context,
        max_turns=25,
    )

    full_response = ""
    current_agent_name = "The Boss"

    async for event in result.stream_events():
        if event.type == "raw_response_event":
            if isinstance(event.data, ResponseTextDeltaEvent):
                delta = event.data.delta
                full_response += delta
                # Stream text chunks to frontend
                await sio.emit("agent_stream", {
                    "agent": current_agent_name,
                    "delta": delta,
                    "type": "text",
                })

        elif event.type == "agent_updated_stream_event":
            current_agent_name = event.new_agent.name
            # Map agent name to agent ID for status updates
            agent_id_map = {
                "The Boss": "agent-boss",
                "Project Manager": "agent-pm",
                "Scrum Master": "agent-sm",
                "Developer 1": "agent-dev",
                "Developer 2": "agent-dev2",
                "QA Engineer": "agent-qa",
                "Code Reviewer": "agent-cr",
            }
            agent_id = agent_id_map.get(current_agent_name)
            if agent_id:
                context.current_agent_id = agent_id

            await sio.emit("agent_stream", {
                "agent": current_agent_name,
                "type": "agent_switch",
            })

        elif event.type == "run_item_stream_event":
            if event.name == "tool_called":
                tool_name = event.item.raw_item.name if hasattr(event.item.raw_item, 'name') else "unknown"
                await sio.emit("agent_stream", {
                    "agent": current_agent_name,
                    "tool": tool_name,
                    "type": "tool_call",
                })

    # Final output
    final = result.final_output or full_response or "Task completed."

    # Boss goes back to idle when done
    await state.update_agent("agent-boss", status=AgentStatus.IDLE, current_activity=None)

    await sio.emit("agent_stream", {
        "agent": "The Boss",
        "type": "complete",
        "output": final,
        "event_log": context.event_log,
    })

    return final


async def chat_with_boss(
    user_message: str,
    state: "StateManager",
    sio: "socketio.AsyncServer",
    conversation_history: list[dict] | None = None,
    session_id: str | None = None,
) -> str:
    """Chat with the Boss agent. Supports conversation continuity.

    For simple questions, the Boss answers directly.
    For feature requests, the Boss kicks off the full agent pipeline.
    """
    boss = create_boss_agent()

    context = TeamContext(
        state=state,
        sio=sio,
        current_agent_id="agent-boss",
        session_id=session_id,
        workspace_root=_workspace_root(state),
    )

    # Boss starts thinking when user sends a message
    from models import AgentStatus
    await state.update_agent("agent-boss", status=AgentStatus.THINKING, current_activity="Analyzing request...")

    # Build input with conversation history
    if conversation_history:
        input_messages = conversation_history + [
            {"role": "user", "content": user_message}
        ]
    else:
        input_messages = user_message

    result = Runner.run_streamed(
        boss,
        input_messages,
        context=context,
        max_turns=25,
    )

    full_response = ""
    current_agent_name = "The Boss"

    agent_id_map = {
        "The Boss": "agent-boss",
        "Project Manager": "agent-pm",
        "Scrum Master": "agent-sm",
        "Developer 1": "agent-dev",
        "Developer 2": "agent-dev2",
        "QA Engineer": "agent-qa",
        "Code Reviewer": "agent-cr",
    }

    async for event in result.stream_events():
        if event.type == "raw_response_event":
            if isinstance(event.data, ResponseTextDeltaEvent):
                delta = event.data.delta
                full_response += delta
                await sio.emit("boss_chat_stream", {
                    "session_id": session_id,
                    "delta": delta,
                    "agent": current_agent_name,
                })

        elif event.type == "agent_updated_stream_event":
            current_agent_name = event.new_agent.name
            agent_id = agent_id_map.get(current_agent_name)
            if agent_id:
                context.current_agent_id = agent_id

    final = result.final_output or full_response or "Done."

    # Boss goes back to idle when done
    await state.update_agent("agent-boss", status=AgentStatus.IDLE, current_activity=None)

    await sio.emit("boss_chat_complete", {
        "session_id": session_id,
        "output": final,
        "event_log": context.event_log,
    })

    return final


async def chat_with_agent(
    agent_id: str,
    user_message: str,
    state: "StateManager",
    sio: "socketio.AsyncServer",
) -> str:
    """Chat directly with a specific agent — uses the REAL workflow agent,
    not a separate chat clone. The agent has full access to its tools and
    is aware of what it's been doing.
    """
    # Use the real agent — same one that does actual work
    agent_def = get_any_agent(agent_id)
    if agent_def is None:
        # Fallback to legacy chat agent if somehow the ID is unknown
        agent_def = create_chat_agent(agent_id)
    if agent_def is None:
        return f"Agent {agent_id} not available for chat."

    context = TeamContext(
        state=state,
        sio=sio,
        current_agent_id=agent_id,
        workspace_root=_workspace_root(state),
    )

    # Build rich context about what this agent has been doing
    agent_state = state.agents.get(agent_id)
    context_parts: list[str] = []

    context_parts.append(
        "--- CHAT MODE ---\n"
        "The user is chatting with you directly. Be conversational and BRIEF.\n"
        "- If the user asks a question: answer it concisely using your tools to look things up.\n"
        "- If the user asks you to do work (write code, fix bugs, etc): reply with a SHORT "
        "acknowledgment (1-2 sentences max, e.g. 'On it, fixing calc.ts now.') then DO the work "
        "silently using your tools. Do NOT narrate every step or dump code in the chat.\n"
        "- File changes you make will automatically appear in the review panel below the chat "
        "for the user to accept/reject. You do NOT need to show diffs or code in your reply.\n"
        "- Keep replies under 3 sentences. Be human, not a wall of text.\n"
        "- Do NOT follow your numbered workflow steps. Just do the work directly.\n"
        "--- END CHAT MODE ---"
    )

    if agent_state:
        context_parts.append(f"\nYour current status: {agent_state.status.value}")
        if agent_state.current_task:
            task = state.tasks.get(agent_state.current_task)
            if task:
                context_parts.append(
                    f"You are working on: [{task.id}] {task.title} ({task.status.value})\n"
                    f"  Description: {task.description}"
                )
        if agent_state.current_activity:
            context_parts.append(f"Current activity: {agent_state.current_activity}")

        # Include agent's memory
        if agent_state.memory:
            memory_lines = "\n".join(f"  - {m}" for m in agent_state.memory[-10:])
            context_parts.append(f"\nYour persistent memory:\n{memory_lines}")

    # Include recent activity from this agent (last 10 entries)
    agent_activities = [
        a for a in state.activity_log if a.agent_id == agent_id
    ][-10:]
    if agent_activities:
        activity_lines = "\n".join(
            f"  [{a.timestamp.strftime('%H:%M')}] {a.message}" for a in agent_activities
        )
        context_parts.append(f"\nYour recent activity:\n{activity_lines}")

    # Include task list if agent has tasks
    agent_tasks = [
        t for t in state.tasks.values() if t.assigned_agent_id == agent_id
    ]
    if agent_tasks:
        task_lines = "\n".join(
            f"  [{t.id}] {t.title} — {t.status.value}" for t in agent_tasks
        )
        context_parts.append(f"\nTasks assigned to you:\n{task_lines}")

    # Include artifacts this agent created
    agent_artifacts = [a for a in state.artifacts if a.agent_id == agent_id][-5:]
    if agent_artifacts:
        art_lines = "\n".join(f"  {a.filename} ({a.language})" for a in agent_artifacts)
        context_parts.append(f"\nFiles you've written:\n{art_lines}")

    # Workspace info
    ws = _workspace_root(state)
    if ws:
        context_parts.append(f"\nWorkspace directory: {ws}")

    status_context = "\n".join(context_parts)
    full_input = f"{status_context}\n\n--- USER MESSAGE ---\n{user_message}"

    result = Runner.run_streamed(
        agent_def,
        full_input,
        context=context,
        max_turns=15,
    )

    full_response = ""

    async for event in result.stream_events():
        if event.type == "raw_response_event":
            if isinstance(event.data, ResponseTextDeltaEvent):
                delta = event.data.delta
                full_response += delta
                await sio.emit("agent_chat_stream", {
                    "agent_id": agent_id,
                    "delta": delta,
                })

    final = result.final_output or full_response or "..."

    await sio.emit("agent_chat_complete", {
        "agent_id": agent_id,
        "output": final,
    })

    return final


async def resume_pipeline(
    remaining_tasks: list,
    state: "StateManager",
    sio: "socketio.AsyncServer",
) -> str:
    """Resume the pipeline when agents are idle with unfinished tasks.

    Bypasses the Boss's Phase 1/2 gates (workspace clarification and plan
    approval) which would stall waiting for human input that never comes.
    Assigns any unassigned tasks programmatically then calls run_phases()
    directly — no LLM handoff required.
    """
    from models import AgentStatus, TaskPriority
    from ai_agents.tools import TeamContext, run_phases

    await state.update_agent(
        "agent-boss",
        status=AgentStatus.WORKING,
        current_activity=f"Resuming pipeline — {len(remaining_tasks)} task(s) remaining",
    )
    await state.add_activity(
        f"Auto-resuming: {len(remaining_tasks)} task(s) remaining",
        agent_id="agent-boss",
    )

    # ── Assign any tasks that don't have an agent yet ─────────────────────
    dev_toggle = ["agent-dev", "agent-dev2"]
    dev_idx = 0
    for task in remaining_tasks:
        if task.assigned_agent_id:
            continue  # already assigned

        title_lower = task.title.lower()
        desc_lower  = (task.description or "").lower()
        combined    = title_lower + " " + desc_lower

        if any(kw in combined for kw in ("test", "qa", "spec", "quality")):
            agent_id = "agent-qa"
        elif any(kw in combined for kw in ("review", "audit", "inspect")):
            agent_id = "agent-cr"
        else:
            agent_id = dev_toggle[dev_idx % 2]
            dev_idx += 1

        await state.update_task(task.id, assigned_agent_id=agent_id)
        await state.add_activity(
            f'Auto-assigned "{task.title}" → {agent_id}',
            agent_id="agent-boss",
        )
        print(f"\033[2m[resume] assigned {task.id} → {agent_id}\033[0m")

    # ── Run phases directly — no SM LLM in the loop ───────────────────────
    context = TeamContext(
        state=state,
        sio=sio,
        current_agent_id="agent-boss",
        workspace_root=_workspace_root(state),
    )
    try:
        result = await run_phases(context)
    except Exception as e:
        print(f"[resume] Error during phase execution: {e}")
        result = f"Resume failed: {e}"

    await state.update_agent("agent-boss", status=AgentStatus.IDLE, current_activity=None)
    await state.add_activity("Pipeline resume complete.", agent_id="agent-boss")
    return result
