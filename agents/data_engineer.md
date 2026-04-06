---
name: data_engineer
kind: local
description: "Data engineering specialist for schema design, query optimization, ETL pipelines, and data modeling. Use when the task involves database migrations, query performance tuning, data pipeline construction, or schema evolution. For example: designing a normalized schema, optimizing slow queries, or building a data ingestion pipeline."
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
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["data-engineer"])` to read the full methodology at delegation time.
