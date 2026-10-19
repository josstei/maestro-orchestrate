---
name: cloud-architect
description: "Cloud architecture specialist for AWS, GCP, and Azure topology design, IaC patterns, multi-region resilience, and cost/security trade-offs. Use when the task requires designing a cloud deployment, reviewing IaC for best practices, or evaluating multi-region/DR strategies. For example: choosing between ECS and EKS, designing a VPC topology, or evaluating a CDN/edge-compute strategy."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["cloud-architect"])` to read the full methodology at delegation time.
