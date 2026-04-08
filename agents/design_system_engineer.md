---
name: design_system_engineer
kind: local
description: "Design system engineering specialist for design tokens, component API contracts, theming architecture, CSS architecture, style consistency, and visual regression strategy. Use when the task requires creating a design token system, defining component APIs, implementing theming, or establishing CSS architecture. For example: setting up a token hierarchy with light/dark themes, designing the prop interface for a component library, or implementing a token-to-CSS pipeline."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - run_shell_command
  - write_todos
  - activate_skill
  - read_many_files
  - ask_user
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["design-system-engineer"])` to read the full methodology at delegation time.
