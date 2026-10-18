---
name: technical-writer
description: "Technical writing specialist for documentation, API references, and architectural diagrams. Use when the task requires writing README files, API documentation, architecture decision records, or inline documentation. For example: writing an OpenAPI description, creating a getting-started guide, or documenting module interfaces."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["technical-writer"])` to read the full methodology at delegation time.
