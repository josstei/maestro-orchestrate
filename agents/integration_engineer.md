---
name: integration_engineer
kind: local
description: "Integration engineering specialist for B2B/API integration, ETL between systems, message brokers, and EDI/flat-file exchanges. Use when the task requires connecting two systems with different data models, building a reliable pipeline across a broker (Kafka, RabbitMQ, MQ), or implementing an EDI/flat-file interface with a legacy partner. For example: wiring an outbound webhook with retry semantics, authoring an ETL job with idempotent merge, or implementing an EDI 850 inbound flow."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - run_shell_command
  - write_todos
  - activate_skill
  - read_many_files
  - ask_user
  - google_web_search
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["integration-engineer"])` to read the full methodology at delegation time.
