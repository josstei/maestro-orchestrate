---
name: content_strategist
kind: local
description: "Content strategy specialist for content planning, editorial calendars, audience targeting, and content gap analysis. Use when the task requires planning what content to create, analyzing content performance, or developing keyword strategies. For example: building an editorial calendar, conducting content gap analysis, or defining content pillars for a product launch."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - web_search
  - web_fetch
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["content-strategist"])` to read the full methodology at delegation time.
