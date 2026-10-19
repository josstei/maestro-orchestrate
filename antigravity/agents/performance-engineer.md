---
name: performance-engineer
description: "Performance engineering specialist for bottleneck identification, profiling, and optimization. Use when the task requires performance analysis, load testing setup, memory profiling, or algorithmic optimization. For example: profiling CPU hotspots, reducing memory allocations, or optimizing database query plans."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - run_command
  - search_web
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["performance-engineer"])` to read the full methodology at delegation time.
