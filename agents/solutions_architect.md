---
name: solutions_architect
kind: local
description: "Solutions architecture specialist for enterprise integration patterns, vendor systems, cross-team architecture, and target-state design. Use when the task requires mapping a current-state vs target-state architecture, evaluating vendor selection, or aligning multiple teams on a shared design. For example: designing an integration between SAP and a new CRM, mapping a strangler-fig path from monolith to services, or producing an ADR for a cross-organization capability."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - google_web_search
  - read_many_files
  - ask_user
  - web_fetch
temperature: 0.3
max_turns: 15
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["solutions-architect"])` to read the full methodology at delegation time.
