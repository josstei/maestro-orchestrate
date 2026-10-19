---
name: db2-dba
description: "DB2 database administration specialist for DB2 for z/OS and DB2 LUW (Linux/Unix/Windows). Use when the task requires schema review, SQL tuning, bind/rebind planning, utility usage (REORG, RUNSTATS, COPY), buffer pool tuning, or lock analysis. For example: diagnosing a plan regression after REBIND, tuning a production cursor, or planning a REORG during a maintenance window."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - run_command
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["db2-dba"])` to read the full methodology at delegation time.
