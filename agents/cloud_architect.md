---
name: cloud_architect
kind: local
description: "Cloud architecture specialist for AWS, GCP, and Azure topology design, IaC patterns, multi-region resilience, and cost/security trade-offs. Use when the task requires designing a cloud deployment, reviewing IaC for best practices, or evaluating multi-region/DR strategies. For example: choosing between ECS and EKS, designing a VPC topology, or evaluating a CDN/edge-compute strategy."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - web_search
  - read_many_files
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["cloud-architect"])` to read the full methodology at delegation time.
