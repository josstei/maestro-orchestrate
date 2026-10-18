---
name: solutions-architect
description: "Solutions architecture specialist for enterprise integration patterns, vendor systems, cross-team architecture, and target-state design. Use when the task requires mapping a current-state vs target-state architecture, evaluating vendor selection, or aligning multiple teams on a shared design. For example: designing an integration between SAP and a new CRM, mapping a strangler-fig path from monolith to services, or producing an ADR for a cross-organization capability."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["solutions-architect"])` to read the full methodology at delegation time.
