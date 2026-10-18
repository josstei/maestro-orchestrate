---
name: database_administrator
kind: local
description: "Database administration specialist for RDBMS schema review, query tuning, index strategy, and migration safety on PostgreSQL, MySQL, SQL Server, and Oracle. Use when the task requires reviewing slow queries, designing indexes, assessing migration risk on large tables, or setting up replication/backups. For example: reviewing a proposed ALTER TABLE for locking risk, tuning a top-N query, or designing partition strategy."
max_turns: 20
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - run_shell_command
  - web_search
  - read_many_files
  - todo_write
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["database-administrator"])` to read the full methodology at delegation time.
