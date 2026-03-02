# User Flow: AI-Governed Dev Team

## Phase 1: Empty State → Intent

User opens the app. Everything is empty — no mock tasks, no fake activity. Clean kanban, idle pixel office.

The input bar sits prominently:
- No tasks: **"What do you want to build?"**
- Has tasks: **"What do you want to change?"**

User types: *"Build me an e-commerce checkout flow"*

---

## Phase 2: Boss Conversation (Clarifying)

The Boss doesn't just fire off. A chat panel opens and the Boss has a real conversation:

> **Boss:** "Before I brief the team — a few questions. Are we building just the checkout UI, or the full payment backend too? Do you have a payment provider in mind (Stripe, PayPal)? And should we include guest checkout or require login?"

> **User:** "Full stack. Stripe. Guest checkout yes."

> **Boss:** "Got it. One more — do you want order confirmation emails, or just a success page for now?"

> **User:** "Just success page. Keep it simple."

The Boss builds full context. Only when the Boss is satisfied does it proceed. The user never sees the internal prompt engineering — just a natural conversation.

---

## Phase 3: Structured Plan → User Approval

Boss presents the plan to the user before any work starts:

> **Boss:** "Here's my plan for the team:"
> 1. Design checkout page UI with cart summary, Stripe elements, guest form
> 2. Build Stripe payment integration (backend)
> 3. Create order model and success page
> 4. Write tests for payment flow
> 5. Code review all modules
>
> **Does this look right? Want to add, remove, or change anything?**

User can:
- **Approve** → tasks get created on the kanban
- **Modify** → "Split #2 into Stripe setup and payment API separately"
- **Add** → "Also add input validation on the form"

Only after approval does the Scrum Master add tasks to the board.

---

## Phase 4: Execution (Not Waterfall)

The Boss decides the order. The Scrum Master manages the lifecycle. But it's not autonomous — it's a loop:

```
For each task (in Boss's priority order):
  1. Agent picks up the task → status changes in pixel office
  2. Agent works on it
  3. Agent REPORTS to the user what they did
     "Developer: Built the checkout form component with
      Stripe CardElement, guest email field, and cart summary.
      Ready for review."
  4. User sees this and can:
     - ✅ Approve → moves to next stage (review/testing)
     - ✏️ Request changes → "Make the email field required"
     - ⏸️ Pause → hold this, work on something else
  5. Next agent picks up (CR reviews, QA tests)
  6. Same checkpoint pattern
```

PM is watching the whole time — if the Developer drifts from the original spec (e.g., adds features the Boss didn't plan), the PM flags it:
> **PM:** "Heads up — Developer added a coupon code field that wasn't in the original spec. Should we keep it?"

---

## Phase 5: Continuous User Authority

At any point the user can:
- **Click any agent** in the pixel office → see what they're currently doing, their output, chat with them
- **Drag tasks** on the kanban → reprioritize
- **Click the red phone** → see escalations (conflicts, failures, spec drift)
- **Type in the input bar again** → "Actually, add PayPal too" → Boss re-plans, adjusts

The dashboard is alive but not autonomous. The agents work, but the human governs.

---

## Agent Roles in the Flow

| Agent | Role in Flow |
|-------|-------------|
| **Boss** | Converses with user, clarifies intent, creates structured plan, decides task order, escalates |
| **Scrum Master** | Adds tasks to kanban, manages task lifecycle, coordinates agent handoffs |
| **Developer** | Writes code, reports what was built, waits for approval before moving on |
| **QA Tester** | Tests the code, reports results, flags failures |
| **Code Reviewer** | Reviews code quality, approves or requests changes |
| **PM** | Watches for spec drift, ensures work matches the original plan from Boss |

---

## UI Components in the Flow

| Component | Role |
|-----------|------|
| **Input bar** | Entry point. Context-aware prompt. Opens Boss chat on submit. |
| **Boss chat panel** | Conversation with Boss. Clarifying questions, plan presentation, approvals. |
| **Pixel office** | Visual status of all agents. Click to inspect. Agents animate when working. |
| **Kanban board** | Tasks appear after plan approval. Move through columns as agents work. |
| **Activity log** | Real-time feed of agent actions. Each report is a checkpoint for user. |
| **Agent modal** | Click an agent → see their current work, output, chat directly. |
| **Red phone / Escalation** | PM flags spec drift, QA flags test failures, Boss flags conflicts. |
