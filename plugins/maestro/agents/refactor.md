---
name: refactor
description: "Refactoring specialist for codebase modernization, structural improvements, and technical debt reduction. Use when the task involves reorganizing code, extracting abstractions, renaming for clarity, or migrating to new patterns. For example: extracting a service layer, converting callbacks to async/await, or splitting a monolithic module."
color: cyan
tools: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, write_todos, activate_skill, read_many_files, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, write_file, replace, run_shell_command, write_todos, activate_skill, read_many_files, ask_user]
tools.claude: [Read, Write, Edit, Bash, Glob, Grep, TaskCreate, TaskUpdate, TaskList, Skill]
max_turns: 25
temperature: 0.2
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["refactor"])` to read the full methodology at delegation time.
