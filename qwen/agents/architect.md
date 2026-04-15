---
name: architect
kind: local
description: "System design specialist for architecture decisions, technology selection, and high-level component design. Use when the task requires evaluating architectural trade-offs, designing system components, selecting technology stacks, or planning service boundaries. For example: microservice decomposition, database schema design, or API contract planning."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - web_search
  - read_many_files
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["architect"])` to read the full methodology at delegation time.
