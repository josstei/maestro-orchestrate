---
name: content-strategist
description: "Content strategy specialist for content planning, editorial calendars, audience targeting, and content gap analysis. Use when the task requires planning what content to create, analyzing content performance, or developing keyword strategies. For example: building an editorial calendar, conducting content gap analysis, or defining content pillars for a product launch."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - search_web
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["content-strategist"])` to read the full methodology at delegation time.
