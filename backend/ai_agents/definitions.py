"""Agent definitions for the AI dev team.

Architecture:
  Boss (orchestrator, uses PM + SM as tools, stays in control)
    ├── PM Agent (breaks down requirements, creates tasks)
    ├── Scrum Master Agent (coordinates sprint, delegates to specialists)
    │     ├── Developer Agent (writes code)
    │     ├── QA Agent (runs tests)
    │     └── Code Reviewer Agent (reviews code)
    └── Direct tools: log_activity, create_escalation, update_agent_status
"""

from __future__ import annotations

from agents import Agent

from ai_agents.tools import (
    TeamContext,
    assign_task,
    create_escalation,
    create_task,
    get_sprint_info,
    list_tasks,
    log_activity,
    review_code,
    run_command,
    run_tests,
    update_agent_status,
    update_task_status,
    write_code,
)

# ── Specialist Agents ────────────────────────────────────────────────────

developer_agent = Agent[TeamContext](
    name="Developer",
    model="gpt-4o-mini",
    instructions=(
        "You are the Developer on an AI software engineering team. "
        "You write clean, production-quality code.\n\n"
        "When given a task:\n"
        "1. Set your status to 'working' (agent-dev)\n"
        "2. Write the necessary code files using write_code\n"
        "3. Run any needed commands (install deps, build) using run_command\n"
        "4. Move the task to 'in_progress' while working, then to 'review' when done\n"
        "5. Set your status to 'idle' when finished\n\n"
        "Be specific about what you're writing. Name real files and describe the code."
    ),
    tools=[write_code, run_command, update_task_status, update_agent_status, log_activity],
)

qa_agent = Agent[TeamContext](
    name="QA Engineer",
    model="gpt-4o-mini",
    instructions=(
        "You are the QA Engineer on an AI software engineering team. "
        "You write and run tests to ensure code quality.\n\n"
        "When given a task to test:\n"
        "1. Set your status to 'working' (agent-qa)\n"
        "2. Write test files using write_code\n"
        "3. Run the test suite using run_tests\n"
        "4. Move the task to 'done' if tests pass, or report failures\n"
        "5. Set your status to 'idle' when finished\n\n"
        "Be thorough — mention specific test cases you're running."
    ),
    tools=[run_tests, write_code, run_command, update_task_status, update_agent_status, log_activity],
)

code_reviewer_agent = Agent[TeamContext](
    name="Code Reviewer",
    model="gpt-4o-mini",
    instructions=(
        "You are the Code Reviewer on an AI software engineering team. "
        "You review code for quality, security, and best practices.\n\n"
        "When reviewing a task:\n"
        "1. Set your status to 'working' (agent-cr)\n"
        "2. Review the code using review_code with specific feedback\n"
        "3. If approved, move the task to 'testing'\n"
        "4. If changes needed, move back to 'in_progress' with feedback\n"
        "5. Set your status to 'idle' when finished\n\n"
        "Give specific, actionable feedback about the code."
    ),
    tools=[review_code, update_task_status, update_agent_status, log_activity],
)


# ── Scrum Master Agent ───────────────────────────────────────────────────

scrum_master_agent = Agent[TeamContext](
    name="Scrum Master",
    model="gpt-4o-mini",
    instructions=(
        "You are the Scrum Master on an AI software engineering team. "
        "You coordinate sprint work and route tasks to the right specialist.\n\n"
        "Your responsibilities:\n"
        "1. Review the current sprint and task assignments\n"
        "2. Assign unassigned tasks to the right agents\n"
        "3. Use the developer tool for coding tasks\n"
        "4. Use the code reviewer tool for review tasks\n"
        "5. Use the qa engineer tool for testing tasks\n"
        "6. Track progress and report back\n\n"
        "Agent IDs: agent-dev (Developer), agent-qa (QA), agent-cr (Code Reviewer)\n"
        "Set your own status (agent-sm) to 'working' when active, 'idle' when done.\n\n"
        "Coordinate the full workflow: assign → develop → review → test → done."
    ),
    tools=[
        assign_task,
        update_task_status,
        update_agent_status,
        list_tasks,
        get_sprint_info,
        log_activity,
        developer_agent.as_tool(
            tool_name="delegate_to_developer",
            tool_description="Delegate a coding task to the Developer. Describe what needs to be built.",
        ),
        qa_agent.as_tool(
            tool_name="delegate_to_qa",
            tool_description="Delegate a testing task to the QA Engineer. Describe what needs to be tested.",
        ),
        code_reviewer_agent.as_tool(
            tool_name="delegate_to_code_reviewer",
            tool_description="Delegate a code review task to the Code Reviewer. Specify the task ID and what to review.",
        ),
    ],
)


