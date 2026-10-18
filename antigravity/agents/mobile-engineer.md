---
name: mobile-engineer
description: "Mobile engineering specialist for iOS, Android, React Native, and Flutter feature work. Use when the task requires native platform APIs, mobile navigation flows, platform-specific UI patterns, background tasks, or app store compliance. For example: building a push notification handler, wiring biometric auth, implementing deep links, or diagnosing a platform-specific crash."
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
  - search_web
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["mobile-engineer"])` to read the full methodology at delegation time.
