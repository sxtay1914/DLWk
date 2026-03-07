# Architecture & Design Document

## System Overview

An autonomous AI software engineering team where 7 AI agents collaborate to build software. A human oversees the process through an interactive dashboard with checkpoint gates, file staging, and savepoint-based revert capability.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HUMAN (Browser UI)                          │
│  CommandBar → PixelOffice → KanbanBoard → ApprovalQueue → GitGraph│
└────────────────────────────┬────────────────────────────────────────┘
                             │ Socket.IO + REST
┌────────────────────────────▼────────────────────────────────────────┐
│                     BACKEND (FastAPI + Socket.IO)                   │
│  StateManager ─ ConversationManager ─ AgentRunner                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ OpenAI Codex Agents SDK
┌────────────────────────────▼────────────────────────────────────────┐
│                       AGENT LAYER                                   │
│  Chief → PM → Scrum Master → [Dev1, Dev2, QA, CR] (parallel)      │
│  Each agent has: personality, tools, role boundaries                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Architecture

### Agent Framework

Built on the **OpenAI Codex Agents SDK** (`agents` Python package). Each agent is an `Agent[TeamContext]` instance with:

- **Model**: GPT-5-mini (Chief, Devs, QA, CR) or GPT-4.1-mini (PM, SM)
- **Instructions**: Personality + numbered workflow steps + role boundaries
- **Tools**: Function tools decorated with `@function_tool`
- **Context**: Shared `TeamContext` dataclass passed through `RunContextWrapper`

### TeamContext (Shared State Access)

```python
@dataclass
class TeamContext:
    state: StateManager          # All mutable state (agents, tasks, checkpoints, etc.)
    sio: socketio.AsyncServer    # Real-time event emission
    current_agent_id: str        # Who is "active" for activity log attribution
    event_log: list[str]         # Summary of everything that happened
    session_id: str | None       # Conversation session for multi-turn chat
    workspace_root: str | None   # Directory for real filesystem I/O
```

Every tool call receives this context, allowing agents to:
- Mutate shared state (create tasks, update statuses)
- Emit Socket.IO events (real-time UI updates)
- Read/write the actual filesystem (workspace directory)

### Agent Definitions

| Agent | ID | Model | Personality | Key Traits |
|-------|-----|-------|-------------|------------|
| **Alex** (Chief) | `agent-boss` | gpt-5-mini | Confident, concise, dry humour | Orchestrator. Cannot execute code. Delegates via tools. |
| **Jordan** (PM) | `agent-pm` | gpt-4.1-mini | Thoughtful, detail-oriented, "what about...?" | Breaks features into JSON task plans. Does not create tasks directly. |
| **Morgan** (SM) | `agent-sm` | gpt-4.1-mini | Organized, upbeat, action-oriented | Publishes tasks, assigns agents, triggers parallel execution. |
| **Sam** (Dev 1) | `agent-dev` | gpt-5-mini | Enthusiastic, opinionated, uses analogies | Full-stack. Reads/writes files, runs commands. |
| **Taylor** (Dev 2) | `agent-dev2` | gpt-5-mini | Methodical, careful, thinks about failure modes | Backend-leaning. Same tools as Dev 1. |
| **Quinn** (QA) | `agent-qa` | gpt-5-mini | Skeptical, meticulous, "devil's advocate" | Assumes every feature has 3 bugs. Writes/runs tests. |
| **Riley** (CR) | `agent-cr` | gpt-5-mini | Constructive but firm, explains the "why" | Reviews across 5 dimensions. Severity-gated decisions. |

### Role Boundaries

Every agent has a `_ROLE_BOUNDARY` preamble appended to their instructions:

> "You MUST stay within your role. If the user asks you to do something outside your responsibilities, politely explain that's not your job and use the route_to_boss tool to hand the request to the Chief."

This prevents cross-role contamination (e.g., QA writing production code).

---

## Agent Pipeline

### Phase Flow

