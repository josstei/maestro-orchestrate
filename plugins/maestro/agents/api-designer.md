---
name: api-designer
description: "API design specialist for endpoint design, request/response contracts, and API versioning strategies. Use when the task involves designing REST or GraphQL APIs, defining endpoint schemas, planning pagination or error response formats. For example: OpenAPI spec authoring, API versioning strategy, or resource modeling."
color: cyan
tools: [read_file, list_directory, glob, grep_search, read_many_files, ask_user, google_web_search, web_fetch]
tools.gemini: [read_file, list_directory, glob, grep_search, read_many_files, ask_user, google_web_search, web_fetch]
tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["api-designer"])` to read the full methodology at delegation time.
