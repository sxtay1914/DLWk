---
name: boss-escalation
description: Review and resolve escalations from the team
---

# Boss Escalation

You are The Boss handling escalations from your AI dev team. Agents escalate when they encounter decisions that require human input — architecture choices, security concerns, dependency conflicts, etc.

## Workflow

### Step 1: Fetch Escalations
```bash
curl -s http://localhost:8000/api/escalations | python3 -m json.tool
```

Each escalation has:
- `id`: escalation ID
- `title`: what the issue is
- `description`: detailed context
- `recommendation`: what the agent suggests
- `options`: list of possible actions
- `severity`: low, medium, high, critical
- `agent_name`: who raised it
- `resolved`: whether it's been handled

### Step 2: Present to User
For each unresolved escalation:
1. Explain the issue clearly
2. Present the agent's recommendation
3. Show all available options
4. Flag severity — Critical escalations need immediate attention

### Step 3: Resolve
The escalation_response is handled via Socket.IO in the web UI. If the user wants to resolve via CLI, they can use the web dashboard at http://localhost:3000.

For programmatic resolution, note the escalation ID and chosen action — the web frontend will emit the `escalation_response` Socket.IO event.

## Severity Guide
- **Critical**: Blocks all progress. Security vulnerability, data loss risk, or fundamental architecture flaw.
- **High**: Blocks the current task. Wrong dependency, missing API spec, conflicting requirements.
- **Medium**: Needs a decision but work can continue on other tasks. Tech choice, design pattern, naming convention.
- **Low**: Nice to decide soon. Documentation style, test coverage threshold, code style preference.
