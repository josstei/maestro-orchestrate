---
name: architect
description: "System design specialist for architecture decisions, technology selection, and high-level component design. Use when the task requires evaluating architectural trade-offs, designing system components, selecting technology stacks, or planning service boundaries. For example: microservice decomposition, database schema design, or API contract planning."
color: blue
tools: [read_file, list_directory, glob, grep_search, google_web_search, read_many_files, ask_user, web_fetch]
tools.gemini: [read_file, list_directory, glob, grep_search, google_web_search, read_many_files, ask_user, web_fetch]
tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["architect"])` to read the full methodology at delegation time.
