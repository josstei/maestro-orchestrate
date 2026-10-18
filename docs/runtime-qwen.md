# Qwen Runtime

The repo root is Qwen Code's extension directory and the output directory (`./`) declared in `src/platforms/qwen/runtime-config.js`. The manifest (`qwen-extension.json`), context file (`QWEN.md`), generated agent stubs (`agents/`), TOML commands (`commands/maestro/`), policy pack (`policies/maestro.toml`), and the MCP server and hook runner shims (`mcp/maestro-server.js`, `hooks/hook-runner.js`) live at the repo root. The `qwen/` subdirectory holds only the generated hook registration (`qwen/hooks.json`).

## Configuration

**Manifest**: `qwen-extension.json`
**Version**: generated from `package.json`
**Context File**: `QWEN.md`

### MCP Server

```json
{
  "command": "node",
  "args": ["${extensionPath}/mcp/maestro-server.js"],
  "cwd": "${extensionPath}",
  "env": {
    "MAESTRO_RUNTIME": "qwen",
    "MAESTRO_WORKSPACE_PATH": "${workspacePath}"
  }
}
```

The public server at `mcp/maestro-server.js` is a thin adapter. The Qwen manifest launches it with `MAESTRO_RUNTIME=qwen`; the adapter also defaults to Qwen if that env var is absent. It requires canonical `src/mcp/maestro-server.js` directly and runs the Qwen runtime against shared source in `src/`. Content tools read from the filesystem only.

## Agent Naming

Qwen uses **snake_case** for agent names: `code_reviewer`, `api_designer`, `accessibility_specialist`.

Agent files are generated at the repo-root `agents/*.md` with snake_case filenames, because Qwen Code loads an extension's subagents from `<extension>/agents/`.

## Delegation

Direct function call syntax:

```
coder(query: "Implement the user service...")
architect(query: "Design the auth system...")
```

## Commands

12 TOML commands in the repo-root `commands/maestro/`, generated for the Qwen runtime by `src/generator/entry-point-expander.js`:

| Command | Source |
|---------|--------|
| `orchestrate.toml` | Core command registry |
| `execute.toml` | Core command registry |
| `resume.toml` | Core command registry |
| `review.toml` | Entry-point registry |
| `debug.toml` | Entry-point registry |
| `archive.toml` | Entry-point registry |
| `status.toml` | Entry-point registry |
| `security-audit.toml` | Entry-point registry |
| `perf-check.toml` | Entry-point registry |
| `seo-audit.toml` | Entry-point registry |
| `a11y-audit.toml` | Entry-point registry |
| `compliance-check.toml` | Entry-point registry |

The 3 core commands carry a `## Runtime: Qwen Code` preamble that maps step references to Qwen Code syntax: `skill` to load skills, Maestro's MCP tools by the names Qwen Code lists for the `maestro` server, direct agent calls, `exit_plan_mode` with `plan` set to the plan's markdown content (not a file path), and `ask_user_question` for prompts and approvals. `resume.toml` also injects the active session state by running `src/scripts/read-active-session.js` under `$MAESTRO_EXTENSION_PATH` (default `$HOME/.qwen/extensions/maestro`), or reports "No active session" when that script is missing.

## Hooks

4 hook events in `qwen/hooks.json`, no matchers, timeouts in milliseconds (10000):

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | `hooks/hook-runner.js qwen session-start` | Initialize hook state, prune stale sessions |
| `SubagentStart` | `hooks/hook-runner.js qwen before-agent` | Detect agent, inject session context |
| `SubagentStop` | `hooks/hook-runner.js qwen after-agent` | Validate Task Report + Downstream Context |
| `SessionEnd` | `hooks/hook-runner.js qwen session-end` | Clean up hook state |

### SubagentStop Validation

Qwen validates each subagent's handoff report after delegation:

