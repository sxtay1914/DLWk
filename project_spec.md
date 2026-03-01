# Project Spec: AI-Governed Dev Team with Human Oversight

## Problem Statement

> Build a safe, human-governed system that maximises the leverage of Codex as an AI coding agent to support enterprise software teams across any stage of the software development lifecycle (SDLC), including design, development, deployment, incident response, communication, or governance.

---

## Core Concept

A **fully autonomous AI software engineering team** powered by Codex Agents SDK, orchestrated by an OpenClaw "Boss" agent, visualized as an **interactive pixel art office** where the human can watch the team work and step in when needed.

---

## The Governance Hierarchy

```
         ┌──────────┐
         │  HUMAN   │  ← Interactive pixel workstation
         └────┬─────┘
              │ steers, overrides, approves
              ▼
     ┌────────────────┐
     │  THE BOSS      │  ← OpenClaw (6th sprite)
     │  (OpenClaw)    │     Can ONLY: delegate, prioritize,
     │                │     monitor, escalate, communicate
     │                │     CANNOT: write code, run commands,
     │                │     touch files, access shell
     └───────┬────────┘
             │ assigns, reprioritizes, reviews decisions
             ▼
  ┌──────────────────────────────────┐
  │        CODEX AGENTS              │
  │                                  │
  │  PM ─ Scrum Master ─ Developer  │  ← Can execute:
  │       QA Tester ─ Code Reviewer │     shell, files, tests,
  │                                  │     builds, deploys
  └──────────────────────────────────┘
```

---

## The Agents

Each agent is a Codex agent with a specialized role, system prompt, and skills. They communicate via the Agents SDK hand-off system.

| Agent | Role | What it does (native Codex) |
|-------|------|-----------------------------|
| **Product Manager** | Breaks down requirements into tasks, writes specs | Reads input, generates task breakdowns, writes PRD files, uses web search for research |
| **Scrum Master** | Assigns tasks, manages sprint flow, unblocks agents | Orchestrates hand-offs between agents, tracks task state, gates progress |
| **Developer** | Writes code | Writes files to disk, runs shell commands (npm, pip, git, etc.), builds features |
| **QA Tester** | Tests the code | Runs test suites via shell (jest, pytest), writes test files, can run Playwright for E2E |
| **Code Reviewer** | Reviews PRs, checks quality | Reads code files, runs linters via shell (eslint, flake8), approves or requests changes |

---

## The Boss (OpenClaw)

OpenClaw runs locally with persistent memory. Its tool access is **restricted** to orchestration only.

### Can Do
- Read agent status and output
- Assign/reassign tasks to agents
- Reprioritize the sprint backlog
- Escalate decisions to the human
- Summarize progress reports
- Resolve conflicts between agents (e.g., Dev and Reviewer disagree)
- Post updates to Slack/comms channels

### Cannot Do
- Write code
- Run shell commands
- Access the filesystem
- Deploy anything
- Modify agent configs
- Bypass human-set guardrails
- Approve its own decisions on critical paths

---

## The Safety Model

```
Level 3: HUMAN           → Can override anything
Level 2: THE BOSS        → Can direct agents, cannot execute
Level 1: CODEX AGENTS    → Can execute, only within sandbox + assigned scope
Level 0: SANDBOX         → Codex's built-in filesystem/network restrictions
```

Four layers of safety. Each layer can only be overridden by the layer above. All actions, hand-offs, and escalations are logged for audit.

---

## Full SDLC Coverage

| SDLC Stage | Who handles it | How |
|------------|---------------|-----|
| **Design** | PM Agent | Writes PRDs, specs, wireframes. Boss reviews and prioritizes. |
| **Planning** | Scrum Master Agent | Creates sprints, assigns tasks. Boss can override priorities. |
| **Development** | Dev Agent | Writes code, creates files, runs builds via shell. |
| **Code Review** | Code Reviewer Agent | Reads diffs, runs linters, approves/rejects. |
| **Testing** | QA Agent | Runs unit tests, integration tests, E2E via Playwright. |
| **Deployment** | Dev Agent (on Boss's command) | Runs deploy scripts. Boss must approve, Human must approve for prod. |
| **Incident Response** | Boss escalates → QA + Dev investigate | Boss detects failures, routes to right agent, escalates to human if critical. |
| **Communication** | Boss (OpenClaw) | Posts sprint updates to Slack/messaging. Summarizes progress. |
| **Governance** | Boss + Human | Boss enforces process. Human has final say. Full audit trail. |

---

## Interactive Pixel Workstation

### Office Layout
- **Corner office** → The Boss (OpenClaw). Bigger desk, monitors showing all agents' work.
- **Open floor** → 5 Codex agent sprites at their desks.
- **Scrum board on the wall** → real-time kanban.
- **Human's presence** → cursor/avatar floating above, god-mode.

### Boss Sprite Behaviors
- Walks between desks checking on agents
- Stands at the scrum board rearranging tasks
- Calls agents into the "meeting room" (conflict resolution)
- Sits at desk writing status reports
- Looks up at the human when a decision needs escalation
- **Red phone on desk** → lights up when Boss needs human input

### Agent Sprite States
- **PM** → at whiteboard sketching specs
- **Scrum Master** → walking between desks, pointing at board
- **Developer** → typing at desk, coffee when idle
- **QA** → running tests (treadmill animation), red/green indicator
- **Code Reviewer** → reading at desk, red pen in hand

### Human Interactions
1. **Click The Boss** → chat directly, give high-level direction
2. **Click an agent** → see their work, Boss mediates changes
3. **Override The Boss** → drag a task yourself, bypassing Boss
4. **Approve/reject escalations** → Boss flags risky decisions via red phone

---

## Tech Stack

| Layer | Tech |
|-------|------|
| The Boss | OpenClaw (restricted skills — messaging + agent orchestration only) |
| Worker Agents | Codex Agents SDK (Python) with MCP |
| Agent Orchestration | Agents SDK hand-offs, Boss routes via OpenClaw skill calls |
| Pixel Workstation | Phaser.js / PixiJS (canvas) |
| Scrum Dashboard | React / Next.js |
| Real-time | WebSocket (agent state + Boss state → frontend) |
| Comms | OpenClaw's native Slack/messaging integration |
| Audit Log | Execution traces → stored, displayed on dashboard |

---

## Demo Flow

1. User inputs: "Build me a todo app with user authentication."
2. Boss sprite stands up, walks to whiteboard, thinks. Assigns PM to break it down.
3. PM writes specs. Boss reviews, approves, hands to Scrum Master.
4. Sprint board populates. Dev starts coding. Code Reviewer watches. QA prepares test plans.
5. Dev finishes a module. Code Reviewer flags an SQL injection risk. They disagree.
6. Boss calls them into the meeting room. Boss decides: fix it. Dev goes back to desk.
7. QA runs tests. One fails. Boss's red phone lights up — escalation to human.
8. Human clicks the phone. "Investigate." Boss assigns QA and Dev to pair on it. Fixed.
9. Green across the board. Boss posts to Slack: "Sprint 1 complete. Ready for prod deploy pending human approval."
