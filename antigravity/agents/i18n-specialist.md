---
name: i18n-specialist
description: "Internationalization specialist for i18n architecture, string extraction, locale management, pluralization rules, RTL support, and date/number/currency formatting. Use when the task requires internationalizing an application, setting up locale file structures, extracting hardcoded strings, or adding right-to-left language support. For example: adding multi-language support to a React app, extracting strings for translator handoff, or implementing RTL layout for Arabic."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - write_to_file
  - replace_file_content
  - run_command
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["i18n-specialist"])` to read the full methodology at delegation time.
