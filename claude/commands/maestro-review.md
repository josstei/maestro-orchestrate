---
description: Perform a Maestro-style code review with findings ordered by severity and concrete file references
---


# Maestro Review

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Determine review scope in this order:
   - explicit user-provided paths
   - staged changes
   - last commit diff
2. Review for correctness, regressions, maintainability risk, and missing tests.
3. Present findings first, ordered by severity, with file and line references.
4. Keep the closing summary brief and only after findings.

## Constraints

- Do not bury findings behind a long overview.
- If no findings exist, say so explicitly and note residual testing gaps.
