"""Agent runner — executes agent workflows and streams events to Socket.IO."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from agents import Runner
from openai.types.responses import ResponseTextDeltaEvent

from ai_agents.definitions import create_boss_agent, create_chat_agent
from ai_agents.tools import TeamContext

if TYPE_CHECKING:
    import socketio
    from state import StateManager


async def run_agent_task(
    user_message: str,
    state: "StateManager",
    sio: "socketio.AsyncServer",
) -> str:
    """Run the Boss agent with a user message, streaming events to Socket.IO.

    Returns the final output text from the Boss.
    """
    boss = create_boss_agent()
    context = TeamContext(state=state, current_agent_id="agent-boss")

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

    # Start a new SDLC trace for this session
    trace_id = state.sdlc_store.new_trace(session_id)

    context = TeamContext(
        state=state,
        sio=sio,
        current_agent_id="agent-boss",
        session_id=session_id,
        trace_id=trace_id,
        sdlc_store=state.sdlc_store,
    )

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

    final = result.final_output or full_response or "Done."

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
    """Chat directly with a specific agent. The agent responds in character
    and routes out-of-scope requests to the Boss.
    """
    agent_def = create_chat_agent(agent_id)
    if agent_def is None:
        return f"Agent {agent_id} not available for chat."

    context = TeamContext(
        state=state,
        sio=sio,
        current_agent_id=agent_id,
    )

    # Include agent's current state in the prompt
    agent_state = state.agents.get(agent_id)
    status_context = ""
    if agent_state:
        status_context = f"\n\nYour current status: {agent_state.status.value}"
        if agent_state.current_task:
            task = state.tasks.get(agent_state.current_task)
            if task:
                status_context += f"\nYou are working on: {task.title} — {task.description}"
        if agent_state.current_activity:
            status_context += f"\nCurrent activity: {agent_state.current_activity}"

    full_input = user_message + status_context

    result = Runner.run_streamed(
        agent_def,
        full_input,
        context=context,
        max_turns=5,
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
