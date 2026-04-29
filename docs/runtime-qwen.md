# Qwen Runtime

The Qwen Code extension lives in `qwen/` (the output directory declared in `src/platforms/qwen/runtime-config.js`). The manifest (`qwen-extension.json`) and context file (`QWEN.md`) remain at the repo root so Qwen Code can discover the extension; generated artifacts (`qwen/agents/`, `qwen/hooks.json`) live in the subdirectory. It mirrors the Gemini CLI extension structure with Qwen-specific manifest, context, and tool mappings.

## Configuration

**Manifest**: `qwen-extension.json`
**Version**: 1.6.3
**Context File**: `QWEN.md`

### MCP Server

```json
{
  "command": "node",
  "args": ["${extensionPath}/mcp/maestro-server.js"],
  "cwd": "${extensionPath}",
  "env": { "MAESTRO_WORKSPACE_PATH": "${workspacePath}" }
}
```

The public server at `mcp/maestro-server.js` is a thin adapter. It sets `MAESTRO_RUNTIME=qwen`, requires canonical `src/mcp/maestro-server.js` directly, and runs the Qwen runtime against shared source in `src/`. Qwen declares `primary: filesystem` and `fallback: none`.

## Agent Naming

Qwen uses **snake_case** for agent names (matching Gemini's convention): `code_reviewer`, `api_designer`, `accessibility_specialist`.

Agent files are generated at `qwen/agents/*.md` with snake_case filenames (Qwen's own subdirectory, separate from Gemini's repo-root `agents/`).

## Delegation

Direct function call syntax:

```
coder(query: "Implement the user service...")
architect(query: "Design the auth system...")
```

## Commands

The Qwen runtime does not emit its own TOML command files. `src/generator/entry-point-expander.js` sets `qwen: null` in both `ENTRY_POINT_CONFIG` and `CORE_COMMAND_CONFIG`, so `expandEntryPoints('qwen')` and `expandCoreCommands('qwen')` return empty arrays. This is intentional: Qwen Code is Gemini-CLI-compatible and consumes the 12 TOML commands generated for Gemini at repo-root `commands/maestro/` when both extensions coexist. See `docs/runtime-gemini.md` for the full command list.

## Hooks

4 hook events (same lifecycle shape as Gemini):

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | `hooks/hook-runner.js qwen session-start` | Initialize hook state, prune stale sessions |
| `BeforeAgent` | `hooks/hook-runner.js qwen before-agent` | Detect agent, inject session context |
| `AfterAgent` | `hooks/hook-runner.js qwen after-agent` | Validate Task Report + Downstream Context |
| `SessionEnd` | `hooks/hook-runner.js qwen session-end` | Clean up hook state |

### AfterAgent Validation

Qwen uses the same post-delegation validation as Gemini:

- Checks for `## Task Report` (or `# Task Report`) and `## Downstream Context` headings
- First failure: blocks and requests retry
- Second failure (`stopHookActive=true`): allows through with warning

### Hook Adapter

Qwen reuses the shared Gemini-style adapter at `hooks/adapters/qwen-adapter.js` (or the shared Gemini adapter when the CLI JSON shape matches). Output format: `{ continue: boolean, systemMessage?: string }`.

## Policies

`policies/maestro.toml` — TOML-based shell guardrails evaluated by Qwen's policy engine (same rules as Gemini):

**Deny (priority 950)**:
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<`)

**Ask User (priority 850)**:
- `tee` commands
- Output redirection (`>`, `>>`)

## Tool Mapping

Qwen tools use canonical names with Qwen-specific overrides declared in `src/platforms/qwen/runtime-config.js`:

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

Qwen agent stubs share the Gemini shape:

```yaml
---
name: coder
kind: local
description: "..."
tools: [read_file, write_file, ...]
temperature: 0.2
max_turns: 25
timeout_mins: 10
---
```

Fields: `kind` (always "local"), `temperature`, `max_turns`, `timeout_mins`.

## Generated Files

```text
qwen/
├── agents/                39 agent stubs (snake_case, Qwen tool names)
└── hooks.json             hook registration (SubagentStart, SubagentStop, …)
```

The Qwen extension reuses Gemini's repo-root `commands/maestro/`, `hooks/`, `mcp/`, and `policies/` artifacts when both runtimes coexist; no duplicates are written under `qwen/`.

## Notes

- Qwen writes its own agent stubs and hook config to `qwen/agents/` and `qwen/hooks.json` (separate from Gemini's repo-root outputs). For the `/maestro:*` command surface, Qwen reuses Gemini's repo-root `commands/maestro/` TOML files — the Qwen generator does not duplicate these.
- The `scripts/update-versions.js` release helper bumps `qwen-extension.json` with the other runtime manifests so release metadata stays aligned.
