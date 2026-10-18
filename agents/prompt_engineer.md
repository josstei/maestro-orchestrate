---
name: prompt_engineer
kind: local
description: "Prompt engineering specialist for LLM prompt design, few-shot and chain-of-thought structuring, eval harnesses, and RAG retrieval quality. Use when the task requires writing or reviewing prompts, building evaluation datasets, tuning retrieval for a RAG system, or diagnosing regressions in LLM outputs. For example: designing a classifier prompt with calibrated confidence, writing an eval set for a summarization prompt, or tuning chunk size and reranking in a RAG pipeline."
max_turns: 15
tools:
  - read_file
  - list_directory
  - glob
  - grep_search
  - write_file
  - edit
  - read_many_files
  - web_search
  - todo_write
  - ask_user_question
  - web_fetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["prompt-engineer"])` to read the full methodology at delegation time.
