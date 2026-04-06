---
name: debugger
kind: local
description: "Debugging specialist for root cause analysis, investigating defects, and tracing execution flow. Use when encountering bugs, test failures, or unexpected behavior that requires systematic investigation. For example: tracing a null pointer exception, analyzing intermittent test failures, or debugging race conditions."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - read_many_files
  - run_shell_command
  - write_todos
  - ask_user
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["debugger"])` to read the full methodology at delegation time.
