---
name: code-reviewer
description: |
  Code review specialist for identifying bugs, security vulnerabilities, and code quality issues. Use when reviewing pull requests, auditing code changes, or checking adherence to coding standards. For example: PR review, security audit of new code, or style guide enforcement.
  
  <example>
  Context: User wants a code review before merging or shipping.
  user: "Review the authentication service implementation for correctness and quality"
  assistant: "I'll review the implementation for correctness, SOLID principles, error handling, security concerns, and consistency with established patterns."
  <commentary>
  Code Reviewer is appropriate for review tasks — read-only analysis and recommendations.
  </commentary>
  </example>
  <example>
  Context: User needs a second opinion on implementation decisions.
  user: "Can you check if our new API layer follows our conventions?"
  assistant: "I'll read the existing codebase patterns and compare against the new API layer, identifying any deviations with specific line references."
  <commentary>
  Code Reviewer handles convention audits and targeted feedback.
  </commentary>
  </example>
model: inherit
color: blue
maxTurns: 15
tools:
  - Read
  - Glob
  - Grep
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["code-reviewer"])` to read the full methodology at delegation time.
