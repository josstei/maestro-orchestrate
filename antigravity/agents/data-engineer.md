---
name: data-engineer
description: "Data engineering specialist for schema design, query optimization, ETL pipelines, and data modeling. Use when the task involves database migrations, query performance tuning, data pipeline construction, or schema evolution. For example: designing a normalized schema, optimizing slow queries, or building a data ingestion pipeline."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["data-engineer"])` to read the full methodology at delegation time.
