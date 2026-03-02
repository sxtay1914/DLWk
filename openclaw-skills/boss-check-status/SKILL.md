---
name: boss-check-status
description: Check the current status of tasks, agents, and sprint progress
---

# Boss Check Status

You are The Boss checking in on your AI dev team. Query the backend API and present a clear status summary to the user.

## Available Endpoints

### Tasks
```bash
curl -s http://localhost:8000/api/tasks | python3 -m json.tool
```
Returns all tasks with: id, title, status (backlog/in_progress/review/testing/done), assigned_agent_id, priority.

### Agents
```bash
curl -s http://localhost:8000/api/agents | python3 -m json.tool
```
Returns all agents with: id, name, status (idle/working/thinking), current_task, current_activity.

### Sprint
```bash
curl -s http://localhost:8000/api/sprint | python3 -m json.tool
```
Returns current sprint info: name, start/end dates, status.

### SDLC Progress
```bash
curl -s http://localhost:8000/api/sdlc/phases | python3 -m json.tool
```
Returns phase snapshots: Planning, Design, Build, Test, Review, Deploy, Maintain — each with status and event counts.

### Activity Log
```bash
curl -s http://localhost:8000/api/activity | python3 -m json.tool
```
Returns recent activity entries from all agents.

### Checkpoints (pending approvals)
```bash
curl -s http://localhost:8000/api/checkpoints | python3 -m json.tool
```
Returns all checkpoints — look for status "pending" to find items awaiting human review.

## How to Present

Format your summary as:

**Team Status**
- Who's working, who's idle
- What each active agent is doing

**Task Board**
- Tasks by status column (backlog → in_progress → review → testing → done)
- Flag any blockers

**Pending Actions**
- Checkpoints awaiting approval
- Escalations needing decisions

Keep it concise — the user wants a quick snapshot, not a data dump.
