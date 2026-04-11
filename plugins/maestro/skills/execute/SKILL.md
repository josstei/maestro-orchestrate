---
name: execute
description: Execute an approved Maestro implementation plan using the shared session-state contract
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["execution", "delegation", "session-management", "validation"].

## Startup

1. If `get_runtime_context` appears in your available tools, call it first.
2. Prefer Maestro MCP tools for settings, workspace initialization, session status, planning validation, and session transitions.
3. If MCP tools are unavailable, use direct file operations under `docs/maestro`.
4. Treat `docs/maestro` as the workspace state root.

Read the approved implementation plan at the user-provided path (or check `docs/maestro/plans/` for the most recent plan). Resolve the execution mode gate, create or resume session state, then execute phases through child agents following the loaded methodology.