- Checks for `## Task Report` (or `# Task Report`) and `## Downstream Context` headings
- First failure: blocks and requests retry
- Second failure (`stopHookActive=true`): allows through with warning

### Hook Adapter

`src/platforms/qwen/hook-adapter.js` normalizes Qwen Code JSON input:

| Qwen Field | Internal Field |
|-----------|----------------|
| `session_id` | `sessionId` |
| `cwd` | `cwd` |
| `agent_type` | `agentName` |
| (hardcoded null) | `agentInput` |
| `last_assistant_message` (`SubagentStop` only) | `agentResult` |
| `stop_hook_active` | `stopHookActive` |

Output format: `{ continue?: false, decision?: "block"|"allow", reason?: string, hookSpecificOutput?: { additionalContext: string } }`. A deny emits `continue: false` with `decision: "block"` and exits with code 2; an allow that carries a reason emits `decision: "allow"`; any context message goes in `hookSpecificOutput.additionalContext`. If the hook fails, the runner emits `{ continue: true, decision: "allow" }`.

## Policies

`policies/maestro.toml` — TOML-based shell guardrails evaluated by Qwen's policy engine. The Qwen builder in `src/platforms/metadata.js` generates the file from `src/core/policy-rules.js`, the same rules the Claude policy enforcer applies:

**Deny (priority 950)**:
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<EOF`, `<< 'EOF'`, `<<-EOF`; not here-strings `<<<` or arithmetic shifts such as `1<<4`)

**Ask User (priority 850)**:
- `tee` commands
- Output redirection (`>`, `>>`)

## Tool Mapping

Qwen maps the canonical tool names to Qwen Code tools in `src/platforms/qwen/runtime-config.js`:

| Canonical | Qwen |
|-----------|------|
| `read_file` | `read_file` |
| `read_many_files` | `read_many_files` |
| `list_directory` | `list_directory` |
| `glob` | `glob` |
| `grep_search` | `grep_search` |
| `google_web_search` | `web_search` |
| `web_fetch` | `web_fetch` |
| `write_file` | `write_file` |
| `replace` | `edit` |
| `run_shell_command` | `run_shell_command` |
| `ask_user` | `ask_user_question` |
| `write_todos` | `todo_write` |
| `activate_skill` | `skill` |
| `enter_plan_mode` | `enter_plan_mode` |
| `exit_plan_mode` | `exit_plan_mode` |
| `codebase_investigator` | `codebase_investigator` |

## Feature Flags

The canonical feature set (same 4 flags across all runtimes, values per runtime):

```
exampleBlocks:             false
claudeStateContract:       false
scriptBasedStateContract:  true
codexStateContract:        false
```

See `src/platforms/qwen/runtime-config.js` for the authoritative values.

## Agent Frontmatter

Qwen agent stubs carry the fields listed in Qwen's `agentFrontmatter.fields`, with `max_turns` before a block-list `tools` written in Qwen tool names:

```yaml
---
name: coder
kind: local
description: "..."
max_turns: 25
tools:
  - read_file
  - edit
  - todo_write
  - skill
  - ask_user_question
  - ...
---
```

Fields: `kind` (always "local"), `max_turns`.

## Runtime Files

```text
qwen/
└── hooks.json             [generated] hook registration (SubagentStart, SubagentStop, …)
```

The Qwen extension also owns these repo-root artifacts:

```text
agents/                    [generated] 39 agent stubs (snake_case, Qwen tool names)
commands/maestro/          [generated] 12 TOML commands
policies/                  [generated] maestro.toml policy pack
mcp/                       maestro-server.js shim (hand-maintained, defaults to MAESTRO_RUNTIME=qwen)
hooks/                     hook-runner.js shim (hand-maintained)
qwen-extension.json        [generated] extension manifest
QWEN.md                    hand-maintained context file
```

## Notes

- `node scripts/generate.js` derives `qwen-extension.json` from `package.json` with the other runtime manifests so release metadata stays aligned.