```
User Message
    │
    ▼
┌─────────────────────────────────────────┐
│  CHIEF (Alex)                           │
│  Phase 1: CLARIFY — ask for workspace   │
│           path, clarify requirements    │
│  Phase 2: PLAN — call present_plan,     │
│           wait for user approval        │
│  Phase 3: EXECUTE — delegate to PM/SM   │
└────────────┬───────────────────┬────────┘
             │                   │
    delegate_to_pm      delegate_to_scrum_master
             │                   │
             ▼                   ▼
┌────────────────────┐  ┌────────────────────────┐
│  PM (Jordan)       │  │  SM (Morgan)           │
│  - read_proj_memory│  │  - publish_task_plan   │
│  - list_directory  │  │  - assign_task (×N)    │
│  - log_activity    │  │  - run_agents_parallel │
│  - Return JSON     │  │  - report_completion   │
│    task plan       │  └───────────┬────────────┘
└────────────────────┘              │
                          run_agents_parallel
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌─────────────┐
 Phase 1:     │  Dev 1   │   │  Dev 2   │   │  (wait)     │
 (parallel)   │  (Sam)   │   │ (Taylor) │   │             │
              └────┬─────┘   └────┬─────┘   │             │
                   │              │          │             │
 Phase 2:          └──────────────┘          ▼             │
 (after devs)                          ┌──────────┐       │
                                       │  QA      │       │
                                       │ (Quinn)  │       │
                                       └────┬─────┘       │
                                            │             │
 Phase 3:                                   └─────────────┘
 (after QA)                                       ▼
                                          ┌──────────────┐
                                          │  Code Review │
                                          │  (Riley)     │
                                          └──────────────┘
```

### Parallel Execution (`run_agents_parallel`)

The Scrum Master's most critical tool. Executes agents in 3 sequenced phases:

1. **Phase 1 — Development**: Dev 1 + Dev 2 run concurrently via `asyncio.gather()`
2. **Phase 2 — Testing**: QA runs after both devs finish
3. **Phase 3 — Review**: Code Reviewer runs after QA

Each phase:
- Filters tasks by assigned agent
- Updates task status to `in_progress`
- Creates an `Agent[TeamContext]` runner with `max_turns=100`
- On completion, agent calls `report_task_completion` → checkpoint created

### Delegation Mechanism

The Chief uses PM and SM as **function tools** (not SDK hand-offs):

```python
@function_tool(name_override="delegate_to_pm")
async def delegate_to_pm(ctx, message):
    # Switch attribution to PM
    ctx.context.current_agent_id = "agent-pm"
    # Run PM as a sub-agent
    result = await Runner.run(pm_agent, message, context=ctx.context, max_turns=100)
    return result.final_output
```

This means:
- The Chief stays in control (not a hand-off)
- PM/SM outputs are returned to the Chief as tool results
- Activity log correctly attributes messages to each agent

---

## Tool System

### Tool Categories

#### Workspace I/O (filesystem access)
| Tool | Description | Used By |
|------|-------------|---------|
| `set_workspace` | Set the workspace root directory | Chief |
| `read_file` | Read a file from workspace | Dev, QA, CR |
| `write_code` | Create a new file (blocks overwrite) | Dev, QA |
| `edit_file` | Edit existing file with old_text → new_text | Dev |
| `list_directory` | List files and directories | All |
| `search_code` | Search for text patterns across files | Dev, QA, CR |
| `run_command` | Execute shell command in workspace | Dev, QA, CR |
| `run_tests` | Write and execute test files | QA |

#### Task Management
| Tool | Description | Used By |
|------|-------------|---------|
| `create_task` | Create a new task on the board | SM (via publish_task_plan) |
| `list_tasks` | List all tasks with status/assignee | All |
| `update_task_status` | Change task status | SM |
| `assign_task` | Assign a task to an agent | SM |
| `publish_task_plan` | Batch-create tasks from PM's JSON | SM |
| `get_sprint_info` | Get sprint metadata | Chief, PM, SM |

#### Agent Coordination
| Tool | Description | Used By |
|------|-------------|---------|
| `update_agent_status` | Update agent's status + activity text | All |
| `log_activity` | Add entry to activity log (emits to UI) | All |
| `report_task_completion` | Create checkpoint for human approval | Dev, QA, CR, PM, SM |
| `run_agents_parallel` | Execute Dev→QA→CR pipeline | SM |
| `route_to_boss` | Hand off out-of-scope request to Chief | All except Chief |
| `create_escalation` | Escalate a decision to the human | Chief |

