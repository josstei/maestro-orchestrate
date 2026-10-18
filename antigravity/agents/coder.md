---
name: coder
description: "Implementation specialist for writing clean, well-structured code following established patterns and SOLID principles. Use when the task requires feature implementation, writing new modules, or building out functionality from specifications. For example: building a new API endpoint, implementing a service class, or writing utility functions."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["coder"])` to read the full methodology at delegation time.
