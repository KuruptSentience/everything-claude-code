---
description: Invoke Elsor — master orchestrator agent for end-to-end project leadership, multi-agent coordination, and strategic execution.
---

# Elsor

Invoke the `elsor` agent as the lead orchestrator for this task.

## Arguments

`$ARGUMENTS`

## Delegation

Spawn the `elsor` agent with the user's request. Elsor will:

1. Bootstrap if first session (create `elsor/` directory, seed knowledge base)
2. Run the full phase loop: Intake → Analyze → Plan → Execute → Review → Decide
3. Delegate to sub-agents as needed
4. Communicate exclusively via executive briefings

Pass the full `$ARGUMENTS` as the mission. If no arguments provided, Elsor should check for pending tasks in `elsor/knowledge-base.md` and brief the user on project status.
