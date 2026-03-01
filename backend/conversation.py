"""Conversation manager for multi-turn Boss chat sessions.

Tracks conversation history, phase, and plan state per session.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ConversationPhase(str, Enum):
    CLARIFYING = "clarifying"
    PLANNING = "planning"
    APPROVED = "approved"
    EXECUTING = "executing"


@dataclass
class ConversationSession:
    id: str
    messages: list[dict] = field(default_factory=list)
    phase: ConversationPhase = ConversationPhase.CLARIFYING
    plan: Optional[list[str]] = None

    def add_message(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})

    def get_history(self) -> list[dict]:
        return list(self.messages)


class ConversationManager:
    """In-memory store for Boss conversation sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, ConversationSession] = {}

    def create_session(self) -> ConversationSession:
        session_id = f"conv-{uuid.uuid4().hex[:8]}"
        session = ConversationSession(id=session_id)
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        return self._sessions.get(session_id)

    def set_phase(self, session_id: str, phase: ConversationPhase) -> None:
        session = self._sessions.get(session_id)
        if session:
            session.phase = phase

    def set_plan(self, session_id: str, plan: list[str]) -> None:
        session = self._sessions.get(session_id)
        if session:
            session.plan = plan
            session.phase = ConversationPhase.PLANNING
