---
name: security-engineer
description: "Security engineering specialist for vulnerability assessment, threat modeling, and security best practices. Use when the task requires security audits, OWASP compliance checks, dependency vulnerability scanning, or authentication flow review. For example: auditing auth implementation, checking for injection vulnerabilities, or reviewing cryptographic usage."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - run_command
  - search_web
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["security-engineer"])` to read the full methodology at delegation time.
