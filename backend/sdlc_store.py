"""SDLC Event Store — phase-tagged events, materialized snapshots, causal indexes.

All agent tool calls that produce work artifacts (tasks, code, tests, reviews)
emit an SDLCEvent here. The store maintains:
  - An event log indexed by (trace_id, phase) for fast phase queries
  - Per-task event indexes for the Task Activity Panel
  - Materialized PhaseSnapshots so the Progress Bar never recomputes aggregates
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from models import ArtifactType, PhaseSnapshot, SDLCEvent, SDLCPhase

if TYPE_CHECKING:
    import socketio

# ── Phase display order ───────────────────────────────────────────────────────

PHASE_ORDER: list[SDLCPhase] = [
    SDLCPhase.PLANNING,
    SDLCPhase.DESIGN,
    SDLCPhase.BUILD,
    SDLCPhase.TEST,
    SDLCPhase.REVIEW,
    SDLCPhase.DEPLOY,
    SDLCPhase.MAINTAIN,
]

# ── Tool → Phase mapping ──────────────────────────────────────────────────────

TOOL_TO_PHASE: dict[str, SDLCPhase] = {
    "create_task":            SDLCPhase.PLANNING,
    "present_plan":           SDLCPhase.PLANNING,
    "execute_approved_plan":  SDLCPhase.PLANNING,
    "assign_task":            SDLCPhase.PLANNING,
    "get_sprint_info":        SDLCPhase.PLANNING,
    "list_tasks":             SDLCPhase.PLANNING,
    "run_agents_parallel":    SDLCPhase.BUILD,
    "write_code":             SDLCPhase.BUILD,
    "run_command":            SDLCPhase.BUILD,
    "run_tests":              SDLCPhase.TEST,
    "review_code":            SDLCPhase.REVIEW,
    "report_task_completion": SDLCPhase.BUILD,   # overridden by task.sdlc_stage at runtime
}

# ── Tool → ArtifactType mapping ───────────────────────────────────────────────

TOOL_TO_ARTIFACT: dict[str, ArtifactType] = {
    "create_task":   ArtifactType.TASK_BACKLOG,
    "write_code":    ArtifactType.CODE_FILE,
    "run_command":   ArtifactType.COMMAND_OUTPUT,
    "run_tests":     ArtifactType.TEST_CASE_SUITE,
    "review_code":   ArtifactType.REVIEW_DECISION,
}

# ── Agent → default phase (for log_activity inference) ───────────────────────

AGENT_TO_PHASE: dict[str, SDLCPhase] = {
    "agent-boss":  SDLCPhase.PLANNING,
    "agent-pm":    SDLCPhase.PLANNING,
    "agent-sm":    SDLCPhase.PLANNING,
    "agent-dev":   SDLCPhase.BUILD,
    "agent-dev2":  SDLCPhase.BUILD,
    "agent-qa":    SDLCPhase.TEST,
    "agent-cr":    SDLCPhase.REVIEW,
}

# ── Keywords that flag a log_activity message as an artifact ──────────────────

_ARTIFACT_KEYWORDS: list[tuple[list[str], ArtifactType]] = [
    (["Requirements Summary", "Acceptance Criteria", "PM Analysis"],   ArtifactType.REQUIREMENTS_SUMMARY),
    (["Risks & Edge Cases", "risk tier", "PM Backlog"],                ArtifactType.RISK_REGISTER),
    (["Test Strategy", "QA Strategy", "TC-001"],                       ArtifactType.TEST_STRATEGY),
    (["[BUG-", "Severity: Critical", "Severity: High"],                ArtifactType.BUG_REPORT),
    (["QA Sign-off", "BLOCKED"],                                       ArtifactType.QA_SIGN_OFF),
    (["CR Decision", "APPROVED", "REJECTED", "CHANGES REQUESTED"],     ArtifactType.REVIEW_DECISION),
    (["Self-Review", "Dev1 Self-Review", "Dev2 Self-Review"],          ArtifactType.BUILD_LOG),
    (["Assignment Plan", "SM Sprint Check"],                           ArtifactType.ARCHITECTURE_DECISION),
]

_RISK_KEYWORDS = ["auth", "security", "migration", "db", "perf", "infra", "api"]


def infer_artifact_from_message(message: str) -> Optional[ArtifactType]:
    for keywords, artifact in _ARTIFACT_KEYWORDS:
        if any(kw in message for kw in keywords):
            return artifact
    return None


def extract_risk_flags(text: str) -> list[str]:
    found = []
    lower = text.lower()
    for kw in _RISK_KEYWORDS:
        if kw in lower and kw not in found:
            found.append(kw)
    return found


# ── SDLCEventStore ────────────────────────────────────────────────────────────

class SDLCEventStore:
    """Central store for all SDLC transparency events.

    Maintains three indexes:
      trace_index[(trace_id)]           → [event_id, ...] in sequence order
      phase_index[(trace_id, phase)]    → [event_id, ...] in phase order
      task_index[(task_id)]             → [event_id, ...] in sequence order

    And a materialized snapshot per (trace_id, phase) for fast Progress Bar queries.
    """

    def __init__(self, sio: "socketio.AsyncServer | None" = None) -> None:
        self.sio = sio
        self.events: dict[str, SDLCEvent] = {}
        self.trace_index: dict[str, list[str]] = defaultdict(list)
        self.phase_index: dict[tuple, list[str]] = defaultdict(list)
        self.task_index: dict[str, list[str]] = defaultdict(list)
        self.phase_snapshots: dict[tuple, PhaseSnapshot] = {}
        self._phase_counters: dict[tuple, int] = defaultdict(int)
        self._global_counter: int = 0
        self._active_trace_id: Optional[str] = None

    # ── Trace management ─────────────────────────────────────────────────────

    def new_trace(self, session_id: str | None = None) -> str:
        """Start a new workflow trace. Returns the trace_id."""
        tid = session_id or uuid.uuid4().hex
        self._active_trace_id = tid
        return tid

    @property
    def active_trace_id(self) -> str | None:
        return self._active_trace_id

    # ── Event ingestion ──────────────────────────────────────────────────────

    async def ingest(self, event: SDLCEvent) -> SDLCEvent:
        """Record an event and update the materialized snapshot for its phase."""
        self._global_counter += 1
        event.sequence_index = self._global_counter

        phase_key = (event.trace_id, event.phase)
        self._phase_counters[phase_key] += 1
        event.phase_sequence = self._phase_counters[phase_key]

        # Update indexes
        self.events[event.event_id] = event
        self.trace_index[event.trace_id].append(event.event_id)
        self.phase_index[phase_key].append(event.event_id)
        if event.task_id:
            self.task_index[event.task_id].append(event.event_id)

        # Update or create phase snapshot
        snap = self.phase_snapshots.get(phase_key)
        if snap is None:
            snap = PhaseSnapshot(trace_id=event.trace_id, phase=event.phase)
            self.phase_snapshots[phase_key] = snap

        if snap.status == "not_started":
            snap.status = "in_progress"
            snap.started_at = event.timestamp

        snap.event_count += 1

        if event.agent_id not in snap.agent_ids:
            snap.agent_ids.append(event.agent_id)
        if event.agent_name not in snap.agent_names:
            snap.agent_names.append(event.agent_name)
        if event.artifact_type and event.artifact_type.value not in snap.artifact_types:
            snap.artifact_types.append(event.artifact_type.value)
        for flag in event.risk_flags:
            if flag not in snap.risk_flags:
                snap.risk_flags.append(flag)

        if event.is_phase_gate:
            snap.status = "gate_pending"
            snap.gate_event_id = event.event_id

        # Real-time push to frontend
        if self.sio:
            await self.sio.emit("sdlc_event", event.model_dump(mode="json"))
            await self.sio.emit("phase_snapshot_update", snap.model_dump(mode="json"))

        return event

    # ── Query methods ────────────────────────────────────────────────────────

    def get_phase_snapshots(self, trace_id: str) -> list[PhaseSnapshot]:
        """Return one PhaseSnapshot per phase in display order (fills in not_started)."""
        result = []
        for phase in PHASE_ORDER:
            snap = self.phase_snapshots.get((trace_id, phase))
            if snap is None:
                snap = PhaseSnapshot(trace_id=trace_id, phase=phase, status="not_started")
            result.append(snap)
        return result

    def get_phase_events(self, trace_id: str, phase: SDLCPhase) -> list[SDLCEvent]:
        """All events for a specific phase, ordered by phase_sequence."""
        ids = self.phase_index.get((trace_id, phase), [])
        evts = [self.events[i] for i in ids if i in self.events]
        return sorted(evts, key=lambda e: e.phase_sequence)

    def get_task_events(self, task_id: str) -> list[SDLCEvent]:
        """All events for a task, ordered by global sequence_index."""
        ids = self.task_index.get(task_id, [])
        evts = [self.events[i] for i in ids if i in self.events]
        return sorted(evts, key=lambda e: e.sequence_index)

    def get_task_artifacts(self, task_id: str) -> dict[str, list[dict]]:
        """Events grouped by phase with artifact metadata — used by Task Activity Panel."""
        evts = self.get_task_events(task_id)
        by_phase: dict[str, list[dict]] = {}
        for e in evts:
            pv = e.phase.value
            if pv not in by_phase:
                by_phase[pv] = []
            entry = {
                "event_id": e.event_id,
                "artifact_type": e.artifact_type.value if e.artifact_type else None,
                "artifact_ref": e.artifact_ref,
                "summary": e.summary,
                "reasoning_summary": e.reasoning_summary,
                "agent_name": e.agent_name,
                "agent_color": e.agent_color,
                "timestamp": e.timestamp.isoformat(),
                "severity": e.severity,
                "outcome": e.outcome,
                "risk_flags": e.risk_flags,
                "is_phase_gate": e.is_phase_gate,
            }
            by_phase[pv].append(entry)
        return by_phase

    # ── Gate decisions ───────────────────────────────────────────────────────

    async def decide_gate(self, gate_event_id: str, decision: str, feedback: str = "") -> bool:
        """Record a human decision on a phase gate event."""
        event = self.events.get(gate_event_id)
        if not event:
            return False

        event.gate_decision = decision
        event.gate_feedback = feedback

        phase_key = (event.trace_id, event.phase)
        snap = self.phase_snapshots.get(phase_key)
        if snap:
            snap.gate_decision = decision
            snap.status = "approved" if decision == "approved" else "rejected"
            if decision == "approved":
                snap.completed_at = datetime.utcnow()
            if self.sio:
                await self.sio.emit("phase_snapshot_update", snap.model_dump(mode="json"))

        return True
