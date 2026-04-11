---
name: resume
description: Resume an interrupted Maestro session using the existing active-session file and shared phase tracking
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["session-management", "execution", "delegation", "validation"].

## Startup

1. If `get_runtime_context` appears in your available tools, call it first.
2. Prefer Maestro MCP tools for settings, workspace initialization, session status, planning validation, and session transitions.
3. If MCP tools are unavailable, use direct file operations under `docs/maestro`.
4. Treat `docs/maestro` as the workspace state root.

Read the active session state, summarize completed and pending phases, then resume from the first pending or failed phase following the loaded methodology.
