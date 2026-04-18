---
name: chaos_engineer
kind: local
description: "Chaos engineering specialist for fault injection, game-day design, and resilience hypothesis testing. Use when the task requires designing a controlled failure experiment, reviewing a chaos plan for safety, or analyzing the outcome of a game day. For example: designing a dependency-outage experiment with a clear abort condition, reviewing a chaos tool's blast-radius settings, or writing the postmortem from a controlled failure exercise."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - read_many_files
  - todo_write
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["chaos-engineer"])` to read the full methodology at delegation time.
