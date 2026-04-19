---
name: site_reliability_engineer
kind: local
description: "Site reliability engineering specialist for SLOs, error budgets, capacity planning, runbooks, and postmortems. Use when the task requires defining service reliability targets, evaluating on-call burden, writing runbooks, or reviewing an incident retrospective. For example: defining SLIs/SLOs for a new service, auditing an existing error budget policy, or drafting a runbook for a known failure mode."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - google_web_search
  - read_many_files
  - write_todos
  - ask_user
  - web_fetch
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["site-reliability-engineer"])` to read the full methodology at delegation time.
