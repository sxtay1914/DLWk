# Real Filesystem Tools + OpenClaw Boss Integration

## Context
All agent tools are simulated — `write_code` stores in-memory, `run_command` returns fake output, `run_tests` parses agent-provided strings. Nothing touches disk. We need agents to work like Claude Code: real file I/O, real shell commands, real test execution. Users will see agent work in VS Code by opening the workspace directory. Additionally, we need to define OpenClaw custom skills so the Boss can be replaced with OpenClaw (API-only, no machine access).

---

## Part A: Filesystem Integration

### Files to Modify

| File | What Changes |
|------|-------------|
| `backend/ai_agents/tools.py` | Add workspace helpers, 4 new tools, modify 4 existing tools, update TeamContext |
| `backend/ai_agents/definitions.py` | Import new tools, update agent tool lists + instructions |
| `backend/ai_agents/runner.py` | Pass `workspace_root` to all TeamContext constructions |
| `backend/main.py` | Pass `workspace_root` in `_rerun_agent_with_feedback` and `_auto_chain_next_agent` |
| `backend/sdlc_store.py` | Add new tools to TOOL_TO_PHASE / TOOL_TO_ARTIFACT |
| `.gitignore` | Add `workspace/` |

### A1: Workspace Infrastructure (`tools.py`)

**Add imports** at top: `asyncio`, `os`, `pathlib.Path`

**Add `workspace_root: str | None = None`** field to `TeamContext` dataclass.

**Add two helpers** after TeamContext:
- `_resolve_workspace(ctx)` → returns `Path`, creates dir if needed. Checks `ctx.context.workspace_root`, then `WORKSPACE_ROOT` env var, defaults to `<project>/workspace`.
- `_safe_path(workspace, relative)` → resolves relative path, raises `ValueError` on traversal attacks. Strips leading slashes, `.resolve()`, checks prefix.

### A2: Modify Existing Tools (`tools.py`)

**`write_code`** — add real file write:
- After safety check: `target.parent.mkdir(parents=True)`, `target.write_text(code)`
- Keep existing artifact storage (powers dashboard code viewer)
- Return includes disk write status

**`run_command`** — real subprocess:
- Remove `expected_output` param, add `working_directory: str = ""` param
- `asyncio.create_subprocess_shell()` with `cwd=workspace`
- 120s timeout, truncate stdout/stderr at 8000 chars
- Return real exit code + output

**`run_tests`** — write test file + run real command:
- Remove `test_results` param (was faked), add `test_command: str = ""` param
- Write test file to disk, run `test_command` via subprocess
- Auto-infer: `.py` → `python -m pytest <file> -v`, `.ts/.js` → `npx jest <file> --verbose`
- Use exit code as pass/fail, keep artifact storage

**`get_task_code`** — disk-first with artifact fallback:
- For each artifact, try `_safe_path(workspace, art.filename).read_text()` first
- Fall back to in-memory `art.content` if file missing

### A3: Add New Tools (`tools.py`)

**`read_file(filepath)`** — read any workspace file. Path safety check, truncate at 15000 chars, handle binary files.

**`edit_file(filepath, old_text, new_text, description)`** — Claude Code-style targeted edit. Read file, verify `old_text` appears exactly once, replace, write back. Update in-memory artifact if exists. Emit SDLC event + activity.

**`list_directory(path, recursive)`** — list workspace contents. Optional recursive rglob, cap at 500 entries. Show sizes for non-recursive.

**`search_code(pattern, path, file_glob)`** — regex grep across files. Cap at 100 matches, `file:line: content` format, truncate lines at 200 chars.

### A4: Wire Tools into Agents (`definitions.py`)

**Imports:** add `read_file, edit_file, list_directory, search_code`

**Tool lists:**

| Agent | Add These Tools | Reason |
|-------|----------------|--------|
| Developer 1 | `read_file, edit_file, list_directory, search_code` | Full filesystem access for building |
| Developer 2 | `read_file, edit_file, list_directory, search_code` | Same |
| QA | `read_file, list_directory, search_code` | Can inspect code, NOT edit production code |
| Code Reviewer | `read_file, list_directory, search_code, run_command` | Can read + run linters, NOT write code |

