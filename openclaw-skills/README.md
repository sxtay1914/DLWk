# OpenClaw Boss Skills

Custom skills for [OpenClaw](https://openclaw.ai) that let it act as "The Boss" orchestrator for the AI Dev Team.

## Architecture

```
HUMAN → OpenClaw (The Boss, API-only) → Backend API → Codex Agents (workspace-scoped)
```

OpenClaw has **authority but zero direct capability**:
- No filesystem access — cannot read/write files on your machine
- No browser access — cannot navigate websites
- No arbitrary shell commands — skills only use `curl` to the localhost API
- All code execution happens inside the Codex agent sandbox (workspace/ directory)

This enforces the 4-layer safety model: **Human > Boss (OpenClaw) > Agents (Codex) > Sandbox**.

## Skills

| Skill | What It Does |
|-------|-------------|
| `boss-delegate` | Send feature requests to the team, approve plans |
| `boss-check-status` | Check task/sprint status, agent activity |
| `boss-approve` | Approve/reject checkpoints and SDLC gates |
| `boss-escalation` | Review and resolve team escalations |

## Setup

### Prerequisites
1. OpenClaw installed on your machine
2. Backend running at `http://localhost:8000`

### Install Skills
Copy each skill folder into your OpenClaw skills directory:

```bash
# Find your OpenClaw skills directory (usually ~/.openclaw/skills/)
cp -r openclaw-skills/boss-delegate ~/.openclaw/skills/
cp -r openclaw-skills/boss-check-status ~/.openclaw/skills/
cp -r openclaw-skills/boss-approve ~/.openclaw/skills/
cp -r openclaw-skills/boss-escalation ~/.openclaw/skills/
```

### Usage
In OpenClaw chat:
- "Build me a todo app with React and Express" → triggers `boss-delegate`
- "What's the team status?" → triggers `boss-check-status`
- "Approve the developer's checkpoint" → triggers `boss-approve`
- "Any escalations I need to handle?" → triggers `boss-escalation`

## API Endpoints Used

| Method | Endpoint | Used By |
|--------|----------|---------|
| POST | `/api/chat/boss` | boss-delegate |
| POST | `/api/chat/boss/approve-plan` | boss-delegate |
| GET | `/api/tasks` | boss-check-status |
| GET | `/api/agents` | boss-check-status |
| GET | `/api/sprint` | boss-check-status |
| GET | `/api/sdlc/phases` | boss-check-status |
| GET | `/api/activity` | boss-check-status |
| GET | `/api/checkpoints` | boss-approve |
| POST | `/api/checkpoints/{id}/decide` | boss-approve |
| POST | `/api/sdlc/gates/{id}/decide` | boss-approve |
| GET | `/api/escalations` | boss-escalation |

## Security Model

OpenClaw skills intentionally limit what The Boss can do:
- **Can**: delegate work, check status, approve/reject checkpoints, resolve escalations
- **Cannot**: write files, execute arbitrary commands, access the filesystem, bypass agent sandboxing

All actual code execution happens through the Codex agents, which are scoped to the `workspace/` directory.
