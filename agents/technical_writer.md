---
name: technical_writer
kind: local
description: "Technical writing specialist for documentation, API references, and architectural diagrams. Use when the task requires writing README files, API documentation, architecture decision records, or inline documentation. For example: writing an OpenAPI description, creating a getting-started guide, or documenting module interfaces."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - read_many_files
  - web_search
  - ask_user_question
  - todo_write
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["technical-writer"])` to read the full methodology at delegation time.
