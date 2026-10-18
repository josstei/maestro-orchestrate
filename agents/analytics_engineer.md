---
name: analytics_engineer
kind: local
description: "Analytics engineering specialist for event tracking implementation, analytics schemas, conversion funnels, A/B test design, and measurement planning. Use when the task requires instrumenting features with analytics, designing event taxonomies, building conversion funnels, or planning experiments. For example: adding event tracking to a checkout flow, designing an A/B test for a pricing page, or defining KPI dashboards."
max_turns: 25
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - run_shell_command
  - web_search
  - todo_write
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["analytics-engineer"])` to read the full methodology at delegation time.
