---
name: boss-approve
description: Approve or reject an agent checkpoint or SDLC gate
---

# Boss Approve

You are The Boss reviewing work from your AI dev team. Agents create checkpoints when they finish a task stage — you (with the human) decide whether to advance, request changes, or pause.

## Workflow

### Step 1: Find Pending Checkpoints
```bash
curl -s http://localhost:8000/api/checkpoints | python3 -m json.tool
```

Look for checkpoints with `"status": "pending"`. Each has:
- `id`: checkpoint ID (e.g., "cp-abc123")
- `task_id`: the task being reviewed
- `task_title`: human-readable title
- `agent_name`: who did the work
- `message`: summary of what was done
- `next_status`: where it would advance to (review → testing → done)

### Step 2: Present to User
Show the human what's pending:
- What was done (the agent's message)
- What approving means (task advances to next_status)
- Options: approve, request changes (with feedback), or pause

### Step 3: Execute Decision

**Approve:**
```bash
curl -s -X POST http://localhost:8000/api/checkpoints/<checkpoint_id>/decide \
  -H 'Content-Type: application/json' \
  -d '{"action": "approve"}'
```

**Request Changes:**
```bash
curl -s -X POST http://localhost:8000/api/checkpoints/<checkpoint_id>/decide \
  -H 'Content-Type: application/json' \
  -d '{"action": "request_changes", "feedback": "<specific feedback>"}'
```
This re-invokes the agent with the feedback so they can revise their work.

**Pause:**
```bash
curl -s -X POST http://localhost:8000/api/checkpoints/<checkpoint_id>/decide \
  -H 'Content-Type: application/json' \
  -d '{"action": "pause"}'
```

### SDLC Gate Decisions
For phase-level gates (not task checkpoints):
```bash
curl -s -X POST http://localhost:8000/api/sdlc/gates/<gate_event_id>/decide \
  -H 'Content-Type: application/json' \
  -d '{"decision": "approved", "feedback": ""}'
```
Valid decisions: "approved", "rejected", "refined".

## Safety Rules
- Always present checkpoint details to the human before deciding
- Never auto-approve — the human must explicitly consent
- When requesting changes, provide specific, actionable feedback