**Instructions:** Update each agent's workflow steps to reference new tools:
- Devs: "Use `list_directory` and `search_code` to understand codebase. Use `read_file` to inspect files. Use `write_code` for new files, `edit_file` for targeted changes to existing files."
- CR: "Use `read_file` and `search_code` to inspect code. Run linters via `run_command('ruff check src/')` or `run_command('eslint src/')`."
- QA: "Use `read_file` to inspect the implementation before writing tests."

### A5: Propagate workspace_root

Every `TeamContext(...)` call needs `workspace_root=os.environ.get("WORKSPACE_ROOT")`:
- `runner.py`: `run_agent_task` (L29), `chat_with_boss` (L114), `chat_with_agent` (L198)
- `main.py`: `_rerun_agent_with_feedback` (L564), `_auto_chain_next_agent` (L640)
- `tools.py`: `run_agents_parallel` inner context (~L988) — inherit from parent ctx

### A6: SDLC Mappings (`sdlc_store.py`)

Add to `TOOL_TO_PHASE`: `read_file`, `edit_file`, `list_directory`, `search_code` → `SDLCPhase.BUILD`
Add to `TOOL_TO_ARTIFACT`: `edit_file` → `ArtifactType.CODE_FILE`

### A7: `.gitignore`

Add `workspace/` so agent-generated files don't get committed to the repo.

---

## Part B: OpenClaw Boss Skills

### Concept
OpenClaw runs as a separate process on the user's machine. Instead of giving it full machine access, we create **custom skills that only call our backend REST API**. OpenClaw becomes a thin orchestrator — authority but zero capability. This enforces the 4-layer safety model: Human > Boss (OpenClaw, API-only) > Agents (Codex, workspace-scoped) > Sandbox.

### Files to Create

```
openclaw-skills/
  boss-delegate/SKILL.md        — Send feature requests to the team
  boss-check-status/SKILL.md    — Check task/sprint status
  boss-approve/SKILL.md         — Approve/reject checkpoints and gates
  boss-escalation/SKILL.md      — Handle escalations
  README.md                     — Setup instructions
```

### Skill: `boss-delegate`
```yaml
---
name: boss-delegate
description: Delegate a feature request or task to the AI dev team
---
```
Instructions tell OpenClaw to:
1. Clarify the user's request (ask 2-3 questions if needed)
2. `curl -X POST http://localhost:8000/api/chat/boss -H 'Content-Type: application/json' -d '{"content": "<request>"}'`
3. Poll or listen for `boss_chat_complete` response
4. Present the plan to the user, get approval
5. `curl -X POST http://localhost:8000/api/chat/boss/approve-plan -d '{"session_id": "<id>"}'`

### Skill: `boss-check-status`
```yaml
---
name: boss-check-status
description: Check the current status of tasks, agents, and sprint progress
---
```
Instructions: call `GET /api/tasks`, `GET /api/agents`, `GET /api/sprint`, `GET /api/sdlc/phases` and format a summary.

### Skill: `boss-approve`
```yaml
---
name: boss-approve
description: Approve or reject an agent checkpoint or SDLC gate
---
```
Instructions: call `GET /api/tasks` to find pending items, then `POST /api/checkpoints/{id}/decide` or `POST /api/sdlc/gates/{id}/decide` for gate decisions.

### Skill: `boss-escalation`
```yaml
---
name: boss-escalation
description: Review and resolve escalations from the team
---
```
Instructions: call `GET /api/escalations`, present unresolved ones, resolve via the API.

### Security: What OpenClaw CAN'T do
- No `filesystem` permission — can't read/write files on the machine
- No `browser` permission — can't navigate websites
- No arbitrary shell commands — skills only use `curl` to our localhost API
- All execution happens inside the Codex agent sandbox (workspace directory)

### Backend additions for OpenClaw
We need one new REST endpoint so OpenClaw can approve checkpoints without Socket.IO:

