---
name: ibm_i_specialist
kind: local
description: "IBM i (AS/400, iSeries) specialist for RPG, CL, DB2 for i, and OS/400 system operations. Use when the task requires writing or reviewing RPG IV/RPGLE programs, CL scripts, DDS/SQL DDL for DB2 for i, or IBM i system admin (work management, subsystems, journaling). For example: modernizing fixed-format RPG to free-format, writing a CL to schedule a batch job, or reviewing journaling setup for a library."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ibm-i-specialist"])` to read the full methodology at delegation time.
