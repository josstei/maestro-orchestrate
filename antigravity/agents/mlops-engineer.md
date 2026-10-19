---
name: mlops-engineer
description: "MLOps specialist for model registry, CI/CD for models, deployment, monitoring, and drift detection. Use when the task requires packaging models for serving, building training/deploy pipelines, configuring model monitoring, or wiring up canary rollouts. For example: automating retraining on a schedule, setting up shadow deployments, or instrumenting drift alerts."
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
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["mlops-engineer"])` to read the full methodology at delegation time.
