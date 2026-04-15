---
name: accessibility_specialist
kind: local
description: "Accessibility specialist for WCAG compliance auditing, ARIA implementation review, keyboard navigation testing, and inclusive design assessment. Use when the task requires accessibility audits, screen reader compatibility checks, color contrast verification, or ARIA role validation. For example: auditing a web app for WCAG 2.1 AA compliance, reviewing keyboard navigation in modal dialogs, or validating ARIA usage in custom components."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - todo_write
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["accessibility-specialist"])` to read the full methodology at delegation time.
