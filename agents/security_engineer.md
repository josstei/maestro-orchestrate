---
name: security_engineer
kind: local
description: "Security engineering specialist for vulnerability assessment, threat modeling, and security best practices. Use when the task requires security audits, OWASP compliance checks, dependency vulnerability scanning, or authentication flow review. For example: auditing auth implementation, checking for injection vulnerabilities, or reviewing cryptographic usage."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - read_many_files
  - web_fetch
  - todo_write
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["security-engineer"])` to read the full methodology at delegation time.
