---
name: product-manager
description: "Product management specialist for requirements gathering, PRDs, user stories, feature prioritization, and competitive analysis. Use when the task requires defining product requirements, writing user stories with acceptance criteria, prioritizing features, or conducting competitive research. For example: writing a PRD for a new feature, prioritizing a backlog using RICE scoring, or defining acceptance criteria for user stories."
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
  - search_web
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["product-manager"])` to read the full methodology at delegation time.
