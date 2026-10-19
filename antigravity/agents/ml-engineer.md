---
name: ml-engineer
description: "Machine learning engineering specialist for designing, training, evaluating, and shipping production ML models. Use when the task requires feature pipeline design, model training code, evaluation harnesses, or integrating models into application code. For example: building a classifier training pipeline, wiring a model behind a REST endpoint, or reproducing a paper's baseline."
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

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["ml-engineer"])` to read the full methodology at delegation time.
