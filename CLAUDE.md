# AI-Governed Dev Team - Hackathon Project

## What This Is

An autonomous AI software engineering team powered by OpenAI Codex Agents SDK, orchestrated by an OpenClaw "Boss" agent, visualized as an interactive pixel art office with a real scrum dashboard. Agents write real code, run real commands, and stage file changes for human review.

## Problem Statement

> Build a safe, human-governed system that maximises the leverage of Codex as an AI coding agent to support enterprise software teams across any stage of the SDLC.

## Architecture

```
HUMAN → THE BOSS (orchestrator, can only delegate) → CODEX AGENTS (can execute)
```

- **Boss (Codex, soon OpenClaw)**: Authority but no capability. Delegates to PM/SM, prioritizes, escalates. Cannot write code or run commands.
- **6 Codex Agents**: PM, Scrum Master, Developer 1, Developer 2, QA, Code Reviewer. Each has execution capability within sandbox.
- **4-layer safety model**: Human > Boss > Agents > Sandbox.
- **Checkpoint gates**: Agents report completion → human must approve before task advances.
- **File staging**: Agents write code → changes appear in diff viewer → human accepts/rejects.

## Agent Pipeline

```
User message → Boss (thinking → meeting → working → idle)
  → delegate_to_pm → PM breaks down into JSON task plan
  → delegate_to_scrum_master → SM publishes tasks, assigns agents
  → run_agents_parallel → Dev1, Dev2, QA, CR run concurrently
  → Each agent calls report_task_completion → checkpoint for human
  → Human approves → task advances (in_progress → review → testing → done)
```

## Project Structure

```
/frontend              - Next.js 16 + TypeScript + Tailwind CSS v4
  /src/app             - App router (page.tsx, layout.tsx, globals.css)
  /src/components/
    Header.tsx         - Top bar with sprint name, agent count, connection status
    CommandBar.tsx     - Text input for sending requests to The Boss
    PixelOfficeBanner.tsx - Canvas-based pixel art office (2 rooms, 7 agents, walk/idle/typing)
    KanbanBoard.tsx    - 5-column sprint board (Backlog → In Progress → Review → Testing → Done)
    TaskCard.tsx       - Draggable task card (priority, assignee, story points, review badge)
    AgentModal.tsx     - Agent details, chat, checkpoint approval, streaming output
    EscalationModal.tsx - Modal for escalation decisions
    ActivityLog.tsx    - Chronological team activity log
    GitGraph.tsx       - Git-style graph visualization of agent activity lanes
    FileChangeReview.tsx - Diff viewer with accept/reject for staged file changes
    ThemeProvider.tsx   - Light/dark mode toggle
  /src/hooks/
    useAgents.ts       - Fetch/manage 7 agents; normalize avatar_color → color
    useTasks.ts        - Fetch/manage tasks; group by status; drag-drop via WebSocket
    useActivity.ts     - Activity log entries via Socket.IO
    useEscalation.ts   - Escalation tracking and responses
    useBossChat.ts     - Multi-turn Boss chat with session, plan preview, approval
    useCheckpoints.ts  - Task checkpoint approval gates
    useFileChanges.ts  - Staged file change approval workflow
  /src/lib/
    types.ts           - All TypeScript interfaces and enums
    socket.ts          - Socket.IO client singleton
    mockData.ts        - Fallback data when backend is offline

/backend               - Python FastAPI + Socket.IO
  main.py              - FastAPI app: 17 REST endpoints + 20+ Socket.IO events
  models.py            - Pydantic v2 models (Agent, Task, Sprint, Checkpoint, PendingFileChange, etc.)
  state.py             - In-memory state manager (agents, tasks, checkpoints, file changes)
  conversation.py      - Multi-turn Boss chat session management (clarify → plan → execute)
  simulation.py        - Background simulation (currently disabled, real agents used instead)
  /ai_agents/
    definitions.py     - 7 agent definitions with tools, instructions, delegation wrappers
    tools.py           - 30+ function tools (workspace I/O, task mgmt, execution, memory)
    runner.py          - Agent execution: streaming, Boss chat, direct agent chat
  venv/                - Python virtual environment

/openclaw-skills/      - OpenClaw Boss skill definitions (Phase 2)
  boss-delegate/       - Delegate feature requests to team
  boss-check-status/   - Check sprint/task status
  boss-approve/        - Approve/reject checkpoints
  boss-escalation/     - Handle escalations
```

## Running

```bash
# Backend (terminal 1)
cd backend && source venv/bin/activate && python main.py
# Runs on http://localhost:8000

# Frontend (terminal 2)
cd frontend && npm run dev
# Runs on http://localhost:3000
```

Frontend falls back to mock data if backend is not running.

## Key Design Decisions

