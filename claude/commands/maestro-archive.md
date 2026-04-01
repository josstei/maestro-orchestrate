---
description: Archive the active Maestro session while preserving the shared state layout
---


# Maestro Archive

Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md` and `${CLAUDE_PLUGIN_ROOT}/templates/session-state.md`.

## Workflow

1. Resolve `docs/maestro` from `MAESTRO_STATE_DIR`.
2. Verify that an active session exists.
3. Move the active session file into `docs/maestro/state/archive/`.
4. Move the associated design and implementation plan files into `docs/maestro/plans/archive/`.
5. Verify that no active-session file remains and report the archived paths.

## Constraints

- Do not delete plan or session history.
- Preserve the existing archive directory structure.
