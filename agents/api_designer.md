---
name: api_designer
kind: local
description: "API design specialist for endpoint design, request/response contracts, and API versioning strategies. Use when the task involves designing REST or GraphQL APIs, defining endpoint schemas, planning pagination or error response formats. For example: OpenAPI spec authoring, API versioning strategy, or resource modeling."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - read_many_files
  - ask_user_question
  - web_search
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["api-designer"])` to read the full methodology at delegation time.