**`POST /api/checkpoints/{checkpoint_id}/decide`** in `main.py`:
```python
class CheckpointDecision(BaseModel):
    action: str    # "approve" | "request_changes" | "pause"
    feedback: str = ""
```
This mirrors the existing `checkpoint_response` Socket.IO handler but as REST.

---

## Implementation Order

1. `tools.py` — TeamContext field + workspace helpers (5 min)
2. `tools.py` — 4 new tools: `read_file`, `edit_file`, `list_directory`, `search_code` (20 min)
3. `tools.py` — modify `write_code`, `run_command`, `run_tests`, `get_task_code` (20 min)
4. `definitions.py` — imports, tool lists, instruction updates (15 min)
5. `runner.py` + `main.py` — workspace_root propagation (5 min)
6. `sdlc_store.py` — TOOL_TO_PHASE / TOOL_TO_ARTIFACT mappings (2 min)
7. `.gitignore` — add workspace/ (1 min)
8. `main.py` — new checkpoint REST endpoint for OpenClaw (5 min)
9. `openclaw-skills/` — 4 skill SKILL.md files + README (15 min)

---

## Verification
1. Start backend, send a feature request, approve plan
2. Check `workspace/` — real files should appear as devs write code
3. Open `workspace/` in VS Code — see files appear in real-time
4. `run_command` output should be real (e.g., `ls` shows actual directory contents)
5. Approve dev checkpoint → CR auto-starts, reads actual files
6. QA writes + runs real tests
7. Test OpenClaw skills: install skills, send a feature request via OpenClaw chat, verify it hits the API

---

## Part C: Memory Architecture Hardening

### Context
Agent memory works for chat mode (each agent recalls on conversation start) but workflow-mode agents (the actual pipeline) start fresh every run. Memory should carry across pipeline runs so agents learn and improve. Boss memory management tools exist but there's no auto-pruning or disk persistence.

### Files to Modify

| File | What Changes |
|------|-------------|
| `backend/ai_agents/definitions.py` | Add `recall_memory` to workflow instructions for all specialist agents + Boss |
| `backend/ai_agents/runner.py` | Inject memory into `run_agent_task` prompt |
| `backend/models.py` | (no change — `memory: list[str]` already exists) |
| `backend/state.py` | Add `save_state()` / `load_state()` for disk persistence of agent memory |
| `backend/main.py` | Call `load_state()` on startup, `save_state()` on memory mutations |
| `backend/ai_agents/tools.py` | Deduplicate on `save_memory`, trigger disk save after writes |

### C1: Workflow Memory Recall (`definitions.py`)

Add `recall_memory` call as Step 0 in every workflow agent's instructions:

**Developer 1 & 2** — insert before step 1:
> "0. Call recall_memory to check your notes from previous tasks. Use this context to avoid repeating mistakes and build on what you've learned.\n"

**QA** — insert before step 1:
> "0. Call recall_memory to review your previous test findings and known issues.\n"

**Code Reviewer** — insert before step 1:
> "0. Call recall_memory to review patterns and issues you've flagged before.\n"

**PM** — insert before step 1:
> "0. Call recall_memory to review previous project decisions and user preferences.\n"

**Scrum Master** — insert before step 1:
> "0. Call recall_memory to review team velocity and assignment patterns.\n"

**Boss** — insert at start of PHASE 1: CLARIFY:
> "Before anything else, call recall_memory to review previous decisions, user preferences, and project context.\n"

Also add `recall_memory` to PM and SM tool lists (they currently lack it in workflow mode — PM has it, SM does not).

### C2: Memory Injection in `run_agent_task` (`runner.py`)

In `run_agent_task`, before calling `Runner.run_streamed`, inject agent memory into the prompt:
```python
agent_data = state.agents.get("agent-boss")
memory_ctx = ""
if agent_data and agent_data.memory:
    memory_lines = "\n".join(f"- {m}" for m in agent_data.memory)
    memory_ctx = f"\n\nYour persistent memory:\n{memory_lines}\n"
user_message = user_message + memory_ctx
```

