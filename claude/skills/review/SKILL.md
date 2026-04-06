---
name: review
description: Perform a Maestro-style code review with findings ordered by severity and concrete file references
---


# Maestro Review

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Protocol

Before delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.

## Workflow

1. Determine review scope: explicit user-provided paths, staged changes, or last commit diff
2. Delegate to the code-reviewer agent with the diff content and file paths
3. Review for correctness, regressions, security, maintainability risk, and missing tests
4. Classify findings by severity (Critical, Major, Minor, Suggestion) with concrete file and line references
5. Present findings first, ordered by severity; keep the closing summary brief and only after findings

## Constraints

- Do not bury findings behind a long overview
- Every finding must reference a specific file and line number -- no speculative issues
- If no findings exist, say so explicitly and note residual testing gaps
