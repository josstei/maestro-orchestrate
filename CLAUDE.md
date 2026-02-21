# CLAUDE.md

Implementation guidance for contributors working on the Maestro Gemini CLI extension.

## Project Overview

Maestro is a configuration-first Gemini CLI extension. Core runtime surfaces:

- `gemini-extension.json`: extension metadata and configurable env vars
- `GEMINI.md`: TechLead orchestrator context and 4-phase protocol
- `commands/maestro/*.toml`: slash command prompts (`/maestro:*`)
- `agents/*.md`: local subagent definitions and tool permissions
- `skills/*/SKILL.md`: reusable procedural protocols
- `hooks/hooks.json` + `hooks/*.js`: lifecycle middleware
- `scripts/*.js`: workspace/state/parallel-dispatch helpers
- `templates/*.md`: structure templates for generated artifacts (designs, plans, sessions)
- `src/lib/`: shared Node.js modules organized by domain:
  - `core/`: cross-cutting infrastructure (logger, atomic-write, stdin-reader, env-file-parser, integer-parser, project-root-resolver, agent-registry)
  - `config/`: configuration resolution (setting-resolver, dispatch-config-resolver)
  - `hooks/`: hook lifecycle system (hook-facade, hook-response, hook-state)
  - `state/`: session and workspace state (session-state, session-id-validator)
  - `dispatch/`: parallel execution infrastructure (process-runner, concurrency-limiter)

There is no compiled runtime binary in this repository.

## Development Commands

```bash
# Link extension in Gemini CLI
gemini extensions link .

# Sync package version into gemini-extension.json
npm version <patch|minor|major>

# Run all tests (unit + integration)
node tests/run-all.js
```

Useful manual checks after linking:

```bash
/maestro:orchestrate "Build a simple TODO app"
/maestro:status
/maestro:resume
/maestro:review
```

## Source-of-Truth Files

- `gemini-extension.json`
- `GEMINI.md`
- `commands/maestro/*.toml`
- `agents/*.md`
- `skills/*/SKILL.md`
- `hooks/hooks.json`
- `hooks/*.js`
- `src/lib/core/*.js`
- `src/lib/config/*.js`
- `src/lib/hooks/*.js`
- `src/lib/state/*.js`
- `src/lib/dispatch/*.js`
- `scripts/ensure-workspace.js`
- `scripts/read-state.js`
- `scripts/write-state.js`
- `scripts/read-active-session.js`
- `scripts/parallel-dispatch.js`
- `scripts/sync-version.js`
- `templates/*.md`
- `package.json`
- `tests/run-all.js`

## Gemini CLI Compatibility Notes

- Extension settings from `gemini-extension.json` are configured through `gemini extensions config` and hydrated as `MAESTRO_*` env vars.
- File commands are loaded from user/project/extension command directories; Maestro commands resolve under `/maestro:*`.
- Hook definitions in `hooks/hooks.json` must use `type: "command"` (plugin-style hooks are rejected by current Gemini CLI validation).
- Skill discovery merges built-in, extension, user, and workspace skills with precedence and trust gating.

## Current Settings Surface

`gemini-extension.json` exposes:

| envVar | Purpose |
| --- | --- |
| `MAESTRO_DEFAULT_MODEL` | Model override for parallel-dispatched agents |
| `MAESTRO_WRITER_MODEL` | Writer-specific model override in parallel dispatch |
| `MAESTRO_DEFAULT_TEMPERATURE` | Delegation temperature override |
| `MAESTRO_MAX_TURNS` | Delegation turn limit override |
| `MAESTRO_AGENT_TIMEOUT` | Dispatch timeout and delegation timeout metadata |
| `MAESTRO_DISABLED_AGENTS` | Comma-separated excluded agents |
| `MAESTRO_MAX_RETRIES` | Retry ceiling before escalation |
| `MAESTRO_AUTO_ARCHIVE` | Auto-archive on successful completion |
| `MAESTRO_VALIDATION_STRICTNESS` | Validation gate mode |
| `MAESTRO_STATE_DIR` | Session/plans/parallel state root |
| `MAESTRO_MAX_CONCURRENT` | Parallel process cap (`0` = unlimited) |
| `MAESTRO_STAGGER_DELAY` | Launch delay between parallel processes |
| `MAESTRO_GEMINI_EXTRA_ARGS` | Extra Gemini CLI args forwarded to each parallel process |
| `MAESTRO_EXECUTION_MODE` | Execute phase mode: `ask`, `parallel`, `sequential` |

