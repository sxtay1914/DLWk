# UI Design: AI-Governed Dev Team

## Overall Layout

Single-page web app. Modern dark/light dashboard with an animated pixel office banner at the top. Desktop-first.

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER BAR                                                       │
├──────────────────────────────────────────────────────────────────┤
│ PIXEL OFFICE (interactive banner, Phaser.js)                     │
├──────────────────────────────────────────────────────────────────┤
│ SCRUM DASHBOARD (kanban + activity log + sprint info)            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Header Bar

Slim top bar with:
- Project/logo name (left)
- Sprint indicator: "Sprint 1 - Day 2" (center-left)
- Quick stats: "3 tasks done | 5 agents active" (center-right)
- Dark/light mode toggle (right)

---

## Pixel Office Banner

### Engine: Phaser.js

Chosen for:
- Sprite sheets with state machine animations (idle, working, walking, celebrating)
- Built-in tween system for smooth character movement
- Tilemap support for office layout
- Native click/hover/drag input on sprites
- Best path to PixelHQ-level quality

### Office Layout

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   ┌─────┐                              ┌────────┐           │
│   │BOSS │  🔴 red phone                │SCRUM   │           │
│   │desk │                              │BOARD   │           │
│   └─────┘                              │on wall │           │
│                                        └────────┘           │
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐                  │
│   │ PM │  │SCRM│  │DEV │  │ QA │  │ CR │                  │
│   │desk│  │desk│  │desk│  │desk│  │desk│                  │
│   └────┘  └────┘  └────┘  └────┘  └────┘                  │
│                                                              │
│   [ ☕ break room ]              [ 📋 meeting room ]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Sprite States

| Agent | Working | Idle | Conflict | Celebrating |
|-------|---------|------|----------|-------------|
| Boss | Walking between desks, checking monitors | Sitting at corner desk | In meeting room mediating | Standing, clapping |
| PM | At whiteboard sketching | Reading at desk | In meeting room | High-fiving |
| Scrum Master | At scrum board, pointing | Walking around | In meeting room | Fist pump |
| Developer | Typing furiously at desk | Coffee machine / stretching | In meeting room | Spinning in chair |
| QA | At desk, running tests (monitor flashing) | Treadmill / idle at desk | In meeting room | Green checkmark animation |
| Code Reviewer | Reading at desk, red pen | Leaning back in chair | In meeting room | Thumbs up |

### Interactions

- **Hover** an agent → tooltip with name + current status
- **Click** an agent → opens agent detail modal
- **Click the Boss** → opens Boss chat modal
- **Click red phone** (when lit) → opens escalation modal
- **Drag task** from dashboard onto pixel office agent → reassign

### Visual Cues

- Agent speech bubbles appear when agents communicate with each other
- Small icons float above agents showing current action (⌨️ coding, 🔍 reviewing, ✅ testing)
- Lines/paths drawn between agents during hand-offs (animated dotted line from Dev to Reviewer)
- Scrum board on the wall updates in real-time matching the dashboard below

---

## Scrum Dashboard

### Kanban Board

Four columns, cards move automatically as agents progress:

```
┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐
│ BACKLOG  │ │IN PROGRESS│ │ REVIEW   │ │  DONE    │
│          │ │           │ │          │ │          │
│ ┌──────┐ │ │ ┌──────┐  │ │ ┌──────┐ │ │ ┌──────┐ │
│ │Task 3│ │ │ │Task 1│  │ │ │Task 2│ │ │ │      │ │
│ │ 🤖PM │ │ │ │ 🤖DEV│  │ │ │ 🤖CR │ │ │ │      │ │
│ └──────┘ │ │ └──────┘  │ │ └──────┘ │ │ └──────┘ │
│ ┌──────┐ │ │           │ │          │ │          │
│ │Task 4│ │ │           │ │          │ │          │
│ └──────┘ │ │           │ │          │ │          │
└──────────┘ └───────────┘ └──────────┘ └──────────┘
```

### Task Cards

Each card shows:
- Task title
- Assigned agent (avatar + name)
- Status indicator (colored dot)
- Priority tag (P0/P1/P2)
- Time elapsed

Cards are draggable (human can manually reassign/reprioritize).

### Bottom Section (two columns)

```
┌─────────── ACTIVITY LOG ───────────┐  ┌─── SPRINT INFO ──────────┐
│ 12:03 Dev started auth module      │  │ Sprint 1                  │
│ 12:01 Boss assigned task to Dev    │  │ 3/8 tasks done            │
│ 11:58 PM finished spec for auth    │  │ ██████░░░░ 37%            │
│ 11:55 Boss reviewed PM's output    │  │                           │
│ ...                                │  │ Agents:                   │
│                                    │  │ 🟢 PM - idle              │
│ [Auto-scrolling, filterable]       │  │ 🟢 Dev - working          │
│                                    │  │ 🟡 QA - waiting           │
└────────────────────────────────────┘  │ 🟢 CR - reviewing         │
                                        │ 🟢 Boss - monitoring      │
                                        └───────────────────────────┘
```

