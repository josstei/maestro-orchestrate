---
name: devops-engineer
description: "DevOps specialist for CI/CD pipelines, containerization, deployment automation, and infrastructure configuration. Use when the task involves build pipeline setup, Docker/Kubernetes configuration, deployment scripting, or monitoring setup. For example: writing a GitHub Actions workflow, creating a Dockerfile, or configuring Terraform."
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
  - search_web
  - read_url_content
  - ask_question
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["devops-engineer"])` to read the full methodology at delegation time.
