---
name: maestro-resume
description: Resume an interrupted Maestro session using the existing active-session file and shared phase tracking
---


# Maestro Resume

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md` and `${CLAUDE_PLUGIN_ROOT}/templates/session-state.md`.

## Workflow

1. If `get_session_status` appears in your available tools, call it. Otherwise, read `node ${CLAUDE_PLUGIN_ROOT}/scripts/read-active-session.js` output or inspect `docs/maestro/state/active-session.md` directly via `Read`.
2. Summarize completed, pending, in-progress, and failed phases.
3. Identify unresolved errors and partial work before continuing.
3b. **Check Workflow Mode**: If `workflow_mode` is `express` in session state, follow the Express Resume protocol from the Express Workflow section in the orchestrator template. Do not resolve the execution-mode gate — Express bypasses it. Skip the remaining Standard resume steps below.
4. If `execution_mode` is missing from session state, resolve the execution-mode gate before any further implementation delegation:
   - read `MAESTRO_EXECUTION_MODE`; treat the effective default as `ask`
   - if the effective mode is `ask`, use `AskUserQuestion with options` to ask for `parallel` versus `sequential` execution based on the remaining plan
5. Resume from the first failed or pending phase after confirming the intended next action.
6. Continue execution through child agents via `Agent` using the recorded mode.
7. In `sequential` mode, delegate one remaining work package at a time.
8. In `parallel` mode, dispatch only same-depth, non-overlapping remaining work packages together.
9. Update session state as execution continues.

## Constraints

- Treat missing or stale active-session state as a user-facing issue; do not fabricate session data.
- Preserve the existing Maestro phase history instead of rewriting it from scratch.
- Do not silently continue execution in the parent session if child-agent delegation was expected. Main-context implementation is fallback only and requires explicit user approval.
