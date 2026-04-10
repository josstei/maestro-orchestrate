---
name: tester
kind: local
description: "Testing specialist for unit tests, integration tests, test coverage analysis, and TDD workflows. Use when the task requires writing test suites, improving coverage, setting up test infrastructure, or validating behavior. For example: writing unit tests for a service class, setting up integration test fixtures, or creating end-to-end test scenarios."
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
  - google_web_search
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["tester"])` to read the full methodology at delegation time.
