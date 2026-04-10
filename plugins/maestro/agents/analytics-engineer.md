---
name: analytics-engineer
description: "Analytics engineering specialist for event tracking implementation, analytics schemas, conversion funnels, A/B test design, and measurement planning. Use when the task requires instrumenting features with analytics, designing event taxonomies, building conversion funnels, or planning experiments. For example: adding event tracking to a checkout flow, designing an A/B test for a pricing page, or defining KPI dashboards."
color: olive
tools: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, google_web_search, write_todos, read_many_files, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, google_web_search, write_todos, read_many_files, ask_user]
tools.claude: [Read, Write, Edit, Bash, Glob, Grep, WebSearch, TaskCreate, TaskUpdate, TaskList]
max_turns: 25
temperature: 0.2
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["analytics-engineer"])` to read the full methodology at delegation time.
