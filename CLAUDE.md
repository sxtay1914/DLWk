# AI-Governed Dev Team - Hackathon Project

## What This Is

An autonomous AI software engineering team powered by OpenAI Codex Agents SDK, orchestrated by an OpenClaw "Boss" agent, visualized as an interactive pixel art office with a real scrum dashboard.

## Problem Statement

> Build a safe, human-governed system that maximises the leverage of Codex as an AI coding agent to support enterprise software teams across any stage of the SDLC.

## Architecture

```
HUMAN → THE BOSS (OpenClaw, can only delegate) → CODEX AGENTS (can execute)
```

- **Boss (OpenClaw)**: Authority but no capability. Delegates, prioritizes, escalates. Cannot write code or run commands.
- **5 Codex Agents**: PM, Scrum Master, Developer, QA, Code Reviewer. Each has execution capability within sandbox.
- **4-layer safety model**: Human > Boss > Agents > Sandbox.

## Project Structure

```
/frontend          - Next.js 16 + TypeScript + Tailwind CSS v4
  /src/app         - App router (page.tsx, layout.tsx, globals.css)
  /src/components  - React components (Header, KanbanBoard, TaskCard, ActivityLog, SprintInfo, PixelOfficeBanner, AgentModal, EscalationModal)
  /src/hooks       - Custom hooks (useAgents, useTasks, useActivity, useEscalation)
  /src/lib         - Types, socket client, mock data
  /src/game        - Phaser.js pixel office engine
    config.ts      - Phaser game config (960x240, pixelArt, FIT scaling)
    AssetGenerator.ts - Programmatic pixel art generation (tiles, furniture, character sprites)
    PixelOfficeScene.ts - Two-room office layout with furniture, ambient animations
    AgentSprite.ts - Interactive character class (walk, type, hover, click, speech bubbles)

/backend           - Python FastAPI + Socket.IO
  main.py          - FastAPI app with REST + WebSocket endpoints
  models.py        - Pydantic models (Agent, Task, Sprint, ActivityEntry, Escalation)
  state.py         - In-memory state manager with mock data
  simulation.py    - Background task that simulates agent activity
  venv/            - Python virtual environment
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

- **Light theme by default** - Clean, professional scrum board look (Jira/Linear style)
- **Pixel office banner** - Phaser.js with detailed PixelHQ-style art (isometric top-down, wooden desks, bookshelves, plants, detailed character sprites)
- **Scrum dashboard** - Real functional board, not a mockup. Agents read/write to it. Cards have ticket IDs, story points, priority icons, assignee avatars.
- **No OpenClaw in Phase 1** - Codex agents handle everything. OpenClaw wired in later as "The Boss" orchestration layer.

## Agent Colors

- Boss: `#F59E0B` (gold/amber)
- PM: `#3B82F6` (blue)
- Scrum Master: `#14B8A6` (teal)
- Developer: `#22C55E` (green)
- QA: `#F97316` (orange)
- Code Reviewer: `#8B5CF6` (purple)

## Tech Stack

- Frontend: Next.js 16, React 19, Tailwind CSS v4, Phaser.js 3, Socket.IO client
- Backend: Python 3.12, FastAPI, python-socketio, Pydantic v2, uvicorn
- Agent orchestration: OpenAI Codex Agents SDK (Python) + MCP
- Pixel engine: Phaser.js (sprite sheets, tilemaps, tween system)

## Pixel Office Engine

All pixel art is generated programmatically at runtime (no external image assets needed).

- **Tiles**: wood floor (16x16), carpet, cream walls, dark walls — each hand-drawn pixel by pixel
- **Furniture**: desks, monitors, chairs, bookshelves, whiteboard, scrum board, coffee machine, couch, painting, filing cabinet, red phone, water cooler, plants
- **Character sprites**: 18x24 frames, 3 cols x 4 rows = 12 frames per character (walk-down, walk-up, walk-left, typing/seated). Each has unique hair, skin, clothing.
- **Sprite sheets** registered via `Phaser.Textures.Parsers.SpriteSheet` for proper frame splitting
- **Phaser import**: Must use `import * as Phaser from "phaser"` (no default ESM export). PixelOfficeBanner uses dynamic `import("phaser")` for SSR safety.
- **Scene layout**: Left room (open office, 600px, wooden floor) + Right room (boss office, 340px, carpet) + dividing wall with doorway
- **Ambient animations**: monitor flicker, coffee machine blink, plant sway, red phone pulse, boss patrol (walks to doorway every 12s), random speech bubbles
- **Interactions**: hover = bounce + tooltip, click = emit `agent-clicked` event to React

## References & Inspiration

- **PixelHQ** (https://apps.apple.com/app/pixelhq/id6504893854) — pixel art office style reference
- **Pokevue** (https://github.com/mmorainville/pokevue) — Phaser 3 sprite patterns, tilemap loading, MovableCharacter class, EasyStar.js pathfinding, 10fps animations
- **Jira Sprint Board** — UI design reference for the scrum dashboard (light theme, white cards, blue accent)

## Important Notes

- Backend uses `avatar_color` field; frontend normalizes to `color` in useAgents hook
- Socket.IO events: `agent_update`, `task_update`, `activity`, `escalation`
- Simulation runs automatically on backend startup (4-10 second intervals)
- All modals triggered by clicking agents in pixel office or escalation events
- GitHub repo: https://github.com/Samrath-dev/DLWk.git
