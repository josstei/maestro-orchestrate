---
name: db2_dba
kind: local
description: "DB2 database administration specialist for DB2 for z/OS and DB2 LUW (Linux/Unix/Windows). Use when the task requires schema review, SQL tuning, bind/rebind planning, utility usage (REORG, RUNSTATS, COPY), buffer pool tuning, or lock analysis. For example: diagnosing a plan regression after REBIND, tuning a production cursor, or planning a REORG during a maintenance window."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - google_web_search
  - read_many_files
  - write_todos
  - ask_user
  - web_fetch
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["db2-dba"])` to read the full methodology at delegation time.