### C3: Memory Deduplication (`tools.py`)

In `save_memory`, before appending, check for duplicates:
```python
# Skip exact duplicates
if entry in agent.memory:
    return f"Already in memory: {entry}"
# Skip near-duplicates (same first 50 chars)
for existing in agent.memory:
    if existing[:50] == entry[:50]:
        # Replace the old entry with the updated one
        agent.memory.remove(existing)
        break
agent.memory.append(entry)
```

### C4: Disk Persistence (`state.py`)

Add methods to save/load agent memory to a JSON file:

**`save_memory_to_disk()`** — writes `{agent_id: [memory_entries]}` to `backend/agent_memory.json`
**`load_memory_from_disk()`** — reads on startup, populates `agent.memory` lists

Call `save_memory_to_disk()` after every `save_memory`, `flush_agent_memory`, and `summarize_and_flush_memory` tool call.
Call `load_memory_from_disk()` in `StateManager.__init__` after `_init_agents_only()`.

### C5: Auto-Pruning Suggestion to Boss

When any agent's memory reaches 40+ entries, emit an activity log:
> "⚠ {agent.name}'s memory is at {count}/50 entries. Consider using summarize_and_flush_memory to compress."

This nudges the Boss (or human) to manage memory without enforcing auto-deletion.

---

### Implementation Order

1. `definitions.py` — Add recall_memory to all workflow instructions (10 min)
2. `runner.py` — Inject memory into `run_agent_task` (5 min)
3. `tools.py` — Deduplication in `save_memory` (5 min)
4. `state.py` — `save_memory_to_disk` / `load_memory_from_disk` (10 min)
5. `main.py` — Hook disk persistence into startup (2 min)
6. `tools.py` — Auto-pruning warning at 40 entries (5 min)

---

## Part D: Claude Code-Style Developer Experience

### Context
Developers currently `write_code` for everything — even when a file already exists. They need real "dev sense": read before writing, edit existing files, never blindly overwrite. They also need a shared project memory file (`PROJ_MEM.md`) that lives in the workspace — like `CLAUDE.md` but for the AI team. Every file change should go through a human approval flow (staged → review → accept/reject) similar to Claude Code's diff view, and the frontend should show inline diffs with accept/reject buttons.

### Files to Modify

| File | What Changes |
|------|-------------|
| `backend/ai_agents/tools.py` | Smart `write_code` (check-before-write), `read_proj_memory` / `update_proj_memory` tools, staged file change system |
| `backend/ai_agents/definitions.py` | Dev instructions overhaul (read-first workflow), PROJ_MEM.md integration |
| `backend/state.py` | `pending_file_changes` dict for staging area |
| `backend/main.py` | REST + Socket.IO endpoints for file change approval |
| `frontend/src/hooks/useFileChanges.ts` | New hook for staged file changes |
| `frontend/src/components/FileChangeReview.tsx` | Diff viewer with accept/reject |

### D1: Smart Write — Check Before You Write (`tools.py`)

Modify `write_code` to check if the file already exists:
```python
workspace = _resolve_workspace(ctx)
target = _safe_path(workspace, filename)
if target.exists():
    return (
        f"File {filename} already exists ({target.stat().st_size} bytes). "
        f"Use read_file to inspect it, then edit_file for targeted changes. "
        f"Only use write_code for NEW files."
    )
```
This forces devs to use `read_file` → `edit_file` for existing files. They can only `write_code` new files.

### D2: PROJ_MEM.md — Shared Project Memory (`tools.py`)

Two new tools:

**`read_proj_memory()`** — reads `PROJ_MEM.md` from workspace root. Returns contents or "No project memory yet" if missing.

