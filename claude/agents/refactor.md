---
name: refactor
description: |
  Refactoring specialist for codebase modernization, structural improvements, and technical debt reduction. Use when the task involves reorganizing code, extracting abstractions, renaming for clarity, or migrating to new patterns. For example: extracting a service layer, converting callbacks to async/await, or splitting a monolithic module.
  
  <example>
  Context: User wants to improve code structure without changing behavior.
  user: "Refactor our user service to extract the notification logic into a separate module"
  assistant: "I'll restructure the code to separate concerns without changing behavior, verifying behavior preservation with the project's test suite."
  <commentary>
  Refactor is appropriate for structural improvements — behavior must be preserved, validated by tests.
  </commentary>
  </example>
  <example>
  Context: User needs to reduce technical debt or improve maintainability.
  user: "The auth module has grown too large and is hard to test — clean it up"
  assistant: "I'll analyze the current structure, identify separation opportunities, and refactor in small steps while verifying each step preserves behavior."
  <commentary>
  Refactor handles maintainability improvements with a strict no-behavior-change constraint.
  </commentary>
  </example>
model: inherit
color: cyan
maxTurns: 25
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - TaskCreate
  - TaskUpdate
  - TaskList
  - Skill
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["refactor"])` to read the full methodology at delegation time.
