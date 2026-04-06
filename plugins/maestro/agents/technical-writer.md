---
name: technical-writer
description: "Technical writing specialist for documentation, API references, and architectural diagrams. Use when the task requires writing README files, API documentation, architecture decision records, or inline documentation. For example: writing an OpenAPI description, creating a getting-started guide, or documenting module interfaces."
color: green
tools: [read_file, list_directory, glob, grep_search, write_file, replace, read_many_files, google_web_search, ask_user, write_todos]
tools.gemini: [read_file, list_directory, glob, grep_search, write_file, replace, read_many_files, google_web_search, ask_user, write_todos]
tools.claude: [Read, Write, Edit, Glob, Grep, WebSearch, TaskCreate, TaskUpdate, TaskList]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["technical-writer"])` to read the full methodology at delegation time.
