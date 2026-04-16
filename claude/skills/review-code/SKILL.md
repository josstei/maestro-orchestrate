---
name: review-code
description: Perform a Maestro-style code review with findings ordered by severity and concrete file references
---


# Maestro Review Code

Call `get_skill_content` with resources: ["architecture"].

## Protocol

Before delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.

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
