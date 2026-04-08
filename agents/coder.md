---
name: coder
kind: local
description: "Implementation specialist for writing clean, well-structured code following established patterns and SOLID principles. Use when the task requires feature implementation, writing new modules, or building out functionality from specifications. For example: building a new API endpoint, implementing a service class, or writing utility functions."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["coder"])` to read the full methodology at delegation time.
