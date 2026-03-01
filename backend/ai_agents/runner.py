"""Agent runner — executes agent workflows and streams events to Socket.IO."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from agents import Runner
from openai.types.responses import ResponseTextDeltaEvent

from ai_agents.definitions import create_boss_agent
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
                "Developer": "agent-dev",
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
) -> str:
    """Chat with the Boss agent. Supports conversation continuity.

    For simple questions, the Boss answers directly.
    For feature requests, the Boss kicks off the full agent pipeline.
    """
    boss = create_boss_agent()
    context = TeamContext(state=state, current_agent_id="agent-boss")

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
                    "delta": delta,
                    "agent": current_agent_name,
                })

        elif event.type == "agent_updated_stream_event":
            current_agent_name = event.new_agent.name

    final = result.final_output or full_response or "Done."

    await sio.emit("boss_chat_complete", {
        "output": final,
        "event_log": context.event_log,
    })

    return final
