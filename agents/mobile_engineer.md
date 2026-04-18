---
name: mobile_engineer
kind: local
description: "Mobile engineering specialist for iOS, Android, React Native, and Flutter feature work. Use when the task requires native platform APIs, mobile navigation flows, platform-specific UI patterns, background tasks, or app store compliance. For example: building a push notification handler, wiring biometric auth, implementing deep links, or diagnosing a platform-specific crash."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["mobile-engineer"])` to read the full methodology at delegation time.
