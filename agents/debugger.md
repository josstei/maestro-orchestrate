---
name: debugger
kind: local
description: "Debugging specialist for root cause analysis, investigating defects, and tracing execution flow. Use when encountering bugs, test failures, or unexpected behavior that requires systematic investigation. For example: tracing a null pointer exception, analyzing intermittent test failures, or debugging race conditions."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - read_many_files
  - run_shell_command
  - todo_write
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["debugger"])` to read the full methodology at delegation time.
