---
name: devops_engineer
kind: local
description: "DevOps specialist for CI/CD pipelines, containerization, deployment automation, and infrastructure configuration. Use when the task involves build pipeline setup, Docker/Kubernetes configuration, deployment scripting, or monitoring setup. For example: writing a GitHub Actions workflow, creating a Dockerfile, or configuring Terraform."
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - replace
  - run_shell_command
  - google_web_search
  - write_todos
  - read_many_files
  - web_fetch
  - ask_user
temperature: 0.2
max_turns: 20
timeout_mins: 8
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["devops-engineer"])` to read the full methodology at delegation time.