Script-only vars:

- `MAESTRO_CLEANUP_DISPATCH`
- `MAESTRO_CURRENT_AGENT`
- `MAESTRO_EXTENSION_PATH`

Script precedence is env -> workspace `.env` -> extension `.env` -> default.

## Hook Contract

Defined in `hooks/hooks.json`:

- SessionStart -> `hooks/session-start.js`
- BeforeAgent -> `hooks/before-agent.js`
- AfterAgent -> `hooks/after-agent.js`
- SessionEnd -> `hooks/session-end.js`

Behavior summary:

- `session-start.js`: prunes stale hook state (2-hour TTL), initializes session state directory only when an active Maestro session exists in the workspace
- `before-agent.js`: detects active agent via `agent-registry.detectAgentFromPrompt()` (`MAESTRO_CURRENT_AGENT` env var first, prompt delegation-pattern regex fallback), persists agent to hook state, injects compact session phase/status context
- `after-agent.js`: validates delegated output includes both `Task Report` and `Downstream Context` (skips validation for `techlead`/`orchestrator` agents), denies with retry reason when malformed, allows on second attempt (`stopHookActive`) to prevent infinite loops
- `session-end.js`: removes session hook state directory

Hook state is stored under `/tmp/maestro-hooks` (Unix) or `%TEMP%\maestro-hooks` (Windows). Stale session directories older than 2 hours are automatically pruned on each SessionStart and BeforeAgent invocation.

## Parallel Dispatch Contract

`node scripts/parallel-dispatch.js <dispatch-dir>` expects `prompts/*.txt` and writes `results/*`.

Per-agent execution:

- validates agent name against `agents/*.md`
- validates prompt file size (1 MB limit) and non-empty content
- sanitizes agent name from filename (alphanumeric, hyphens, underscores only)
- normalizes agent name hyphens to underscores for agent lookup
- injects `MAESTRO_CURRENT_AGENT` env var with the normalized agent name into each spawned process
- uses `MAESTRO_WRITER_MODEL` for the `technical_writer` agent when set, otherwise falls back to `MAESTRO_DEFAULT_MODEL`
- prepends project-root safety preamble
- streams prompt payload to `gemini` over stdin
- runs `gemini --approval-mode=yolo --output-format json [model flags] [extra args]`
- persists `.json`, `.exit`, `.log`

Batch-level behavior:

- writes `summary.json`
- preserves real non-zero exit codes in `.exit` and summary
- exits with number of failed agents
- warns when `--allowed-tools` is passed and recommends `--policy`
- optionally cleans up prompt files when `MAESTRO_CLEANUP_DISPATCH=true`

## Testing

`node tests/run-all.js` runs all tests. Unit tests are in `tests/unit/`, integration tests are in `tests/integration/`.

Unit tests cover all `src/lib/` modules: logger, atomic-write, stdin-reader, env-file-parser, integer-parser, project-root-resolver, agent-registry, setting-resolver, dispatch-config-resolver, hook-facade, hook-response, hook-state, session-state, session-id-validator, process-runner, concurrency-limiter.

Integration tests cover:

- all hook scripts (SessionStart, BeforeAgent, AfterAgent, SessionEnd)
- parallel dispatch arg forwarding, stdin payload behavior, concurrency gate enforcement, and numeric setting validation
- dispatch config fallback precedence
- dispatch exit-code propagation
- read-active-session resolution behavior

Orchestration prerequisite:

```json
{ "experimental": { "enableAgents": true } }
```
