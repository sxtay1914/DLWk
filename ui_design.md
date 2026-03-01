# UI Design: AI-Governed Dev Team

## Overall Layout

Single-page web app. **Light theme by default** (clean, professional like Jira/Linear). Pixel office banner on top, scrum board below. Desktop-first.

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER BAR (light, clean)                                        │
├──────────────────────────────────────────────────────────────────┤
│ PIXEL OFFICE (PixelHQ-style, detailed pixel art, Phaser.js)      │
├──────────────────────────────────────────────────────────────────┤
│ SCRUM DASHBOARD (Jira-style kanban + activity log + sprint info) │
└──────────────────────────────────────────────────────────────────┘
```

---

## Theme: Light Mode Default

The dashboard should feel like a real enterprise scrum tool — clean white backgrounds, subtle gray borders, professional typography. The pixel office banner provides the visual warmth and personality.

---

## Header Bar

Clean, light header inspired by Jira/Linear:
- Left: Project breadcrumb "Projects / AI Dev Team" + "Board" title
- Center-right: Sprint countdown "4 days remaining", "Complete Sprint" button (blue)
- Right: Search, avatar stack of agents, group-by dropdown

---

## Pixel Office Banner (PixelHQ-Style)

### Reference: PixelHQ app screenshots

The pixel office must look like **actual pixel art**, not CSS boxes. It should match the quality of PixelHQ — detailed, warm, cozy.

### Visual Style

- **Top-down / slight isometric** perspective
- **Two distinct rooms**:
  - **Left room (open office)**: Warm wooden floor planks, 5 wooden desks with monitors/laptops, characters sitting at desks. Bookshelves along the walls with colorful book spines. Boxes/crates in corners.
  - **Right room (Boss's office)**: Blue/teal carpet/floor, couch/armchairs, a desk with a monitor, bookshelves, potted plants, a painting on the wall. More luxurious feel.
- **Furniture**: Wooden desks with visible monitors/screens (pixel glow), office chairs, filing cabinets, potted plants in white pots, water cooler, whiteboard
- **Characters**: Detailed pixel sprites (not colored squares). Visible hair, clothing, sitting posture. Each character has a distinct look matching their role.
- **Lighting**: Warm ambient feel, slightly different tones per room
- **Wall details**: Bookshelves with colored spines, framed pictures, a scrum board on the wall

### Engine: Phaser.js

Built with:
- **Tilemaps** for the office floor, walls, furniture (Tiled editor export)
- **Sprite sheets** for each agent character (idle, typing, walking, thinking, celebrating frames)
- **Tween system** for smooth character movement between locations
- **Interactive sprites** with click/hover handlers

### Agent Appearances

| Agent | Visual | Desk Location |
|-------|--------|---------------|
| Boss | Suit/formal, sits in the right room at the big desk | Right room, main desk |
| PM | Smart casual, at whiteboard or desk | Left room, desk near whiteboard |
| Scrum Master | Casual, often standing/walking | Left room, near the wall board |
| Developer | Hoodie/casual, typing pose | Left room, center desk |
| QA | Glasses, focused posture | Left room, desk with test results on screen |
| Code Reviewer | Reading posture, papers on desk | Left room, desk near bookshelves |

### Sprite States & Animations

| State | Animation |
|-------|-----------|
| Idle | Slight bobbing, occasional blink |
| Working/Typing | Hands moving on keyboard, screen flickering |
| Thinking | Hand on chin, thought bubble with "..." |
| Walking | 4-frame walk cycle between locations |
| Meeting | Characters gathered in boss's office or whiteboard |
| Celebrating | Jump animation, confetti particles |

### Interactions

- **Hover** agent → name tooltip + current status in pixel font
- **Click** agent → agent detail modal opens
- **Click Boss** → Boss chat modal opens
- **Red phone on Boss's desk** → pulses red when escalation pending, click to open
- **Speech bubbles** appear between agents during hand-offs
- **Status icons** float above agents (keyboard icon, magnifying glass, checkmark)

---

## Scrum Dashboard (Jira/Linear Style)

### Reference: Jira sprint board screenshots

Clean, professional, white background. This is a **real functional scrum board**.

### Board Header

```
Projects / AI Dev Team
Board                                    ⏱ 4 days remaining  [Complete Sprint]  ...

