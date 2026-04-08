---
name: compliance-reviewer
description: "Legal and regulatory compliance specialist for privacy auditing, GDPR/CCPA compliance, cookie consent implementation, data handling documentation, open-source license auditing, and terms of service review. Use when the task requires regulatory compliance assessment, privacy policy review, cookie consent architecture, or license compatibility checks. For example: auditing an app for GDPR compliance, designing cookie consent that satisfies ePrivacy, or checking open-source license compatibility."
color: maroon
tools: [read_file, list_directory, glob, grep_search, google_web_search, web_fetch, read_many_files, ask_user]
tools.gemini: [read_file, list_directory, glob, grep_search, google_web_search, web_fetch, read_many_files, ask_user]
tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]
max_turns: 15
temperature: 0.3
timeout_mins: 5
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["compliance-reviewer"])` to read the full methodology at delegation time.
