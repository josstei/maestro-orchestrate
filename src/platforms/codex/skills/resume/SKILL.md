---
name: resume
description: Resume the active Maestro session from docs/maestro state
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["session-management", "execution"].

## Startup

1. If `get_runtime_context` appears in your available tools, call it first.
2. Prefer Maestro MCP tools for settings, workspace initialization, session status, planning validation, and session transitions.
3. If MCP tools are unavailable, use direct file operations under `docs/maestro`.

## Workflow

1. Read the active session via Maestro MCP tools if available.
2. Otherwise, read `docs/maestro/state/active-session.md` directly when it exists.
3. Follow the shared resume protocol exactly.
4. If unresolved errors exist, stop at the user-decision gate before re-delegating work.
5. Resume from the first pending or failed phase only after the state summary is presented.
