---
name: integration-engineer
description: "Integration engineering specialist for B2B/API integration, ETL between systems, message brokers, and EDI/flat-file exchanges. Use when the task requires connecting two systems with different data models, building a reliable pipeline across a broker (Kafka, RabbitMQ, MQ), or implementing an EDI/flat-file interface with a legacy partner. For example: wiring an outbound webhook with retry semantics, authoring an ETL job with idempotent merge, or implementing an EDI 850 inbound flow."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["integration-engineer"])` to read the full methodology at delegation time.