#### Plan Lifecycle
| Tool | Description | Used By |
|------|-------------|---------|
| `present_plan` | Present plan steps for user approval | Chief |
| `execute_approved_plan` | Mark plan as approved, begin execution | Chief |

#### Memory System
| Tool | Description | Used By |
|------|-------------|---------|
| `save_memory` | Save a note to agent's in-memory list | All |
| `recall_memory` | Retrieve agent's saved notes | All |
| `flush_agent_memory` | Clear an agent's memory | Chief |
| `summarize_and_flush_memory` | Summarize then clear memory | Chief |
| `read_proj_memory` | Read PROJ_MEM.md from workspace | Dev, PM, QA, CR |
| `update_proj_memory` | Update PROJ_MEM.md in workspace | Dev |

#### Code Review
| Tool | Description | Used By |
|------|-------------|---------|
| `review_code` | Submit structured code review | CR |
| `get_task_code` | Get code artifacts for a task | CR, Dev (chat) |

### File Staging

When agents call `write_code` or `edit_file`, the file is written to disk **and** a `PendingFileChange` is created:

```
Agent calls write_code("app.py", content)
    → File written to workspace/app.py
    → PendingFileChange created (status="pending")
    → Socket.IO emits "file_change_pending"
    → UI shows diff viewer with Accept/Reject
    → Human clicks Accept → status="approved", savepoint created
    → Human clicks Reject → file reverted on disk, agent re-invoked with feedback
```

### Path Safety

All file operations go through `_safe_path()` which prevents directory traversal attacks:

```python
def _safe_path(workspace, relative):
    target = (workspace / clean).resolve()
    if not str(target).startswith(str(workspace.resolve())):
        raise ValueError("Path traversal blocked")
```

---

## Memory System

### Agent Memory (In-Memory)

Each agent has a `memory: list[str]` field on the `Agent` model. Tools:
- `save_memory(note)` — appends a string to the agent's memory list
- `recall_memory()` — returns all saved notes
- `flush_agent_memory(agent_id)` — clears an agent's memory (Chief only)

**Limitation**: Memory is lost on server restart. Not persisted to disk.

### Project Memory (File-Based)

A `PROJ_MEM.md` file in the workspace directory serves as shared project context:
- `read_proj_memory()` — reads PROJ_MEM.md content
- `update_proj_memory(content)` — writes/appends to PROJ_MEM.md

This persists across agent runs as long as the workspace exists.

### Conversation Memory

Multi-turn chat with the Chief uses `ConversationManager`:

```python
class ConversationSession:
    id: str
    messages: list[dict]       # {role: "user"|"assistant", content: str}
    phase: ConversationPhase   # clarifying → planning → approved → executing
    plan: list[str] | None     # Plan steps awaiting approval
```

Sessions are keyed by `session_id` and passed to the agent runner so conversation history is maintained across turns.

---

## State Management

### StateManager

Central in-memory store (`state.py`). All mutations emit Socket.IO events for real-time UI sync.

```python
class StateManager:
    agents: dict[str, Agent]                    # 7 agents
    tasks: dict[str, Task]                      # Sprint tasks
    sprint: Sprint | None                       # Current sprint
    activity_log: list[ActivityEntry]            # Chronological log
    escalations: dict[str, Escalation]           # Pending escalations
    checkpoints: dict[str, Checkpoint]           # Approval gates
    artifacts: list[Artifact]                    # Code artifacts
    pending_file_changes: dict[str, PendingFileChange]  # Staged writes
    savepoints: list[Savepoint]                  # Revert snapshots
    workspace_root: str | None                   # Working directory
```

### Mutation → Event Pattern

Every state mutation emits a corresponding Socket.IO event:

