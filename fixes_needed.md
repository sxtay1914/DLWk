# Fixes Needed

## 1. Scrum Master gets stuck during execution
- SM assigns tasks but then stalls — doesn't call `run_agents_parallel` or gets stuck mid-workflow
- Other agents sit idle while SM is "working"
- Need to debug SM prompt + tool call flow — may need to simplify SM instructions or reduce max_turns
- Possible cause: SM tries to do too much in one turn, hits token/turn limits before reaching `run_agents_parallel`

## 2. Agent chat doesn't enforce roles or route properly
- Clicking an agent (e.g. QA) and asking to add a feature should trigger a clear role-boundary response + route to Boss
- Currently: agent either doesn't respond cleanly, gives a generic reply, or silently fails
- `route_to_boss` tool may not be firing, or the chat agent instructions aren't strong enough
- Need to verify `/api/chat/{agent_id}` endpoint actually runs the agent (not just returning canned text)
- Test: click QA → "add a login page" → QA should say "that's not my job, routing to Boss"

## 3. Agent chat panel doesn't persist conversation
- Opening an agent modal, sending a message, closing, and reopening shows empty chat
- Chat history per agent is not stored — needs frontend state or backend session tracking per agent
- Should persist at least within the same browser session

## 4. General agent responsiveness
- Agents should feel alive — respond quickly, stream text, show typing indicators
- Currently feels sluggish or unresponsive when chatting with individual agents
