# CLAUDE.md

This file provides implementation guidance for working on the Maestro Gemini CLI extension in this repository.

## Project Overview

Maestro is a multi-agent orchestration extension for Gemini CLI. It provides:
- A TechLead orchestrator prompt (`GEMINI.md`)
- Nine slash commands under `commands/maestro/*.toml`
- Twelve local agents under `agents/*.md`
- Seven reusable skills under `skills/*/SKILL.md`
- Lifecycle hooks under `hooks/`
- Parallel execution scripts under `scripts/`

Maestro itself has no compiled runtime artifact. The extension behavior is driven by Markdown/TOML/JSON plus shell scripts.

## Development Commands

```bash
# Link extension for local development
gemini extensions link .

# Sync package version into gemini-extension.json
npm version <patch|minor|major>

# Run integration tests for hooks + dispatch scripts
bash tests/run-all.sh
```

Manual validation is done in Gemini CLI after linking:

```bash
/maestro:orchestrate "Build a simple TODO app"
/maestro:status
/maestro:resume
/maestro:review
```

## Source of Truth Files

- `gemini-extension.json`: extension metadata + user-configurable `MAESTRO_*` settings
- `GEMINI.md`: orchestrator behavior, phase protocol, delegation rules
- `commands/maestro/*.toml`: slash-command prompts
- `agents/*.md`: per-agent permissions (`tools:` frontmatter), turns, timeout, temperature
- `hooks/hooks.json` and `hooks/*.sh`: SessionStart/BeforeAgent/AfterAgent/SessionEnd lifecycle behavior
- `scripts/parallel-dispatch.sh`: parallel execution contract
- `scripts/read-active-session.sh`: session status resolution for status/resume commands

Status/resume command prompts execute:
- `${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}/scripts/read-active-session.sh`

## Current Maestro Settings

These are the settings surfaced by `gemini-extension.json`:

| envVar | Purpose |
|---|---|
| `MAESTRO_DEFAULT_MODEL` | Model override for parallel-dispatched agents |
| `MAESTRO_WRITER_MODEL` | Model override for `technical-writer` in parallel dispatch |
| `MAESTRO_DEFAULT_TEMPERATURE` | Delegation prompt temperature override |
| `MAESTRO_MAX_TURNS` | Max turns per delegation |
| `MAESTRO_AGENT_TIMEOUT` | Per-agent timeout (minutes) |
| `MAESTRO_DISABLED_AGENTS` | Comma-separated excluded agents for planning |
| `MAESTRO_MAX_RETRIES` | Retry limit before user escalation |
| `MAESTRO_AUTO_ARCHIVE` | Auto-archive session on successful completion |
| `MAESTRO_VALIDATION_STRICTNESS` | Validation behavior (`normal`/`strict`) |
| `MAESTRO_STATE_DIR` | Base path for state and plans (default `.gemini`) |
| `MAESTRO_MAX_CONCURRENT` | Parallel dispatch concurrency cap (`0` = unlimited) |
| `MAESTRO_STAGGER_DELAY` | Delay between launching parallel agents (seconds) |
| `MAESTRO_GEMINI_EXTRA_ARGS` | Extra Gemini CLI flags forwarded per parallel process (prefer `--policy`) |
| `MAESTRO_EXECUTION_MODE` | Phase 3 mode (`parallel`, `sequential`, `ask`) |

Script-only env vars used by `scripts/parallel-dispatch.sh`:
- `MAESTRO_CLEANUP_DISPATCH=true` removes `<dispatch-dir>/prompts` after completion.
- `MAESTRO_CURRENT_AGENT` is exported internally for hook correlation.

Runtime settings precedence for script-backed behavior:
1. Exported env var
2. Workspace `.env` (`$PWD/.env`)
3. Extension `.env` (`${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}/.env`)
4. Built-in default

## Parallel Dispatch Contract

`scripts/parallel-dispatch.sh <dispatch-dir>` expects:
- `<dispatch-dir>/prompts/*.txt` prompt files named after agents

For each prompt file it:
- Validates agent name against `agents/*.md`
- Prepends a project-root preamble to the prompt
- Resolves dispatch settings via env → workspace `.env` → extension `.env` precedence
- Spawns `gemini --approval-mode=yolo --output-format json [model flags] [extra args] --prompt "<prompt>"`
- Writes:
  - `<dispatch-dir>/results/<agent>.json`
  - `<dispatch-dir>/results/<agent>.exit`
  - `<dispatch-dir>/results/<agent>.log`
  - `<dispatch-dir>/results/summary.json`
- Preserves each agent's exact non-zero exit code in `<agent>.exit` and `summary.json` (timeouts are normalized to `124`)
- Exits with the number of failed agents

If `MAESTRO_GEMINI_EXTRA_ARGS` contains `--allowed-tools`, the script emits a deprecation warning and recommends `--policy`.

## Hook Behavior (Current)

Configured in `hooks/hooks.json`:
- `SessionStart` -> `hooks/session-start.sh`
- `BeforeAgent` -> `hooks/before-agent.sh`
- `AfterAgent` -> `hooks/after-agent.sh`
- `SessionEnd` -> `hooks/session-end.sh`

Current behavior:
- `BeforeAgent` tracks active agent (`MAESTRO_CURRENT_AGENT` first, regex fallback), then injects session context from `<state_dir>/state/active-session.md` when available.
- `AfterAgent` validates delegated-agent handoff format (`## Task Report` + `## Downstream Context`), requests one retry on malformed output, and clears active-agent tracking.
- Session hooks initialize and clean temporary hook state under `/tmp/maestro-hooks/<session_id>`.

Tool permissions are enforced by each agent's `tools:` frontmatter, not by hook-time shell gating.

## Agent Capability Map

All agents have read/navigation tools (`read_file`, `list_directory`, `glob`, `grep_search`, `read_many_files`) and `ask_user`, then vary by write/shell/web:

- Read-only analysis: `code-reviewer`
- Read + web research: `architect`, `api-designer`
- Read + shell investigation: `debugger`
- Read + shell + web: `performance-engineer`, `security-engineer`
- Read + write (no shell): `refactor`, `technical-writer`
- Read + write + shell: `coder`, `data-engineer`, `devops-engineer`, `tester`

Additional specialized tools:
- `activate_skill`: `coder`, `refactor`, `tester`
- `write_todos`: implementation/investigation-capable agents

## Commands and Skills

Slash commands:
- `/maestro:orchestrate`
- `/maestro:execute`
- `/maestro:resume`
- `/maestro:status`
- `/maestro:archive`
- `/maestro:review`
- `/maestro:debug`
- `/maestro:perf-check`
- `/maestro:security-audit`

Skills:
- `design-dialogue`
- `implementation-planning`
- `execution`
- `delegation`
- `session-management`
- `code-review`
- `validation`

## Testing Notes

`bash tests/run-all.sh` covers:
- Hook scripts (SessionStart, BeforeAgent, AfterAgent, SessionEnd)
- Parallel dispatch argument forwarding
- Parallel dispatch config fallback resolution (`.env` precedence)
- Parallel dispatch exit code propagation (real non-zero codes preserved)
- Active-session resolution script behavior

Prerequisite for orchestration testing:

```json
{ "experimental": { "enableAgents": true } }
```
