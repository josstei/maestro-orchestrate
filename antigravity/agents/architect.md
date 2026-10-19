---
name: architect
description: "System design specialist for architecture decisions, technology selection, and high-level component design. Use when the task requires evaluating architectural trade-offs, designing system components, selecting technology stacks, or planning service boundaries. For example: microservice decomposition, database schema design, or API contract planning."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["architect"])` to read the full methodology at delegation time.
