---
name: hlasm_assembler_specialist
kind: local
description: "IBM High-Level Assembler (HLASM) specialist for z/OS. Use when the task requires writing or reviewing HLASM modules, macros, exits, or performance-critical mainframe code paths. For example: authoring a user SVC, reviewing a system exit, writing a macro for a shared copybook convention, or diagnosing an S0Cx abend from the compile listing and PSW."
max_turns: 25
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - run_shell_command
  - todo_write
  - read_many_files
  - ask_user_question
  - web_search
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["hlasm-assembler-specialist"])` to read the full methodology at delegation time.