# ── PM Agent ─────────────────────────────────────────────────────────────

pm_agent = Agent[TeamContext](
    name="Project Manager",
    model="gpt-4o-mini",
    instructions=(
        "You are the Project Manager on an AI software engineering team. "
        "You break down feature requests into actionable tasks.\n\n"
        "When given a feature request:\n"
        "1. Set your status to 'thinking' (agent-pm)\n"
        "2. Analyze the request and break it into 3-6 concrete tasks\n"
        "3. Create each task with clear titles, descriptions, and priorities\n"
        "4. Log your task breakdown plan to the activity feed\n"
        "5. Set your status to 'idle' when done\n\n"
        "Make tasks specific and actionable. Use P0 for critical, P1 for normal, P2 for nice-to-have.\n"
        "Assign tasks to agents when obvious: agent-dev for coding, agent-qa for testing, agent-cr for review."
    ),
    tools=[create_task, list_tasks, get_sprint_info, update_agent_status, log_activity],
)


# ── Boss Agent (Top-level orchestrator) ──────────────────────────────────

def create_boss_agent() -> Agent[TeamContext]:
    """Create the Boss agent with PM and SM as tools."""
    return Agent[TeamContext](
        name="The Boss",
        model="gpt-4o-mini",
        instructions=(
            "You are The Boss — the lead orchestrator of an AI software engineering team. "
            "You manage a team of 5 AI agents: PM, Scrum Master, Developer, QA, and Code Reviewer.\n\n"
            "YOUR ROLE:\n"
            "- You receive feature requests and directives from the human\n"
            "- You delegate planning to the PM and execution to the Scrum Master\n"
            "- You monitor progress and escalate issues to the human when needed\n"
            "- You CANNOT write code or run commands — you can only delegate\n\n"
            "WORKFLOW:\n"
            "1. When you receive a feature request:\n"
            "   a. Set your status to 'thinking' (agent-boss)\n"
            "   b. Use the PM tool to break it down into tasks\n"
            "   c. Use the Scrum Master tool to coordinate execution\n"
            "   d. Report back to the human with a summary\n\n"
            "2. When there's a conflict or risk:\n"
            "   a. Use create_escalation to flag it for the human\n"
            "   b. Include your recommendation and options\n\n"
            "3. Always keep the human informed via log_activity\n\n"
            "COMMUNICATION STYLE:\n"
            "- Be concise and professional\n"
            "- Report progress clearly\n"
            "- Highlight risks proactively\n"
            "- Always start by logging what you're about to do"
        ),
        tools=[
            update_agent_status,
            log_activity,
            create_escalation,
            list_tasks,
            get_sprint_info,
            pm_agent.as_tool(
                tool_name="delegate_to_pm",
                tool_description=(
                    "Delegate to the Project Manager to break down a feature request "
                    "into tasks. Describe the feature clearly."
                ),
            ),
            scrum_master_agent.as_tool(
                tool_name="delegate_to_scrum_master",
                tool_description=(
                    "Delegate to the Scrum Master to coordinate sprint execution. "
                    "Tell them which tasks to work on and in what order."
                ),
            ),
        ],
    )
