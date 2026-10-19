---
name: database-administrator
description: "Database administration specialist for RDBMS schema review, query tuning, index strategy, and migration safety on PostgreSQL, MySQL, SQL Server, and Oracle. Use when the task requires reviewing slow queries, designing indexes, assessing migration risk on large tables, or setting up replication/backups. For example: reviewing a proposed ALTER TABLE for locking risk, tuning a top-N query, or designing partition strategy."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["database-administrator"])` to read the full methodology at delegation time.
