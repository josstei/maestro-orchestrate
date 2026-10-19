---
name: design-system-engineer
description: "Design system engineering specialist for design tokens, component API contracts, theming architecture, CSS architecture, style consistency, and visual regression strategy. Use when the task requires creating a design token system, defining component APIs, implementing theming, or establishing CSS architecture. For example: setting up a token hierarchy with light/dark themes, designing the prop interface for a component library, or implementing a token-to-CSS pipeline."
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
  - run_command
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["design-system-engineer"])` to read the full methodology at delegation time.
