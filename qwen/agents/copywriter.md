---
name: copywriter
kind: local
description: "Marketing copywriter for persuasive content, landing pages, CTAs, and brand voice consistency. Use when the task requires writing marketing copy, product descriptions, email campaigns, or user-facing content that drives action. For example: writing landing page hero text, crafting email subject lines, or creating product feature descriptions."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["copywriter"])` to read the full methodology at delegation time.
