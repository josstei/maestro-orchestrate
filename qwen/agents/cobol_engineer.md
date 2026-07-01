---
name: cobol_engineer
kind: local
description: "COBOL engineering specialist for mainframe program development, maintenance, and modernization on z/OS. Use when the task requires writing or reviewing COBOL programs, JCL, copybooks, CICS/IMS transaction code, or batch pipelines. For example: implementing a new batch job, refactoring a monolithic COBOL program, or reviewing a copybook change for binary compatibility."
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
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["cobol-engineer"])` to read the full methodology at delegation time.