🔍 [Search]  [👤👤👤👤 +2]  Epic ▾               GROUP BY  Choices ▾
```

- Breadcrumb navigation
- Sprint timer + complete sprint button (blue, rounded)
- Search bar, avatar stack (circular agent avatars with colored borders), filter dropdowns

### Kanban Columns

4 columns with gray background, white cards:

```
TO DO  12        IN PROGRESS  4        IN REVIEW  4         DONE  4
┌─────────┐     ┌─────────────┐     ┌────────────┐      ┌─────────────┐
│           │     │               │     │              │      │               │
│ ┌───────┐ │     │ ┌───────────┐ │     │ ┌──────────┐ │      │ ┌───────────┐ │
│ │ Title │ │     │ │ Title     │ │     │ │ Title    │ │      │ │ Title     │ │
│ │       │ │     │ │           │ │     │ │          │ │      │ │           │ │
│ │🟦NUC  │ │     │ │🟥NUC  3▲ │ │     │ │🟦NUC 5▲ │ │      │ │🟩NUC ✓ 4 │ │
│ │ 9 ▼ 👤│ │     │ │    ▲▲ 👤 │ │     │ │     👤  │ │      │ │  ▼ 👤    │ │
│ └───────┘ │     │ └───────────┘ │     │ └──────────┘ │      │ └───────────┘ │
│           │     │               │     │              │      │               │
└─────────┘     └─────────────┘     └────────────┘      └─────────────┘
```

### Task Card Design (Jira-style)

Each white card contains:
- **Title**: Task name (1-2 lines, truncated)
- **Ticket ID**: Colored square icon + ID (e.g., "🟦 DEV-205")
  - Blue square = feature/story
  - Red square = bug
  - Green square = done/improvement
- **Story points**: Number in a circle
- **Priority icon**: Double arrows (▲▲ = highest, ▲ = high, ═ = medium, ▼ = low, ▼▼ = lowest)
- **Assignee avatar**: Circular avatar with agent color border on the right
- **Optional badges**: PR icon if code review, checkmark if tests passing

Cards are:
- White with subtle gray border
- Slight shadow on hover
- Draggable between columns
- Clickable to open detail

### Bottom Section

Two columns below the kanban:

**Left (2/3 width): Activity Log**
- Clean list with timestamps
- Agent avatar dot + name + message
- Color-coded by type (info=gray, success=green, warning=amber, error=red)
- Auto-scroll, filterable by agent

**Right (1/3 width): Sprint Info**
- Sprint name and status badge
- Progress bar with task count
- Agent status list (avatar + name + current status)
- Sprint burndown mini-chart (stretch goal)

---

## Modals

All modals are clean, white/light with subtle shadows. Centered with backdrop blur.

### Agent Detail Modal

```
┌─────────────────────────────────────────┐
│  [pixel avatar]  Developer Agent        │
│  Status: 🟢 Working                    │
│  Current task: DEV-201 Auth module      │
├─────────────────────────────────────────┤
│                                         │
│  LIVE OUTPUT                            │
│  ┌───────────────────────────────────┐  │
│  │ > Creating src/auth/login.ts      │  │
│  │ > Writing JWT validation...       │  │
│  │ > Running npm test -- auth        │  │
│  │ > 3/4 tests passing               │  │
│  └───────────────────────────────────┘  │
│                                         │
│  CHAT                                   │
│  ┌───────────────────────────────────┐  │
│  │ You: Use bcrypt not md5           │  │
│  │ Dev: Switching to bcrypt          │  │
│  └───────────────────────────────────┘  │
│  [Type a message...           ] [Send]  │
│                                         │
│  [Pause]  [Reassign]  [Cancel Task]     │
└─────────────────────────────────────────┘
```

### Boss Escalation Modal

```
┌─────────────────────────────────────────┐
│  🔴 Boss Needs Your Decision            │
│                                         │
│  "QA found a failing test in auth.      │
│   Dev says flaky. QA disagrees."        │
│                                         │
│  Recommendation: Fix before proceeding  │
│                                         │
│  [Approve]  [Investigate]               │
│  [Skip]     [Discuss]                   │
└─────────────────────────────────────────┘
```

---

## Color Palette

### Light Mode (DEFAULT)

| Element | Color | Hex |
|---------|-------|-----|
| Background | White | `#ffffff` |
| Page background | Light gray | `#f7f8f9` |
| Cards | White | `#ffffff` |
| Card borders | Light gray | `#e2e4e9` |
| Column backgrounds | Very light gray | `#f1f2f4` |
| Primary accent | Blue | `#0052cc` (Jira blue) |
| Success | Green | `#22c55e` |
| Warning | Amber | `#f59e0b` |
| Error | Red | `#ef4444` |
| Text primary | Dark gray | `#172b4d` |
| Text secondary | Medium gray | `#6b778c` |
| Text muted | Light gray | `#97a0af` |

### Pixel Office Palette

Warm, detailed, 16-bit aesthetic (independent of dashboard theme):
- Left room: Warm brown wooden floors, cream/beige walls
- Right room: Blue/teal carpet, darker blue-gray walls
- Furniture: Warm wood tones (#8B6914, #A0784C)
- Plants: Various greens
- Screens: Blue/white pixel glow
- Characters: Detailed with distinct clothing colors per agent role

### Agent Colors (used in both pixel office and dashboard)

| Agent | Color | Hex |
|-------|-------|-----|
| Boss | Gold/Amber | `#F59E0B` |
| PM | Blue | `#3B82F6` |
| Scrum Master | Teal | `#14B8A6` |
| Developer | Green | `#22C55E` |
| QA | Orange | `#F97316` |
| Code Reviewer | Purple | `#8B5CF6` |

---

## Typography

- **Dashboard**: Inter (or system font). Clean, professional.
- **Pixel office labels**: Press Start 2P for pixel-style tooltips and labels.
- **Monospace** (live output, code): JetBrains Mono.
- **Ticket IDs**: Monospace, small, gray.

---

## Responsive Notes

- Desktop-first (1280px+ target for hackathon demo)
- Pixel office banner: fixed 250-300px height, 16:9 internal aspect ratio
- Kanban columns collapse on smaller screens
- Modals max-width 600px, centered
