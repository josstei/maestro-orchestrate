---
name: refactor
description: "Refactoring specialist for codebase modernization, structural improvements, and technical debt reduction. Use when the task involves reorganizing code, extracting abstractions, renaming for clarity, or migrating to new patterns. For example: extracting a service layer, converting callbacks to async/await, or splitting a monolithic module."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["refactor"])` to read the full methodology at delegation time.
