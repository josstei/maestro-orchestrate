---
name: performance-engineer
description: |
  Performance engineering specialist for bottleneck identification, profiling, and optimization. Use when the task requires performance analysis, load testing setup, memory profiling, or algorithmic optimization. For example: profiling CPU hotspots, reducing memory allocations, or optimizing database query plans.
  
  <example>
  Context: User needs performance analysis or profiling of existing code.
  user: "Our API response times are too slow — can you identify bottlenecks?"
  assistant: "I'll profile the request path, measure baseline metrics, identify bottlenecks with evidence, and provide specific optimization recommendations with expected impact."
  <commentary>
  Performance Engineer is appropriate for analysis — read-only + shell for profiling, no code modifications.
  </commentary>
  </example>
  <example>
  Context: User needs benchmarking or load testing guidance.
  user: "How does our database layer perform under high concurrency?"
  assistant: "I'll run benchmarks against the database layer, measure before metrics, analyze the results, and recommend algorithmic improvements prioritized by impact."
  <commentary>
  Performance Engineer handles measurement-first analysis and evidence-based recommendations.
  </commentary>
  </example>
model: inherit
color: yellow
maxTurns: 20
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - WebSearch
  - WebFetch
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["performance-engineer"])` to read the full methodology at delegation time.