| Mutation | Event Emitted |
|----------|---------------|
| `update_agent(id, ...)` | `agent_update` |
| `add_task(task)` | `task_update {action: "create"}` |
| `update_task(id, ...)` | `task_update {action: "update"}` |
| `delete_task(id)` | `task_update {action: "delete"}` |
| `add_activity(msg)` | `activity` |
| `add_checkpoint(cp)` | `task_checkpoint` |
| `resolve_checkpoint(id, status)` | `checkpoint_resolved` |
| `add_file_change(change)` | `file_change_pending` |
| `resolve_file_change(id, action)` | `file_change_resolved` |
| `create_savepoint(label)` | `savepoint_created` |
| `revert_to_savepoint(id)` | `savepoint_reverted` |

### Initial State Hydration

On Socket.IO connect, the server emits `initial_state` with all current data:

```python
{
    "agents": [...],
    "tasks": [...],
    "sprint": {...} | null,
    "activity": [...last 20],
    "escalations": [...],
    "checkpoints": [...pending only],
    "file_changes": [...pending only],
    "savepoints": [...]
}
```

---

## Savepoint System

### Architecture

Savepoints capture the full system state at milestones for revert capability.

```
backend/_savepoints/
  sp-abc12345/
    state.json          ← Serialized StateManager (agents, tasks, sprint, etc.)
    workspace/           ← Full copy of workspace directory (shutil.copytree)
  sp-def67890/
    state.json
    workspace/
```

### Auto-Trigger Points

| Milestone | Label Format |
|-----------|-------------|
| First task published (sprint kickoff) | `"Sprint started — tasks published"` |
| Checkpoint approved by human | `"Checkpoint approved: {task_title}"` |
| File change accepted by human | `"File accepted: {filename}"` |

### Serialization

`_serialize_state()` captures:
- All agent states (status, current_task, memory, position)
- All tasks (with SDLC metadata, timestamps)
- Sprint metadata
- Full activity log
- All checkpoints, escalations, artifacts
- All pending file changes
- Next ticket counter
- Workspace root path

### Revert Process

1. Load `state.json` from savepoint directory
2. Overwrite all in-memory state via `_restore_state()`
3. Delete workspace directory, copy savepoint's workspace back
4. Delete all savepoints created after the target
5. Clean up savepoint directories from disk
6. Emit `savepoint_reverted` → frontend reloads page

---

## Data Models

### Core Models (Pydantic v2)

```
Agent
  id, name, role, status, current_task, current_activity, avatar_color, position, memory

Task
  id, ticket_number, title, description, status, assigned_agent_id, priority
  sdlc_stage, definition_of_done, risk_tags, estimated_size, dependencies
  created_at, updated_at

Sprint
  id, name, tasks[], start_date, end_date, status

ActivityEntry
  id, timestamp, agent_id, agent_name, agent_color, message, type

Checkpoint
  id, task_id, task_title, agent_id, agent_name, agent_color
  message, next_status, status, created_at

PendingFileChange
  id, agent_id, agent_name, task_id, filename, change_type
  old_content, new_content, description, status, created_at

Escalation
  id, title, description, recommendation, options[], severity
  agent_id, agent_name, resolved, created_at

Savepoint
  id, label, activity_index, timestamp, state_file, files_dir

ChatMessage
  role, content, timestamp
```

### Enums

```
AgentStatus:  idle | working | thinking | meeting | celebrating
AgentRole:    Chief | PM | Scrum Master | Developer | QA | Code Reviewer
TaskStatus:   backlog | in_progress | review | done
TaskPriority: P0 | P1 | P2
SprintStatus: planning | active | completed
ActivityType: info | warning | escalation
CheckpointStatus: pending | approved | changes_requested | paused
EscalationSeverity: low | medium | high | critical
```

---

## Background Monitors

### Periodic Status Logger
Prints formatted agent status table to terminal every 30 seconds.

### Idle Work Monitor
Runs every 2 seconds, watches for stalled work:

1. **Per-task auto-promotion**: If all agents idle with `in_progress` tasks, each task gets a random 5–10s timer. When it fires, the task auto-advances to `review`.

