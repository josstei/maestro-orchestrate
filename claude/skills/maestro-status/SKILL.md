---
name: maestro-status
description: Summarize the active Maestro session without mutating state
---


# Maestro Status

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.

## Workflow

1. Resolve `docs/maestro` from `MAESTRO_STATE_DIR`.
2. If `get_session_status` appears in your available tools, call it. Otherwise, read `node ${CLAUDE_PLUGIN_ROOT}/scripts/read-active-session.js` output or inspect `docs/maestro/state/active-session.md` directly via `Read`.
3. Report current session status, phase progress, file manifests, validation state, and unresolved errors.

## Constraints

- This is read-only. Do not mutate state, archive sessions, or continue execution.
- If no active session exists, say so plainly.
