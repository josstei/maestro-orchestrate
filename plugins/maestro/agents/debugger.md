---
name: debugger
description: "Debugging specialist for root cause analysis, investigating defects, and tracing execution flow. Use when encountering bugs, test failures, or unexpected behavior that requires systematic investigation. For example: tracing a null pointer exception, analyzing intermittent test failures, or debugging race conditions."
color: red
tools: [read_file, list_directory, glob, grep_search, read_many_files, run_shell_command, write_todos, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, read_many_files, run_shell_command, write_todos, ask_user]
tools.claude: [Read, Bash, Glob, Grep]
max_turns: 20
temperature: 0.2
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["debugger"])` to read the full methodology at delegation time.
