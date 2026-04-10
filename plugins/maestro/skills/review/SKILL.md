---
name: review
description: Perform a Maestro-style code review with findings ordered by severity and concrete file references
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "delegation", "code-review"].
Call `get_agent` with agents: ["code-reviewer"].

## Workflow

1. Determine review scope: explicit user-provided paths, staged changes, or last commit diff
2. Delegate to the code-reviewer agent with the diff content and file paths
3. Review for correctness, regressions, security, maintainability risk, and missing tests
4. Classify findings by severity (Critical, Major, Minor, Suggestion) with concrete file and line references
5. Present findings first, ordered by severity; keep the closing summary brief and only after findings