2. **Pipeline auto-resume**: If all agents idle ≥60s with backlog tasks and no pending checkpoints, calls `resume_pipeline()` which:
   - Auto-assigns unassigned tasks (coding→dev, testing→qa, review→cr)
   - Calls `run_phases()` directly (bypasses Chief's Phase 1/2 gates)

---

## Frontend Architecture

### Component Hierarchy

```
page.tsx (main layout)
├── Header.tsx              ← Sprint name, agent count, connection dot
├── CommandBar.tsx           ← Text input → boss_message Socket.IO event
├── PixelOfficeBanner.tsx    ← Canvas 2D pixel office (960×290, zoom 1.3)
├── KanbanBoard.tsx          ← 4 columns (Backlog → In Progress → Review → Done)
│   └── TaskCard.tsx         ← Draggable card with priority, assignee, badges
├── ApprovalQueue.tsx        ← Grouped checkpoint + file change approvals
├── ActivityLog.tsx          ← Scrolling activity entries
├── GitGraph.tsx             ← SVG git-style lanes + savepoint diamonds
├── CodeDosimeter.tsx        ← SVG concentric ring gauge + stats + ticker
├── AgentModal.tsx           ← Agent details, chat, streaming output
├── EscalationModal.tsx      ← Escalation decision modal
└── FileChangeReview.tsx     ← Diff viewer with accept/reject
```

### Hooks

| Hook | Purpose |
|------|---------|
| `useAgents` | Fetch agents, listen for `agent_update`, normalize `avatar_color` → `color` |
| `useTasks` | Fetch tasks, listen for `task_update`, drag-drop via `move_task` event |
| `useActivity` | Activity log entries via `activity` event |
| `useBossChat` | Multi-turn Chief chat with session tracking, plan approval |
| `useAgentChat` | Direct chat with individual agents |
| `useCheckpoints` | Listen for `task_checkpoint`, `checkpoint_resolved` |
| `useFileChanges` | Listen for `file_change_pending`, `file_change_resolved` |
| `useApprovalQueue` | Groups checkpoints + file changes by task for unified review |
| `useEscalation` | Escalation tracking and response |
| `useSavepoints` | Fetch savepoints, listen for create/revert, emit revert events |

### Real-time Communication

All real-time state sync uses **Socket.IO** (via `python-socketio` backend + `socket.io-client` frontend).

**Client → Server events:**
`boss_message`, `move_task`, `checkpoint_response`, `file_change_response`, `escalation_response`, `pause_agent`, `reassign_task`, `cancel_task`, `approve_plan_ws`, `revert_savepoint`

**Server → Client events:**
`initial_state`, `agent_update`, `task_update`, `activity`, `task_checkpoint`, `checkpoint_resolved`, `file_change_pending`, `file_change_resolved`, `boss_chat_stream`, `boss_chat_complete`, `boss_plan`, `agent_chat_stream`, `agent_chat_complete`, `agent_route`, `escalation`, `savepoint_created`, `savepoint_reverted`

---

## Safety & Governance

### 4-Layer Safety Model

```
Layer 3: HUMAN        ← Approves checkpoints, accepts/rejects files, reverts savepoints
Layer 2: CHIEF        ← Delegates only, cannot execute code or commands
Layer 1: AGENTS       ← Execute within role boundaries + sandbox
Layer 0: SANDBOX      ← Path traversal protection, workspace isolation
```

### Checkpoint Gates

Agents call `report_task_completion` → creates a `Checkpoint` with `status=pending`. The task cannot advance until human approves:

- **Approve** → task moves to `next_status`, savepoint created
- **Request Changes** → agent re-invoked with feedback (`_rerun_agent_with_feedback`)
- **Pause** → task stays, agent goes idle

### File Staging

All agent file writes are queued as `PendingFileChange`:
- **Accept** → file stays on disk, savepoint created
- **Reject** → file reverted on disk (old content restored or new file deleted), agent re-invoked

### Escalation System

Agents can create escalations with severity levels (low/medium/high/critical). The UI shows a modal for the human to decide. The Chief can also escalate decisions.

### Revert Capability

Savepoints allow full state revert at any milestone. The revert confirmation modal warns about deleting future savepoints and shows exactly what will be lost.
