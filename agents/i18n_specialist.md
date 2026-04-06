---
name: i18n_specialist
kind: local
description: "Internationalization specialist for i18n architecture, string extraction, locale management, pluralization rules, RTL support, and date/number/currency formatting. Use when the task requires internationalizing an application, setting up locale file structures, extracting hardcoded strings, or adding right-to-left language support. For example: adding multi-language support to a React app, extracting strings for translator handoff, or implementing RTL layout for Arabic."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - run_shell_command
  - write_todos
  - read_many_files
  - ask_user
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["i18n-specialist"])` to read the full methodology at delegation time.
