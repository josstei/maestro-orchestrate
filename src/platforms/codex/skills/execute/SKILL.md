---
name: execute
description: Execute an approved Maestro implementation plan using the shared session-state contract
---

Read `../../references/runtime-guide.md`.
Call `get_skill_content` with resources: ["architecture", "execution", "session-management", "delegation", "validation"].

## Startup

1. If `get_runtime_context` appears in your available tools, call it first.
2. Prefer Maestro MCP tools for settings, workspace initialization, session status, planning validation, and session transitions.
3. If MCP tools are unavailable, use direct file operations under `docs/maestro`.

## Workflow

1. Confirm the approved implementation plan path under `docs/maestro/plans/`.
2. Resolve execution mode using the shared execution skill.
3. Create or resume session state before any implementation delegation.
4. Delegate each phase using `get_agent` for the matching Maestro role.
5. Persist every completed phase back to session state.
6. Run the completion review gate before archiving.

Do not skip the shared execution and session-management protocols.