---

## Modals

### Agent Detail Modal

Triggered by clicking any agent sprite in the pixel office.

```
╔═══════════════════════════════════════╗
║  [pixel avatar]  DEVELOPER AGENT     ║
║  Status: 🟢 Working                  ║
║  Current task: Implement auth module  ║
╠═══════════════════════════════════════╣
║                                       ║
║  LIVE OUTPUT                          ║
║  ┌─────────────────────────────────┐  ║
║  │ > Creating src/auth/login.ts    │  ║
║  │ > Writing JWT validation...     │  ║
║  │ > Running npm test -- auth      │  ║
║  │ > 3/4 tests passing             │  ║
║  └─────────────────────────────────┘  ║
║                                       ║
║  CHAT WITH AGENT                      ║
║  ┌─────────────────────────────────┐  ║
║  │ You: Use bcrypt not md5         │  ║
║  │ Dev: Got it, switching to bcrypt│  ║
║  └─────────────────────────────────┘  ║
║  [Type a message...         ] [Send]  ║
║                                       ║
║  [⏸ Pause] [🔄 Reassign] [❌ Cancel] ║
╚═══════════════════════════════════════╝
```

### Boss Escalation Modal (Red Phone)

Triggered when the Boss's red phone lights up.

```
╔══════════════════════════════════════╗
║  🔴 BOSS NEEDS YOUR DECISION        ║
║                                      ║
║  "QA found a failing test in the     ║
║   auth module. Dev says it's a       ║
║   flaky test. QA disagrees.          ║
║                                      ║
║   Recommendation: Have Dev fix it    ║
║   before proceeding."                ║
║                                      ║
║  [✅ Approve]  [🔧 Investigate]      ║
║  [⏭ Skip]     [💬 Discuss]          ║
╚══════════════════════════════════════╝
```

### Boss Chat Modal

Triggered by clicking the Boss sprite directly.

```
╔══════════════════════════════════════╗
║  [Boss avatar]  THE BOSS (OpenClaw)  ║
║  Status: 🟢 Monitoring              ║
╠══════════════════════════════════════╣
║                                      ║
║  CHAT                                ║
║  ┌────────────────────────────────┐  ║
║  │ You: Focus on auth first       │  ║
║  │ Boss: Understood. Reprioritizing│  ║
║  │       backlog. Auth tasks moved │  ║
║  │       to top of sprint.         │  ║
║  └────────────────────────────────┘  ║
║  [Type a message...        ] [Send]  ║
║                                      ║
║  CURRENT DECISIONS                   ║
║  • Assigned auth to Dev (auto)       ║
║  • Queued tests for QA (pending)     ║
║  • Escalation: none                  ║
║                                      ║
╚══════════════════════════════════════╝
```

---

## Color Palette

### Dark Mode (default)

| Element | Color | Hex |
|---------|-------|-----|
| Background | Near black | `#0a0a0b` |
| Cards/panels | Dark surface | `#161618` |
| Borders | Subtle gray | `#2a2a2e` |
| Primary accent | Indigo | `#6366f1` |
| Success | Green | `#22c55e` |
| Warning | Amber | `#f59e0b` |
| Error | Red | `#ef4444` |
| Text primary | White | `#fafafa` |
| Text secondary | Zinc | `#a1a1aa` |

### Light Mode

| Element | Color | Hex |
|---------|-------|-----|
| Background | White | `#ffffff` |
| Cards/panels | Light gray | `#f4f4f5` |
| Borders | Gray | `#e4e4e7` |
| Primary accent | Indigo | `#6366f1` |
| Text primary | Near black | `#18181b` |
| Text secondary | Gray | `#71717a` |

### Pixel Office Palette

Warm, distinct from the dashboard chrome. 16-bit aesthetic:
- Wooden floors, warm tones
- Soft ambient lighting
- Colored accents per agent (PM=blue, Dev=green, QA=orange, CR=purple, Boss=gold, SM=teal)

---

## Typography

- **Dashboard**: Inter or system font stack. Clean, modern.
- **Pixel office tooltips/labels**: Pixel font (e.g., "Press Start 2P" or "Silkscreen") for flavor.
- **Monospace** for live output/code: JetBrains Mono or Fira Code.

---

## Responsive Notes

- Desktop-first (1280px+ target)
- Pixel office banner maintains 16:9 aspect ratio, scales down on smaller screens
- Dashboard columns collapse gracefully
- Modals are max-width 600px, centered
