"""Pydantic models for the AI-governed dev team backend."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    THINKING = "thinking"
    MEETING = "meeting"
    CELEBRATING = "celebrating"


class AgentRole(str, Enum):
    BOSS = "Boss"
    PM = "PM"
    SCRUM_MASTER = "Scrum Master"
    DEVELOPER = "Developer"
    QA = "QA"
    CODE_REVIEWER = "Code Reviewer"


class TaskStatus(str, Enum):
    BACKLOG = "backlog"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    TESTING = "testing"
    DONE = "done"


class TaskPriority(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"



class SprintStatus(str, Enum):
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"


class ActivityType(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ESCALATION = "escalation"


class ChatRole(str, Enum):
    USER = "user"
    AGENT = "agent"


# ── Models ───────────────────────────────────────────────────────────────────

class Agent(BaseModel):
    id: str
    name: str
    role: AgentRole
    status: AgentStatus = AgentStatus.IDLE
    current_task: Optional[str] = None
    current_activity: Optional[str] = None
    avatar_color: str
    position: dict = Field(default_factory=lambda: {"x": 0, "y": 0})


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.BACKLOG
    assigned_agent_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.P1


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    assigned_agent_id: Optional[str] = None
    priority: Optional[TaskPriority] = None


class Task(BaseModel):
    id: str
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.BACKLOG
    assigned_agent_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.P1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Sprint(BaseModel):
    id: str
    name: str
    tasks: list[str] = Field(default_factory=list)
    start_date: datetime
    end_date: datetime
    status: SprintStatus = SprintStatus.ACTIVE


class SprintCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: datetime


class ActivityEntry(BaseModel):
    id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent_id: Optional[str] = None
    message: str
    type: ActivityType = ActivityType.INFO


class Escalation(BaseModel):
    id: str
    title: str
    description: str
    recommendation: str
    options: list[str] = Field(default_factory=list)
    resolved: bool = False


class ChatMessage(BaseModel):
    role: ChatRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
