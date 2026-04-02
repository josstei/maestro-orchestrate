---
name: maestro-execute
description: Execute an approved Maestro implementation plan using the shared session-state contract
---


# Maestro Execute

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`, `${CLAUDE_PLUGIN_ROOT}/templates/implementation-plan.md`, and `${CLAUDE_PLUGIN_ROOT}/templates/session-state.md`.

## Workflow

1. Read the approved implementation plan and confirm the execution scope.
2. Resolve `docs/maestro` from `MAESTRO_STATE_DIR`.
3. If `initialize_workspace` appears in your available tools, call it. Otherwise, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-workspace.js docs/maestro`.
4. Create or resume `docs/maestro/state/active-session.md`.
5. Resolve the execution-mode gate before any implementation delegation:
   - if session state already records `execution_mode`, reuse it
   - otherwise read `MAESTRO_EXECUTION_MODE`; treat the effective default as `ask`
   - if the effective mode is `ask`, use `AskUserQuestion with options` to ask the user for `parallel` versus `sequential` execution based on the approved plan's execution profile
6. Record `execution_mode` in session state before the first delegated implementation step.
7. Execute phases in dependency order through child agents via `Agent`.
8. In `sequential` mode, delegate one work package at a time to a child agent, then validate and update session state before moving on.
9. In `parallel` mode, dispatch only same-depth, non-overlapping work packages to child agents in the same execution step.
10. Persist phase updates, file manifests, downstream context, validation results, and errors in session state.

## Constraints

- When delegated work is malformed, retry or narrow the scope instead of silently accepting it.
- Do not silently execute the plan in the parent session. Main-context implementation is fallback only and requires explicit user approval.
- Keep shared state paths and document names unchanged.
