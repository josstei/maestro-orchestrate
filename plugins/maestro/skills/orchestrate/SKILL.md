---
name: orchestrate
description: Run the full Maestro workflow for complex engineering tasks that need a mandatory design dialogue, approved implementation plan, and then execution with shared session state
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["orchestration-steps"].

## Startup

1. If `get_runtime_context` appears in your available tools, call it first.
2. Prefer Maestro MCP tools for settings, workspace initialization, session status, planning validation, and session transitions.
3. If MCP tools are unavailable, use direct file operations under `docs/maestro`.
4. Treat `docs/maestro` as the workspace state root.

Follow the returned step sequence exactly. The steps are the sole procedural authority — do not improvise, skip, or reorder them.
