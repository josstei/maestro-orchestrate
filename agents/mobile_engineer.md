---
name: mobile_engineer
kind: local
description: "Mobile engineering specialist for iOS, Android, React Native, and Flutter feature work. Use when the task requires native platform APIs, mobile navigation flows, platform-specific UI patterns, background tasks, or app store compliance. For example: building a push notification handler, wiring biometric auth, implementing deep links, or diagnosing a platform-specific crash."
max_turns: 25
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - run_shell_command
  - todo_write
  - skill
  - read_many_files
  - ask_user_question
  - web_search
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["mobile-engineer"])` to read the full methodology at delegation time.
