---
name: hlasm-assembler-specialist
description: "IBM High-Level Assembler (HLASM) specialist for z/OS. Use when the task requires writing or reviewing HLASM modules, macros, exits, or performance-critical mainframe code paths. For example: authoring a user SVC, reviewing a system exit, writing a macro for a shared copybook convention, or diagnosing an S0Cx abend from the compile listing and PSW."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - write_to_file
  - replace_file_content
  - run_command
  - ask_question
  - search_web
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["hlasm-assembler-specialist"])` to read the full methodology at delegation time.