**`update_proj_memory(section, content)`** — appends or updates a section in `PROJ_MEM.md`:
- Sections: `architecture`, `decisions`, `patterns`, `dependencies`, `gotchas`, `todo`
- If section header exists, replace its content. If not, append new section.
- Format:
  ```markdown
  ## Architecture
  - Next.js app with TypeScript
  - Calculator logic in src/lib/calc.ts

  ## Decisions
  - Using integer-only evaluation (no eval())
  - Jest for testing with ts-jest

  ## Patterns
  - All components in src/components/
  - Tests mirror src/ structure in tests/

  ## Dependencies
  - next, react, react-dom, typescript
  - jest, ts-jest, @testing-library/react

  ## Gotchas
  - npm install times out at 120s — run with --prefer-offline if cached

  ## Todo
  - Add keyboard input support
  - Add history/memory display
  ```

Devs MUST call `read_proj_memory` at the start of every task and `update_proj_memory` after completing work.

### D3: Developer Instructions Overhaul (`definitions.py`)

Replace the dev workflow with a read-first, edit-smart approach:

**New Developer Workflow:**
```
1. Call update_agent_status
2. Call read_proj_memory to understand the project context
3. Call list_directory to see what exists
4. Call read_file on files you'll modify — understand before changing
5. For EXISTING files: use edit_file with precise old_text/new_text
   For NEW files only: use write_code
   NEVER use write_code on a file that already exists
6. Call run_command for installs, builds, linting
7. Call update_proj_memory with any decisions, patterns, or gotchas
8. Call log_activity with self-review
9. Call report_task_completion
10. Call update_agent_status idle
```

Both devs get `read_proj_memory` and `update_proj_memory` in their tool lists. QA and CR get `read_proj_memory` (read-only).

### D4: Staged File Changes — Approval Flow (`tools.py`, `state.py`)

Instead of writing directly to disk, `write_code` and `edit_file` write to a **staging area**. The human reviews and approves each change.

**State changes** (`state.py`):
```python
@dataclass
class PendingFileChange:
    id: str
    agent_id: str
    agent_name: str
    filename: str
    change_type: str          # "create" | "edit"
    old_content: str | None   # None for new files
    new_content: str
    description: str
    status: str = "pending"   # "pending" | "approved" | "rejected"

class StateManager:
    pending_file_changes: dict[str, PendingFileChange] = {}
```

**Modified `write_code`**:
- Still writes to disk immediately (so agents can build on each other's work)
- BUT also creates a `PendingFileChange` and emits `file_change_pending` via Socket.IO
- Frontend shows the diff for review

**Modified `edit_file`**:
- Captures `old_content` before edit, `new_content` after
- Writes to disk immediately
- Creates `PendingFileChange` with both versions for diff display

**Rejection flow**:
- If user rejects a change, restore `old_content` to disk
- Emit `file_change_rejected` — agent sees this in activity log

### D5: REST + Socket.IO Endpoints (`main.py`)

**REST:**
- `GET /api/file-changes` — list all pending changes
- `POST /api/file-changes/{id}/decide` — `{"action": "approve"|"reject", "feedback": ""}`

**Socket.IO events:**
- `file_change_pending` — emitted when agent writes/edits a file
- `file_change_resolved` — emitted on approve/reject

### D6: Frontend — Diff Viewer (`FileChangeReview.tsx`)

A component that:
- Listens for `file_change_pending` events
- Shows a modal/panel with:
  - Filename, agent name, description
  - Side-by-side or unified diff (old vs new content)
  - Accept / Reject buttons
  - Optional feedback text on reject
- On accept: `POST /api/file-changes/{id}/decide` with `approve`
- On reject: `POST /api/file-changes/{id}/decide` with `reject` + feedback
- Rejected changes trigger agent re-work (like checkpoint changes_requested flow)

---

### Implementation Order

1. `tools.py` — Smart `write_code` check-before-write (5 min)
2. `tools.py` — `read_proj_memory` / `update_proj_memory` tools (15 min)
3. `definitions.py` — Dev instructions overhaul + tool lists (10 min)
4. `state.py` — `PendingFileChange` model + state methods (10 min)
5. `tools.py` — Stage changes in `write_code` / `edit_file` (15 min)
6. `main.py` — File change REST + Socket.IO endpoints (10 min)
7. `frontend` — `useFileChanges` hook + `FileChangeReview` component (20 min)
