---
name: content-strategist
description: "Content strategy specialist for content planning, editorial calendars, audience targeting, and content gap analysis. Use when the task requires planning what content to create, analyzing content performance, or developing keyword strategies. For example: building an editorial calendar, conducting content gap analysis, or defining content pillars for a product launch."
color: amber
tools: [read_file, list_directory, glob, grep_search, google_web_search, web_fetch, read_many_files, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, google_web_search, web_fetch, read_many_files, ask_user]
tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["content-strategist"])` to read the full methodology at delegation time.
