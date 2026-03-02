export type AgentRole = "boss" | "pm" | "scrum_master" | "developer" | "qa" | "code_reviewer";

export type AgentStatus = "idle" | "working" | "blocked" | "reviewing" | "offline";

export type TaskStatus = "backlog" | "in_progress" | "review" | "testing" | "done";

export type Priority = "P0" | "P1" | "P2";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  color: string;
  current_task_id: string | null;
  avatar_label: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  assigned_agent_color: string | null;
  sprint_id: string;
  created_at: string;
  updated_at: string;
  // SDLC metadata (set by PM agent)
  sdlc_stage: string | null;
  definition_of_done: string | null;
  risk_tags: string | null;
  estimated_size: string | null;
  dependencies: string | null;
}

export interface Sprint {
  id: string;
  name: string;
  status: "planning" | "active" | "completed";
  total_tasks: number;
  completed_tasks: number;
  start_date: string | null;
  end_date: string | null;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_color: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export interface Escalation {
  id: string;
  title: string;
  description: string;
  recommendation: string;
  agent_id: string;
  agent_name: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected" | "investigating";
  created_at: string;
}

export interface Checkpoint {
  id: string;
  task_id: string;
  task_title: string;
  agent_id: string;
  agent_name: string;
  agent_color: string;
  message: string;
  next_status: TaskStatus;
  status: "pending" | "approved" | "changes_requested" | "paused";
  created_at: string;
}

export interface ChatMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_color: string;
  content: string;
  sender: "user" | "agent";
  timestamp: string;
}

// ── SDLC Transparency Types ──────────────────────────────────────────────────

export type SDLCPhase = "planning" | "design" | "build" | "test" | "review" | "deploy" | "maintain";

export type PhaseStatus = "not_started" | "in_progress" | "gate_pending" | "approved" | "rejected" | "complete";

export interface SDLCEvent {
  event_id: string;
  trace_id: string;
  parent_event_id: string | null;
  sequence_index: number;
  phase: SDLCPhase;
  phase_sequence: number;
  artifact_type: string | null;
  artifact_ref: string | null;
  agent_id: string;
  agent_name: string;
  agent_color: string;
  task_id: string | null;
  task_title: string | null;
  summary: string;
  detail: string;
  reasoning_summary: string;
  tool_name: string | null;
  timestamp: string;
  duration_ms: number | null;
  severity: "info" | "warning" | "critical" | "gate";
  outcome: "success" | "failure" | "blocked" | "pending" | "escalated";
  outcome_detail: string | null;
  risk_flags: string[];
  is_phase_gate: boolean;
  gate_decision: string | null;
  gate_feedback: string | null;
}

export interface PhaseSnapshot {
  trace_id: string;
  phase: SDLCPhase;
  status: PhaseStatus;
  started_at: string | null;
  completed_at: string | null;
  event_count: number;
  agent_ids: string[];
  agent_names: string[];
  artifact_types: string[];
  risk_flags: string[];
  gate_event_id: string | null;
  gate_decision: string | null;
}

export const AGENT_COLORS: Record<AgentRole, string> = {
  boss: "#F59E0B",
  pm: "#3B82F6",
  scrum_master: "#14B8A6",
  developer: "#22C55E",
  qa: "#F97316",
  code_reviewer: "#8B5CF6",
};

export const COLUMN_ORDER: TaskStatus[] = ["backlog", "in_progress", "review", "testing", "done"];

export const COLUMN_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  review: "Review",
  testing: "Testing",
  done: "Done",
};
