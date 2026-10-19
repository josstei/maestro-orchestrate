---
name: site-reliability-engineer
description: "Site reliability engineering specialist for SLOs, error budgets, capacity planning, runbooks, and postmortems. Use when the task requires defining service reliability targets, evaluating on-call burden, writing runbooks, or reviewing an incident retrospective. For example: defining SLIs/SLOs for a new service, auditing an existing error budget policy, or drafting a runbook for a known failure mode."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - run_command
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["site-reliability-engineer"])` to read the full methodology at delegation time.
