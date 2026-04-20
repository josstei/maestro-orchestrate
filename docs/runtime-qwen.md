# Qwen Runtime

The Qwen Code extension lives at the repository root. It mirrors the Gemini CLI extension structure with Qwen-specific manifest, context, and tool mappings.

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

Agent files are generated at `agents/*.md` with snake_case filenames.

## Delegation

Direct function call syntax:

```
coder(query: "Implement the user service...")
architect(query: "Design the auth system...")
```

## Commands

12 TOML commands in `commands/maestro/`:

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
| `read_many_files` | `read_file (called per-file)` |
| `list_directory` | `list_directory` |
| `glob` | `glob` |
| `grep_search` | `grep_search` |
| `google_web_search` | `google_web_search` |
| `web_fetch` | `web_fetch` |
| `write_file` | `write_file` |
| `replace` | `replace` |
| `run_shell_command` | `run_shell_command` |
| `ask_user` | `ask_user` |
| `write_todos` | `not available — track progress in model context` |
| `activate_skill` | `activate_skill` |
| `enter_plan_mode` | `enter_plan_mode` |
| `exit_plan_mode` | `exit_plan_mode` |
| `codebase_investigator` | `codebase_investigator` |

## Feature Flags

Qwen's `src/platforms/qwen/runtime-config.js` reuses the Gemini feature profile with Qwen-specific overrides where required. Refer to the runtime-config source for the authoritative flag set; typical values include:

```
mcpSkillContentHandler:  true
policyEnforcer:          false (native TOML policies instead)
exampleBlocks:           false
qwenStateContract:       true
qwenRuntimeConfig:       true
```

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

```
agents/                    39 agent stubs (snake_case)
commands/maestro/          12 TOML commands
hooks/                     thin hook runner, adapter wrapper, hooks.json
mcp/                       thin MCP entrypoint
policies/                  1 TOML policy file
QWEN.md, qwen-extension.json
```

## Notes

- Qwen shares the repo-root output location with Gemini. When both extensions are installed in the same workspace, `agents/`, `commands/maestro/`, `hooks/`, `mcp/`, and `policies/` are owned by the most recent generator run; the runtime-specific difference is the context file (`GEMINI.md` vs `QWEN.md`) and the manifest (`gemini-extension.json` vs `qwen-extension.json`).
- The `scripts/update-versions.js` release helper bumps `gemini-extension.json` automatically but does not yet include `qwen-extension.json` — maintainers bumping a release should edit `qwen-extension.json` manually or extend the helper's `JSON_VERSION_FILES` list.
