---
name: perf-check
description: Run a Maestro-style performance assessment for hotspots, regressions, and optimization planning
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "delegation"].
Call `get_agent` with agents: ["performance-engineer"].

## Workflow

1. Define the performance target or pain point
2. Establish the current baseline from available code, metrics, or reproducible commands
3. Identify likely hotspots, structural bottlenecks, and hot loops through code analysis
4. Prioritize fixes by expected impact versus implementation cost
5. Report measurement gaps when hard evidence is unavailable and propose a validation plan
