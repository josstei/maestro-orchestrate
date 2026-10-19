---
name: ux-designer
description: "UX designer for user flow design, interaction patterns, wireframe descriptions, and usability evaluation. Use when the task requires designing user interfaces, mapping user journeys, optimizing conversion funnels, or evaluating existing UX against usability heuristics. For example: designing an onboarding flow, wireframing a dashboard layout, or auditing checkout abandonment."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - write_to_file
  - replace_file_content
  - search_web
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ux-designer"])` to read the full methodology at delegation time.
