# Maestro Codex Runtime Guide

This guide explains how the shared Maestro methodology maps onto Codex.

## Source of truth

- Shared skills, references, templates, and agent bodies are authored in repository `src/`.
- Published Codex bundles carry a generated local `src/` payload derived from that canonical source tree, so installs remain self-contained.
- Codex content loading is filesystem-only and should resolve against the generated local `src/` in the plugin bundle.
- Generated agent role references under `../agents/` are registration stubs only.

Public Codex skills should load shared assets through MCP instead of duplicating methodology. Codex adds the plugin namespace at invocation time, so these surface as `$maestro:<skill>`.

Codex also reserves built-in `/review`, `/debug`, and `/resume` commands, so Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` instead of those bare names.

## State contract

Maestro state lives in `docs/maestro` in the workspace root:

- active session: `docs/maestro/state/active-session.md`
- plans: `docs/maestro/plans/`
- archives: `docs/maestro/state/archive/`, `docs/maestro/plans/archive/`

Resolve that workspace root in this order:

1. `MAESTRO_WORKSPACE_PATH`, when the host exports it and it points to a real path
2. the first valid local `file://` root returned by the MCP client `roots/list` request
3. inherited env or `cwd` fallback heuristics from the shared resolver

If MCP tools are unavailable, operate directly on the files under `docs/maestro` in the workspace root.

## Tool mapping

Translate bare tool references from shared skills as follows:

| Shared reference | Codex equivalent |
| --- | --- |
| `activate_skill` | Read the referenced `SKILL.md` and follow it |
| `ask_user` | `request_user_input`; use a direct question only when structured options do not fit |
| `write_todos` | `update_plan` |
| `enter_plan_mode` | `update_plan` plus direct document writing |
| `exit_plan_mode` | explicit approval via `request_user_input` |
| `run_shell_command` | `exec_command` |
| `write_file` / `replace` | `apply_patch` |
| `codebase_investigator` | local repo inspection first, then Codex-native delegation if needed |

Prefer direct file reads for local content. When search is needed, use fast local commands such as `rg`, `rg --files`, `find`, `sed`, and `git diff` through `exec_command`.

## MCP behavior

If Maestro MCP tools are available, prefer them for stateful operations:

- `initialize_workspace`
- `resolve_settings`
- `assess_task_complexity`
- `create_session`
- `get_session_status`
- `update_session`
- `transition_phase`
- `archive_session`
- `validate_plan`

If the MCP server is unavailable in the current Codex environment, fall back to direct file operations under `docs/maestro` as described by the shared skills.

## Delegation model

Codex plugin bundles do not register Maestro custom subagents by themselves. Use Codex-native delegation and keep the generated agent references as the behavioral contract:

1. Call `get_agent` with the kebab-case agent name to load the Maestro persona and declared tool restrictions.
2. Map that Maestro persona onto the best built-in Codex delegation mode available.
3. Preserve the Maestro agent name in the prompt header and handoff reporting.

Recommended mapping:

- evidence gathering or repo mapping: `explorer`
- bounded implementation: `worker`
- no clear benefit from delegation: stay local

When delegating, include the relevant agent reference content or instructions from that file. Do not invent a separate Codex-only methodology for the same agent.

## Public skill surface

Use these entry points for user-facing workflows:

- `orchestrate`
- `execute`
- `resume-session`
- `status`
- `archive`
- `review-code`
- `debug-workflow`
- `security-audit`
- `perf-check`
- `seo-audit`
- `a11y-audit`
- `compliance-check`

## Codex-specific constraints

### spawn_agent fork incompatibility

`spawn_agent` rejects full-history forks when any of `agent_type`, `model`, or `reasoning_effort` are supplied. This applies to both `fork_context: true` (v1) and `fork_turns: "all"` (v2).

Exact error:

    Full-history forked agents inherit the parent agent type, model, and reasoning effort; omit agent_type, model, and reasoning_effort, or spawn without fork_context/fork_turns=all.

Resolution: read `delegation.constraints.fork_full_context_incompatible_with` from `get_runtime_context` and omit those fields when forking with full history. Alternatively, spawn without `fork_context`/`fork_turns=all` and pass self-contained prompts.

### request_user_input availability

`request_user_input` is Plan-mode-gated. Spawned child agents inherit their parent's mode, which is typically not Plan. Child agents therefore cannot call `request_user_input`.

Consequence for Maestro: only the orchestrator agent can ask the user questions. Child agents must surface questions through the Blocker Protocol documented in the delegation skill (`## Blockers` section in the Task Report).

### spawn_agent return surface

`spawn_agent` returns `{agent_id, task_name, nickname}` only — no token usage, no assistant text, no structured error. To retrieve results:

1. Call `wait_agent(agent_id, timeout)` to poll for completion.
2. On timeout, invoke the Recovery Protocol (execution skill): `scan_phase_changes` → user confirmation → `reconcile_phase`.

### Hooks

Codex does not expose PreToolUse / BeforeAgent / AfterAgent hooks to plugins. Maestro does not rely on hooks under Codex; handoff-format enforcement, design-gate tracking, and reconciliation are all enforced by the MCP server.
