---
name: ux_designer
kind: local
description: "UX designer for user flow design, interaction patterns, wireframe descriptions, and usability evaluation. Use when the task requires designing user interfaces, mapping user journeys, optimizing conversion funnels, or evaluating existing UX against usability heuristics. For example: designing an onboarding flow, wireframing a dashboard layout, or auditing checkout abandonment."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - google_web_search
  - read_many_files
  - ask_user
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ux-designer"])` to read the full methodology at delegation time.
