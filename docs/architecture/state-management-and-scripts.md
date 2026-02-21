# State Management and Scripts

This document describes Maestro's persisted session state model and script runtime contract.

## State Directory Layout

State is project-local under `MAESTRO_STATE_DIR` (default `.gemini`):

```text
<state_dir>/
  state/
    active-session.md
    archive/
  plans/
    *-design.md
    *-impl-plan.md
    archive/
  parallel/
    <batch-id>/
      prompts/
      results/
```

`<state_dir>` can be relative (resolved from project root) or absolute for session path resolution (`resolveActiveSessionPath`). Note that `ensureWorkspace`, `readState`, and `writeState` enforce relative paths only and reject absolute values.

## Resolution Precedence

For script-backed settings:

1. Exported env var
2. Workspace `.env`
3. Extension `.env` (`${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}/.env`)
4. Default

`read-active-session.js` and `parallel-dispatch.js` both implement this precedence, though they resolve project root differently: `read-active-session.js` uses the git repository root (via `resolveProjectRoot()`), while `parallel-dispatch.js` uses the current working directory (`process.cwd()`).

## Why Scripts Are Required for State Reads

`read_file` follows ignore rules; `.gemini/` is commonly ignored. Maestro therefore uses Node.js helpers for state reads under `<state_dir>`:

- `node scripts/read-state.js <relative-path>`
- `node scripts/read-active-session.js`

State writes are typically done with `write_file`. For shell-piped writes, use `node scripts/write-state.js` (atomic temp-file + rename).

## Script Reference

| Script | Responsibility | Key Guarantees |
| --- | --- | --- |
| `scripts/ensure-workspace.js` | Prepare `<state_dir>` tree | Rejects absolute/path-traversal/symlink state dir; creates required directories and verifies writability |
| `scripts/read-state.js` | Safe state-file read | Relative-path only, traversal rejection, explicit error on missing file |
| `scripts/write-state.js` | Safe atomic state write | Relative-path only, traversal rejection, atomic move to destination |
| `scripts/read-active-session.js` | Resolve and read active session | Uses precedence chain and returns `No active session` fallback |
| `scripts/parallel-dispatch.js` | Run agent batch concurrently | Validates agent names, applies env settings, timeout/concurrency control, writes structured result artifacts |
| `scripts/sync-version.js` | Keep extension version in sync | Copies `package.json` version into `gemini-extension.json` |

## Parallel Dispatch Runtime Contract

### Inputs

Required:

- `<dispatch-dir>/prompts/*.txt`

Optional settings:

- `MAESTRO_DEFAULT_MODEL`
- `MAESTRO_WRITER_MODEL`
- `MAESTRO_AGENT_TIMEOUT`
- `MAESTRO_MAX_CONCURRENT`
- `MAESTRO_STAGGER_DELAY`
- `MAESTRO_GEMINI_EXTRA_ARGS`
- `MAESTRO_CLEANUP_DISPATCH`

### Execution Behavior

For each prompt file:

1. Validate agent name against `agents/*.md`
2. Build prompt payload by prepending a project-root safety preamble
3. Stream prompt payload to `gemini` over stdin
4. Execute:
   - `gemini --approval-mode=yolo --output-format json [model flags] [extra args]`
5. Persist artifacts:
   - `<agent>.json`
   - `<agent>.exit`
   - `<agent>.log`

After all processes:

- Write `summary.json`
- Exit with failure count
- Preserve real non-zero agent exit codes in `.exit` files and `summary.json`
- Normalize timeout to exit code `124`

### Deprecated Flag Guard

If extra args include `--allowed-tools`, dispatch warns and recommends `--policy` (Policy Engine).

## Hook Runtime Contract

Configured in `hooks/hooks.json`:

| Event | Script | Behavior |
| --- | --- | --- |
| `SessionStart` | `hooks/session-start.js` | Prunes stale hook state, initializes session directory when an active session exists |
| `BeforeAgent` | `hooks/before-agent.js` | Tracks active agent, injects compact phase/status context from active session |
| `AfterAgent` | `hooks/after-agent.js` | Validates delegated response contains `Task Report` and `Downstream Context`; requests one retry if malformed |
| `SessionEnd` | `hooks/session-end.js` | Removes session hook state directory |

Shared hook helpers live in `src/lib/` modules (`hooks/hook-state`, `hooks/hook-response`, `hooks/hook-facade`, `core/logger`, `core/stdin-reader`, `state/session-id-validator`, `core/agent-registry`).

Gemini CLI hook-schema compatibility notes:

- Hook entries must use `type: "command"` with a non-empty `command` string.
- Hook definitions may include `matcher`, `sequential`, `env`, and `timeout`.
- Maestro subscribes to SessionStart, BeforeAgent, AfterAgent, and SessionEnd by default. Gemini CLI exposes additional hook events that are not currently used.

## Session State Lifecycle

Primary state model is defined by:

- `templates/session-state.md`
- `skills/session-management/SKILL.md`

Lifecycle stages:

1. Create `state/active-session.md`
2. Update per-phase status, files changed, downstream context, errors, token usage
3. Read via `/maestro:status` and `/maestro:resume` using `read-active-session.js`
4. Archive to `state/archive/` and `plans/archive/`

## Test Coverage

Integration coverage runs via `node tests/run-all.js` and currently verifies:

- all hook scripts
- parallel dispatch arg forwarding and stdin prompt payload behavior
- concurrency gate enforcement
- numeric setting validation
- dispatch config fallback precedence
- dispatch exit-code propagation
- active-session resolution behavior
