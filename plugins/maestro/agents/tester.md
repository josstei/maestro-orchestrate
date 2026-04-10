---
name: tester
description: "Testing specialist for unit tests, integration tests, test coverage analysis, and TDD workflows. Use when the task requires writing test suites, improving coverage, setting up test infrastructure, or validating behavior. For example: writing unit tests for a service class, setting up integration test fixtures, or creating end-to-end test scenarios."
color: magenta
tools: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, write_todos, activate_skill, read_many_files, ask_user, google_web_search]
tools.gemini: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, write_todos, activate_skill, read_many_files, ask_user, google_web_search]
tools.claude: [Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, Skill, WebSearch]
max_turns: 25
temperature: 0.2
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["tester"])` to read the full methodology at delegation time.
