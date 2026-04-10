---
name: accessibility-specialist
description: "Accessibility specialist for WCAG compliance auditing, ARIA implementation review, keyboard navigation testing, and inclusive design assessment. Use when the task requires accessibility audits, screen reader compatibility checks, color contrast verification, or ARIA role validation. For example: auditing a web app for WCAG 2.1 AA compliance, reviewing keyboard navigation in modal dialogs, or validating ARIA usage in custom components."
color: violet
tools: [read_file, list_directory, glob, grep_search, run_shell_command, google_web_search, write_todos, read_many_files, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, run_shell_command, google_web_search, write_todos, read_many_files, ask_user]
tools.claude: [Read, Bash, Glob, Grep, WebSearch, TaskCreate, TaskUpdate, TaskList]
max_turns: 20
temperature: 0.2
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["accessibility-specialist"])` to read the full methodology at delegation time.
