---
name: code_reviewer
kind: local
description: "Code review specialist for identifying bugs, security vulnerabilities, and code quality issues. Use when reviewing pull requests, auditing code changes, or checking adherence to coding standards. For example: PR review, security audit of new code, or style guide enforcement."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - read_many_files
  - ask_user_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["code-reviewer"])` to read the full methodology at delegation time.
