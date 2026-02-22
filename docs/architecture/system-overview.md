# System Overview

Maestro is a Gemini CLI extension that orchestrates multi-step software delivery through specialized local agents.

## Runtime Entry Points

Maestro is configuration-driven. The runtime is composed of:

- `gemini-extension.json`: extension manifest and user-configurable `MAESTRO_*` settings
- `GEMINI.md`: TechLead orchestrator context and phase protocol
- `commands/maestro/*.toml`: slash command prompts
- `skills/*/SKILL.md`: on-demand procedural protocols
- `agents/*.md`: local agent definitions (`tools`, temperature, turn limits, timeout)
- `hooks/hooks.json` + `hooks/*.js`: lifecycle middleware (SessionStart, BeforeAgent, AfterAgent, SessionEnd)
- `scripts/*.js`: workspace, state, and parallel dispatch helpers
- `src/lib/{core,config,state,hooks,dispatch}/*.js`: shared Node.js modules organized by domain (stdin, state, settings, hook lifecycle, dispatch, etc.)

## Gemini CLI Loader Alignment

Maestro relies on Gemini CLI extension-loading behavior as implemented in `gemini-cli`:

- Manifest schema: `gemini-extension.json` uses required `name` and `version`, plus `description`, `contextFileName`, and `settings`. Optional extension surfaces (`mcpServers`, `excludeTools`, `themes`) are currently not used by Maestro.
- Settings flow: `settings[*].envVar` values are configured through `gemini extensions config` and hydrated as environment variables for command prompts, hooks, and scripts.
- Command discovery: file commands load from user, project, and extension `commands/` directories; Maestro commands are namespaced as `/maestro:*`.
- Hook validation: Gemini CLI currently accepts only command hooks (`type: "command"`). Legacy plugin-style hook entries are rejected.
- Skill precedence: built-in skills are merged with extension skills, then user/workspace skills (workspace skills require trust).

## Slash Commands

Commands are registered from `commands/maestro/*.toml` and invoked as `/maestro:<name>`.

| Command | Source | Purpose |
| --- | --- | --- |
| `/maestro:orchestrate` | `commands/maestro/orchestrate.toml` | Full Design -> Plan -> Execute orchestration |
| `/maestro:execute` | `commands/maestro/execute.toml` | Execute an existing implementation plan |
| `/maestro:resume` | `commands/maestro/resume.toml` | Resume active orchestration session |
| `/maestro:status` | `commands/maestro/status.toml` | Read-only active-session summary |
| `/maestro:archive` | `commands/maestro/archive.toml` | Archive current active session |
| `/maestro:review` | `commands/maestro/review.toml` | Standalone code review workflow |
| `/maestro:debug` | `commands/maestro/debug.toml` | Focused debugging workflow |
| `/maestro:perf-check` | `commands/maestro/perf-check.toml` | Performance assessment workflow |
| `/maestro:security-audit` | `commands/maestro/security-audit.toml` | Security audit workflow |

### Prompt Composition Pattern

Command prompts use defensive wrappers around user input:

```xml
<user-request>
{{args}}
</user-request>
```

State-aware commands (`/maestro:status`, `/maestro:resume`) also inject script output via `!{...}` shell injection to read active session state through `node scripts/read-active-session.js`.

## Orchestration Lifecycle

Primary orchestration follows four phases in `GEMINI.md`:

1. Design: activates `design-dialogue`
2. Plan: activates `implementation-planning` and `session-management`
3. Execute: activates `execution` and `delegation` (and `validation` during phase checks)
4. Complete: final validation, summary, archival via `session-management`

Execution mode is controlled by `MAESTRO_EXECUTION_MODE` (`ask`, `parallel`, `sequential`).

## Settings Resolution (Script-Backed)

For script-resolved settings, precedence is:

1. Exported environment variable
2. Workspace `.env` (project root `.env`; `read-active-session.js` resolves via git repo root, `parallel-dispatch.js` resolves via `cwd`)
3. Extension `.env` (`${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}/.env`)
4. Caller-applied default (`setting-resolver` returns `undefined`)

This precedence is implemented in `src/lib/config/setting-resolver.js`, consumed by `scripts/parallel-dispatch.js` and `scripts/read-active-session.js`.

## Parallel Dispatch Architecture

Parallel batches are executed by `node scripts/parallel-dispatch.js`.

### Flow

1. Orchestrator writes per-agent prompt files to `<state_dir>/parallel/<batch-id>/prompts/` (any non-hidden file accepted; `.txt` is convention, not a requirement)
2. Script validates agent names against `agents/*.md` (skipped when `agents/` directory does not exist)
3. Script resolves model/timeout/concurrency/extra-args settings
4. For each prompt file, script prepends a project-root preamble and streams prompt content to `gemini` over stdin
5. Script runs one process per prompt:
   - `gemini --approval-mode=yolo --output-format json [model flags] [extra args]`
6. Script stores per-agent outputs:
   - `<dispatch-dir>/results/<agent>.json`
   - `<dispatch-dir>/results/<agent>.exit`
   - `<dispatch-dir>/results/<agent>.log`
7. Script writes batch summary:
   - `<dispatch-dir>/results/summary.json`
8. Script exits with the number of failed agents

### Dispatch Controls

- `MAESTRO_DEFAULT_MODEL`: model for all dispatched agents
- `MAESTRO_WRITER_MODEL`: override for `technical_writer`
- `MAESTRO_AGENT_TIMEOUT`: timeout (minutes)
- `MAESTRO_MAX_CONCURRENT`: max active processes (`0` = unlimited)
- `MAESTRO_STAGGER_DELAY`: delay between launches (seconds)
- `MAESTRO_GEMINI_EXTRA_ARGS`: forwarded CLI flags (prefer `--policy`)
- `MAESTRO_CLEANUP_DISPATCH=true`: remove prompt files post-run

If `MAESTRO_GEMINI_EXTRA_ARGS` includes `--allowed-tools`, dispatch emits a deprecation warning and recommends Policy Engine usage via `--policy`.

## Hook Pipeline

Hooks are configured in `hooks/hooks.json`.

- SessionStart (`hooks/session-start.js`): prunes stale hook state, initializes session directory when an active session exists
- BeforeAgent (`hooks/before-agent.js`): prunes stale hook state, detects active agent via `detectAgentFromPrompt()` (`MAESTRO_CURRENT_AGENT` env var first, prompt regex fallback), stores active agent, injects compact session context
- AfterAgent (`hooks/after-agent.js`): validates delegated output contains both `Task Report` and `Downstream Context`, requests one retry on malformed output; skips validation for `techlead`/`orchestrator` agents
- SessionEnd (`hooks/session-end.js`): removes session hook state directory

## Gemini CLI Features Actively Leveraged

Maestro currently leverages:

- Extension manifest loading (`gemini-extension.json`)
- File-based slash commands (`commands/`)
- Local agents (`agents/` frontmatter + prompt body)
- Skill activation (`activate_skill`)
- Hook middleware (`hooks/hooks.json`)
- Plan mode tools (`enter_plan_mode`, `exit_plan_mode`) when enabled
- Policy Engine compatibility through forwarded `--policy` flags

Not currently configured by Maestro itself:

- Extension-level MCP server registration or management
