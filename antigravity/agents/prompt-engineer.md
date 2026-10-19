---
name: prompt-engineer
description: "Prompt engineering specialist for LLM prompt design, few-shot and chain-of-thought structuring, eval harnesses, and RAG retrieval quality. Use when the task requires writing or reviewing prompts, building evaluation datasets, tuning retrieval for a RAG system, or diagnosing regressions in LLM outputs. For example: designing a classifier prompt with calibrated confidence, writing an eval set for a summarization prompt, or tuning chunk size and reranking in a RAG pipeline."
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
  - search_web
  - ask_question
  - read_url_content
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["prompt-engineer"])` to read the full methodology at delegation time.