- **Light theme by default** - Clean, professional scrum board look (Jira/Linear style), dark mode supported
- **Pixel office banner** - Canvas-based with MetroCity sprite sheets (32px frames, 6 outfits, 7 hair styles, 3 skin tones)
- **Scrum dashboard** - Real functional board. Agents create/move tasks. Cards have ticket IDs, story points, priority icons, assignee avatars.
- **Review column glows red** - Tasks needing review get red border, "Needs Review" badge, pulsing dot
- **Checkpoint approval flow** - Clicking any Review/Testing task opens agent modal with Approve/Request Changes buttons
- **File change staging** - Agents write code → changes queued → diff viewer with accept/reject
- **Git graph** - Activity log visualization showing agent lanes, handoffs, and parallel execution
- **Agent movement** - Agents walk to desk when working/thinking/meeting, walk to lounge when idle
- **Boss lifecycle** - Starts idle in lounge → thinking on message → meeting during delegation → working while coordinating → idle when done
- **Task drag affects agents** - Moving tasks on board updates agent status (e.g., drag to Review → CR starts thinking)

## Agents

| Agent | ID | Model | Role |
|-------|-----|-------|------|
| The Boss | `agent-boss` | gpt-5-mini | Orchestrator. Delegates to PM/SM. Cannot execute. |
| Project Manager | `agent-pm` | gpt-4.1-mini | Breaks requirements into JSON task plans. |
| Scrum Master | `agent-sm` | gpt-4.1-mini | Publishes tasks, assigns agents, kicks off parallel execution. |
| Developer 1 | `agent-dev` | gpt-5-mini | Full-stack engineer. Reads/writes/edits files, runs commands. |
| Developer 2 | `agent-dev2` | gpt-5-mini | Backend engineer. Same tools as Dev 1. |
| QA Engineer | `agent-qa` | gpt-5-mini | Writes and runs tests. Reports bugs. |
| Code Reviewer | `agent-cr` | gpt-5-mini | Reviews code for correctness, security, performance. |

## Agent Colors

- Boss: `#F59E0B` (gold/amber)
- PM: `#3B82F6` (blue)
- Scrum Master: `#14B8A6` (teal)
- Developer: `#22C55E` (green)
- QA: `#F97316` (orange)
- Code Reviewer: `#8B5CF6` (purple)

## Tech Stack

- Frontend: Next.js 16, React 19, Tailwind CSS v4, Socket.IO client
- Backend: Python 3.12, FastAPI, python-socketio, Pydantic v2, uvicorn
- Agent orchestration: OpenAI Codex Agents SDK (Python)
- Pixel engine: Canvas 2D with MetroCity sprite sheets (no Phaser runtime)

## Pixel Office Engine

Uses MetroCity sprite sheets loaded at runtime from `/public/MetroCity/`.

- **Sprites**: 32px frames, 6 directions × 6 frames per direction. Outfits, hair, and skin layers composited.
- **Layout**: Main office (cols 1–21, desks at row 3) + Boss corner office (cols 22–29, carpet floor) + lounge (rows 7–8)
- **Short name tags**: Dev1, Dev2, SM, CR (long names overflow at 7px font)
- **Movement**: `isActiveStatus()` checks working/thinking/meeting → walk to desk. Idle → walk to lounge.
- **Canvas config**: 960×290px, zoom 1.3, camera centered at col 14 / row 5
- **Interactions**: hover = bounce + tooltip with full name, click = open agent modal

## API Endpoints

### REST
- `GET /api/agents` — List all agents
- `GET/POST /api/tasks` — List/create tasks
- `PATCH/DELETE /api/tasks/{id}` — Update/delete task
- `GET/POST /api/sprint` — Get/create sprint
- `GET /api/activity` — Activity log
- `GET /api/escalations` — Escalations
- `POST /api/chat/boss` — Send message to Boss
- `POST /api/chat/boss/approve-plan` — Approve Boss plan
- `POST /api/chat/{agent_id}` — Chat with specific agent
- `GET /api/checkpoints` — Pending checkpoints
- `POST /api/checkpoints/{id}/decide` — Resolve checkpoint
- `GET /api/file-changes` — Pending file changes
- `POST /api/file-changes/{id}/decide` — Resolve file change

### Socket.IO Events
- **Client → Server**: `boss_message`, `move_task`, `checkpoint_response`, `file_change_response`, `escalation_response`, `pause_agent`, `reassign_task`, `cancel_task`, `approve_plan_ws`
- **Server → Client**: `initial_state`, `agent_update`, `task_update`, `activity`, `task_checkpoint`, `checkpoint_resolved`, `file_change_pending`, `file_change_resolved`, `boss_chat_stream`, `boss_chat_complete`, `boss_plan`, `agent_chat_stream`, `agent_chat_complete`, `agent_route`, `escalation`

## Important Notes

- Backend uses `avatar_color` field; frontend normalizes to `color` in useAgents hook
- Boss starts idle, goes thinking→meeting→working→idle during orchestration
- Agents set their own status to idle at end of workflow (no forced reset)
- PM and SM call `report_task_completion` to create checkpoints (red notification bubbles)
- Task drag-and-drop updates assigned agent status in backend (`move_task` socket event)
- Synthetic checkpoints are created for Review/Testing tasks that lack a real checkpoint
- `workspace_root` is set by Boss via `set_workspace` tool; persisted in state
- Agent memory is in-memory only (lost on restart)
- GitHub repo: https://github.com/Samrath-dev/DLWk.git
