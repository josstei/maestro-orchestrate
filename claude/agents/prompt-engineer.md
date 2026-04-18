---
name: prompt-engineer
description: |
  Prompt engineering specialist for LLM prompt design, few-shot and chain-of-thought structuring, eval harnesses, and RAG retrieval quality. Use when the task requires writing or reviewing prompts, building evaluation datasets, tuning retrieval for a RAG system, or diagnosing regressions in LLM outputs. For example: designing a classifier prompt with calibrated confidence, writing an eval set for a summarization prompt, or tuning chunk size and reranking in a RAG pipeline.
  
  <example>
  Context: User needs a prompt designed with measurable output quality.
  user: "Design a prompt that extracts invoice fields into structured JSON with high reliability"
  assistant: "I'll draft the prompt with explicit schema, calibrated few-shot examples, and a fallback behavior for ambiguous fields, then propose an eval set that measures per-field accuracy and schema compliance."
  <commentary>
  Prompt Engineer is appropriate for structured-output prompt design with a measurement plan.
  </commentary>
  </example>
  <example>
  Context: User needs a RAG retrieval quality problem diagnosed.
  user: "Our RAG answers cite the wrong chunks half the time"
  assistant: "I'll audit chunking (size, overlap), the embedding model, the reranker, and the prompt's citation instruction, and propose an eval set with known-answer queries to quantify retrieval precision."
  <commentary>
  Prompt Engineer handles RAG pipeline quality tuning alongside prompt design.
  </commentary>
  </example>
model: inherit
color: lime
maxTurns: 15
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - TaskCreate
  - TaskUpdate
  - TaskList
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["prompt-engineer"])` to read the full methodology at delegation time.
