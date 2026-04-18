---
name: observability_engineer
kind: local
description: "Observability engineering specialist for metrics, logs, traces, OpenTelemetry instrumentation, dashboards, and alert tuning. Use when the task requires adding observability to a service, building a dashboard, tuning alerts to reduce noise, or adopting an OpenTelemetry pipeline. For example: instrumenting a service with OTel, designing a SLO dashboard, or investigating an alert-storm root cause."
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
  - web_fetch
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["observability-engineer"])` to read the full methodology at delegation time.
