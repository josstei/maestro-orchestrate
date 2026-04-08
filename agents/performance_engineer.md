---
name: performance_engineer
kind: local
description: "Performance engineering specialist for bottleneck identification, profiling, and optimization. Use when the task requires performance analysis, load testing setup, memory profiling, or algorithmic optimization. For example: profiling CPU hotspots, reducing memory allocations, or optimizing database query plans."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - read_many_files
  - run_shell_command
  - google_web_search
  - write_todos
  - web_fetch
  - ask_user
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["performance-engineer"])` to read the full methodology at delegation time.
