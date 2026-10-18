---
name: platform_engineer
kind: local
description: "Platform engineering specialist for internal developer platforms, paved paths, golden templates, and self-service tooling. Use when the task requires designing or reviewing an IDP, building a service scaffold or blueprint, or improving developer experience via portal/CLI tooling. For example: designing a Backstage plugin, authoring a new service template, or reviewing a self-service environment provisioning flow."
max_turns: 25
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - run_shell_command
  - todo_write
  - skill
  - read_many_files
  - ask_user_question
  - web_search
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["platform-engineer"])` to read the full methodology at delegation time.
