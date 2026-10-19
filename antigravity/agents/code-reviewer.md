---
name: code-reviewer
description: "Code review specialist for identifying bugs, security vulnerabilities, and code quality issues. Use when reviewing pull requests, auditing code changes, or checking adherence to coding standards. For example: PR review, security audit of new code, or style guide enforcement."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["code-reviewer"])` to read the full methodology at delegation time.
