---
name: coder
description: |
  Implementation specialist for writing clean, well-structured code following established patterns and SOLID principles. Use when the task requires feature implementation, writing new modules, or building out functionality from specifications. For example: building a new API endpoint, implementing a service class, or writing utility functions.
  
  <example>
  Context: User needs a new feature implemented from a specification or design.
  user: "Implement the user authentication service based on the API contracts we just designed"
  assistant: "I'll implement the service following the interface-first workflow: types and contracts first, then dependencies before dependents, matching existing codebase patterns."
  <commentary>
  Coder is appropriate for feature implementation from a known specification.
  </commentary>
  </example>
  <example>
  Context: User needs new modules or utility code built out.
  user: "Build the repository layer for our User domain"
  assistant: "I'll read existing repository implementations first to extract patterns, then implement the User repository following the same conventions."
  <commentary>
  Coder handles implementation tasks that require pattern matching and code writing.
  </commentary>
  </example>
model: inherit
color: green
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["coder"])` to read the full methodology at delegation time.
