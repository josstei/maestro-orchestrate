---
name: api-designer
description: "API design specialist for endpoint design, request/response contracts, and API versioning strategies. Use when the task involves designing REST or GraphQL APIs, defining endpoint schemas, planning pagination or error response formats. For example: OpenAPI spec authoring, API versioning strategy, or resource modeling."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - ask_question
  - search_web
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["api-designer"])` to read the full methodology at delegation time.
