---
name: security-engineer
description: "Security engineering specialist for vulnerability assessment, threat modeling, and security best practices. Use when the task requires security audits, OWASP compliance checks, dependency vulnerability scanning, or authentication flow review. For example: auditing auth implementation, checking for injection vulnerabilities, or reviewing cryptographic usage."
color: red
tools: [read_file, list_directory, glob, grep_search, run_shell_command, google_web_search, read_many_files, web_fetch, write_todos, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, run_shell_command, google_web_search, read_many_files, web_fetch, write_todos, ask_user]
tools.claude: [Read, Bash, Glob, Grep, WebSearch, WebFetch, TaskCreate, TaskUpdate, TaskList]
max_turns: 20
temperature: 0.2
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["security-engineer"])` to read the full methodology at delegation time.
