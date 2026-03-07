# Project Spec: AI-Governed Dev Team with Human Oversight

## Problem Statement

> Build a safe, human-governed system that maximises the leverage of Codex as an AI coding agent to support enterprise software teams across any stage of the software development lifecycle (SDLC), including design, development, deployment, incident response, communication, or governance.

---

## Core Concept

A **fully autonomous AI software engineering team** powered by Codex Agents SDK, orchestrated by a "Chief" agent, visualized as an **interactive pixel art office** where the human can watch the team work and step in when needed.

---

## The Governance Hierarchy

```
         ┌──────────┐
         │  HUMAN   │  ← Interactive pixel workstation
         └────┬─────┘
              │ steers, overrides, approves
              ▼
     ┌────────────────┐
     │  THE CHIEF     │  ← Codex orchestrator agent
     │                │     Can ONLY: delegate, prioritize,
     │                │     monitor, escalate, communicate
     │                │     CANNOT: write code, run commands,
     │                │     touch files, access shell
     └───────┬────────┘
             │ assigns, reprioritizes, reviews decisions
             ▼
  ┌──────────────────────────────────┐
  │        CODEX AGENTS              │
  │                                  │
  │  PM ─ Scrum Master ─ Dev1/Dev2  │  ← Can execute:
  │       QA Tester ─ Code Reviewer │     shell, files, tests,
  │                                  │     builds, deploys
  └──────────────────────────────────┘
```

---

## The Agents

| Agent | Model | Role |
|-------|-------|------|
| **The Chief** | gpt-5-mini | Orchestrator. Delegates to PM/SM. Cannot execute code or commands. |
| **Project Manager** | gpt-4.1-mini | Breaks down requirements into structured JSON task plans with SDLC metadata. |
| **Scrum Master** | gpt-4.1-mini | Publishes tasks, assigns to agents, kicks off parallel execution. |
| **Developer 1** | gpt-5-mini | Full-stack engineer. Reads/writes/edits files, runs commands. |
| **Developer 2** | gpt-5-mini | Backend engineer. Same tools as Dev 1. |
| **QA Engineer** | gpt-5-mini | Writes and runs tests. Reports bugs via checkpoints. |
| **Code Reviewer** | gpt-5-mini | Reviews code for correctness, security, performance. |

---

## The Safety Model

```
Level 3: HUMAN           → Can override anything, approve/reject all changes
Level 2: THE CHIEF       → Can direct agents, cannot execute
Level 1: CODEX AGENTS    → Can execute, only within sandbox + assigned scope
Level 0: SANDBOX         → Codex's built-in filesystem/network restrictions
```

Four layers of safety. Each layer can only be overridden by the layer above. All actions, hand-offs, and escalations are logged for audit.

### Safety Mechanisms
- **Checkpoint gates**: Agents must call `report_task_completion` → human approves before task advances
- **File staging**: All code writes are queued as pending changes → human reviews diffs → accepts or rejects
- **Escalation system**: Agents can escalate decisions with severity levels (low/medium/high/critical)
- **Savepoint system**: Auto-snapshots at milestones allow full state revert including workspace files

---

## Full SDLC Coverage

| SDLC Stage | Who handles it | How |
|------------|---------------|-----|
| **Design** | PM Agent | Writes structured task plans with SDLC metadata, definition of done, risk tags |
| **Planning** | Scrum Master Agent | Creates sprints, assigns tasks to agents, manages dependencies |
| **Development** | Dev 1 + Dev 2 Agents | Write code, create/edit files, run builds via shell (parallel execution) |
| **Code Review** | Code Reviewer Agent | Reviews code for correctness, security, performance issues |
| **Testing** | QA Agent | Runs unit tests, integration tests, reports bugs |
| **Governance** | Chief + Human | Chief enforces process. Human has final say. Full audit trail via activity log + savepoints |

---

## Interactive Pixel Workstation

### Office Layout
- **Corner office** → The Chief. Bigger desk area (cols 22–29, carpet floor).
- **Open floor** → 6 Codex agent sprites at desks (cols 1–21, desks at row 3).
- **Lounge area** → Agents walk here when idle (rows 7–8).
- **Scrum board** → Real-time kanban dashboard below the pixel office.

### Agent Sprite Behaviors
- **Working/Thinking/Meeting** → Agent walks to their desk, typing animation
- **Idle** → Agent walks to lounge area
- **Hover** → Bounce animation + tooltip with full name
- **Click** → Opens agent modal with chat, status, checkpoint approval

### Human Interactions
1. **Command Bar** → Type requests to The Chief
2. **Click an agent** → See their work, chat directly, approve checkpoints
3. **Drag tasks on kanban** → Override task status, agent reacts
4. **Approve/reject escalations** → Chief flags risky decisions
5. **Review file changes** → Diff viewer with accept/reject per file
6. **Revert savepoints** → Click diamond on git graph to restore previous state

---

## Key Features

### Code Dosimeter
SVG concentric ring gauge showing three code health metrics:
- **Readability** (40% weight) — baseline 75, boosted by file acceptance rate and CR sentiment
- **Stability** (35% weight) — baseline 95, reduced by P0 tasks, stuck reviews, error activities
- **CR Confidence** (25% weight) — baseline 50, boosted by review entries and approvals

Overall score mapped to status: OPTIMAL (≥70) / MODERATE (≥50) / CAUTION (≥30) / CRITICAL (<30)

Includes: animated score transitions, sparkline trends, team utilization shimmer bar, scrolling ticker.

### Savepoint System
Auto-created at fixed milestones:
- Sprint started (first task published)
- Checkpoint approved
- File change accepted

Each savepoint stores full state JSON + workspace directory copy. Reverting restores everything and deletes future savepoints. Displayed as amber diamond markers on the Git Graph.

### Git Graph
Activity log visualization showing:
- Per-agent color-coded lanes with vertical/diagonal connections
- Dot markers for each activity entry
- Diamond markers for savepoints (clickable → revert modal)
- Scrollable, contained within 500px max height

---

## Tech Stack

| Layer | Tech |
|-------|------|
| The Chief | Codex Agents SDK (gpt-5-mini, orchestration-only tools) |
| Worker Agents | Codex Agents SDK (Python) with full execution tools |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, Socket.IO client |
| Pixel Engine | Canvas 2D with MetroCity sprite sheets (32px frames) |
| Backend | Python 3.12, FastAPI, python-socketio, Pydantic v2, uvicorn |
| Real-time | Socket.IO (agent state + activity + savepoints → frontend) |
| Audit Log | In-memory activity log + savepoint snapshots to disk |

---

## Demo Flow

1. User inputs: "Build me a todo app with user authentication."
2. Chief sprite starts thinking → delegates to PM.
3. PM writes structured task plan with SDLC metadata, risk tags, definitions of done.
4. Chief delegates to Scrum Master. SM publishes tasks, assigns agents.
5. Sprint board populates. Dev1 and Dev2 start coding in parallel. QA prepares tests. CR watches.
6. Savepoint auto-created: "Sprint started — tasks published"
7. Dev finishes a module → calls `report_task_completion` → checkpoint appears for human review.
8. Human approves → task advances. Savepoint auto-created.
9. Code Reviewer flags an issue → checkpoint with feedback. Human reviews.
10. QA runs tests, reports results. File changes staged for human review.
11. Human accepts files → savepoint created. Code Dosimeter updates with health metrics.
12. All tasks done. Git Graph shows full execution history with savepoint diamonds.
13. If something goes wrong → click a savepoint → revert everything to that state.
