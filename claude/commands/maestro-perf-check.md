---
description: Run a Maestro-style performance assessment for hotspots, regressions, and optimization planning
---


# Maestro Perf Check

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Define the performance target or pain point.
2. Establish the current baseline from available code, metrics, or reproducible commands.
3. Identify likely hotspots or structural bottlenecks.
4. Prioritize fixes by expected impact versus implementation cost.
5. Report measurement gaps when hard evidence is unavailable.

## Constraints

- Avoid optimization advice that is disconnected from the observed bottleneck.
- Distinguish measured issues from inferred ones.
