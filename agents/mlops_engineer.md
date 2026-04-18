---
name: mlops_engineer
kind: local
description: "MLOps specialist for model registry, CI/CD for models, deployment, monitoring, and drift detection. Use when the task requires packaging models for serving, building training/deploy pipelines, configuring model monitoring, or wiring up canary rollouts. For example: automating retraining on a schedule, setting up shadow deployments, or instrumenting drift alerts."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["mlops-engineer"])` to read the full methodology at delegation time.
