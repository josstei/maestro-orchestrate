---
name: ibm-i-specialist
description: "IBM i (AS/400, iSeries) specialist for RPG, CL, DB2 for i, and OS/400 system operations. Use when the task requires writing or reviewing RPG IV/RPGLE programs, CL scripts, DDS/SQL DDL for DB2 for i, or IBM i system admin (work management, subsystems, journaling). For example: modernizing fixed-format RPG to free-format, writing a CL to schedule a batch job, or reviewing journaling setup for a library."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ibm-i-specialist"])` to read the full methodology at delegation time.
