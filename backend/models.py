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
    BOSS = "Chief"
    PM = "PM"
    SCRUM_MASTER = "Scrum Master"
    DEVELOPER = "Developer"
    QA = "QA"
    CODE_REVIEWER = "Code Reviewer"


class TaskStatus(str, Enum):
    BACKLOG = "backlog"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
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
    memory: list[str] = Field(default_factory=list)


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.BACKLOG
    assigned_agent_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.P1
    sdlc_stage: Optional[str] = None          # Plan|Design|Build|Test|Review|Deploy|Maintain
    definition_of_done: Optional[str] = None  # bullet-point string
    risk_tags: Optional[str] = None           # comma-separated: auth,db,migration,...
    estimated_size: Optional[str] = None      # S|M|L
    dependencies: Optional[str] = None        # comma-separated task titles


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    assigned_agent_id: Optional[str] = None
    priority: Optional[TaskPriority] = None
    sdlc_stage: Optional[str] = None
    definition_of_done: Optional[str] = None
    risk_tags: Optional[str] = None
    estimated_size: Optional[str] = None
    dependencies: Optional[str] = None


class Task(BaseModel):
    id: str
    ticket_number: int = 0
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.BACKLOG
    assigned_agent_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.P1
    sdlc_stage: Optional[str] = None          # Plan|Design|Build|Test|Review|Deploy|Maintain
    definition_of_done: Optional[str] = None  # bullet-point string
    risk_tags: Optional[str] = None           # comma-separated: auth,db,migration,...
    estimated_size: Optional[str] = None      # S|M|L
    dependencies: Optional[str] = None        # comma-separated task titles
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
    agent_name: Optional[str] = None
    agent_color: Optional[str] = None
    message: str
    type: ActivityType = ActivityType.INFO


class EscalationSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Escalation(BaseModel):
    id: str
    title: str
    description: str
    recommendation: str
    options: list[str] = Field(default_factory=list)
    severity: EscalationSeverity = EscalationSeverity.MEDIUM
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    resolved: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CheckpointStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    PAUSED = "paused"


class Checkpoint(BaseModel):
    id: str
    task_id: str
    task_title: str
    agent_id: str
    agent_name: str
    agent_color: str
    message: str
    next_status: TaskStatus
    status: CheckpointStatus = CheckpointStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Artifact(BaseModel):
    id: str
    task_id: str
    agent_id: str
    filename: str
    content: str
    language: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PendingFileChange(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    filename: str
    change_type: str          # "create" | "edit"
    old_content: str | None = None   # None for new files
    new_content: str
    description: str
    status: str = "pending"   # "pending" | "approved" | "rejected"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatMessage(BaseModel):
    role: ChatRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


