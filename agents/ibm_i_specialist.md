---
name: ibm_i_specialist
kind: local
description: "IBM i (AS/400, iSeries) specialist for RPG, CL, DB2 for i, and OS/400 system operations. Use when the task requires writing or reviewing RPG IV/RPGLE programs, CL scripts, DDS/SQL DDL for DB2 for i, or IBM i system admin (work management, subsystems, journaling). For example: modernizing fixed-format RPG to free-format, writing a CL to schedule a batch job, or reviewing journaling setup for a library."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - run_shell_command
  - write_todos
  - read_many_files
  - ask_user
  - google_web_search
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ibm-i-specialist"])` to read the full methodology at delegation time.
