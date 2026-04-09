# Gemini Runtime

The Gemini CLI extension lives at the repository root. It is the primary runtime target.

## Configuration

**Manifest**: `gemini-extension.json`
**Version**: 1.6.0
**Context File**: `GEMINI.md`

### MCP Server

```json
{
  "command": "node",
  "args": ["${extensionPath}/mcp/maestro-server.js"],
  "cwd": "${extensionPath}",
  "env": { "MAESTRO_WORKSPACE_PATH": "${workspacePath}" }
}
```

The public server at `mcp/maestro-server.js` is a thin adapter. It loads `mcp/canonical-source.js`, resolves the canonical `src/mcp/maestro-server.js`, and runs the Gemini runtime against shared source in `src/`. Gemini declares `primary: filesystem` and `fallback: none`.

## Agent Naming

Gemini uses **snake_case** for agent names: `code_reviewer`, `api_designer`, `accessibility_specialist`.

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
| `orchestrate.toml` | `src/platforms/gemini/commands/maestro/` |
| `execute.toml` | `src/platforms/gemini/commands/maestro/` |
| `resume.toml` | `src/platforms/gemini/commands/maestro/` |
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

4 hook events, no matchers, 10-second timeout:

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | hooks/session-start.js | Initialize hook state, prune stale sessions |
| `BeforeAgent` | hooks/before-agent.js | Detect agent, inject session context |
| `AfterAgent` | hooks/after-agent.js | Validate Task Report + Downstream Context |
| `SessionEnd` | hooks/session-end.js | Clean up hook state |

### AfterAgent Validation

Gemini has a post-delegation validation hook that Claude lacks:

- Checks for `## Task Report` (or `# Task Report`) and `## Downstream Context` headings
- First failure: blocks and requests retry
- Second failure (stopHookActive=true): allows through with warning

### Hook Adapter

`hooks/hook-adapter.js` normalizes Gemini CLI JSON input:

| Gemini Field | Internal Field |
|-------------|----------------|
| `session_id` | `sessionId` |
| `cwd` | `cwd` |
| `hook_event_name` | `event` |
| (hardcoded null) | `agentName` |
| `prompt` | `agentInput` |
| `prompt_response` | `agentResult` |
| `stop_hook_active` | `stopHookActive` |

Output format: `{ continue: boolean, systemMessage?: string }`

## Policies

`policies/maestro.toml` — TOML-based shell guardrails evaluated by Gemini's native policy engine:

**Deny (priority 950)**:
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<`)

**Ask User (priority 850)**:
- `tee` commands
- Output redirection (`>`, `>>`)

## Tool Mapping

Gemini tools use canonical names (identity mapping):

| Canonical | Gemini |
|-----------|--------|
| `read_file` | `read_file` |
| `read_many_files` | `read_many_files` |
| `list_directory` | `list_directory` |
| `glob` | `glob` |
| `grep_search` | `grep_search` |
| `google_web_search` | `google_web_search` |
| `web_fetch` | `web_fetch` |
| `write_file` | `write_file` |
| `replace` | `replace` |
| `run_shell_command` | `run_shell_command` |
| `ask_user` | `ask_user` |
| `write_todos` | `write_todos` |
| `activate_skill` | `activate_skill` |
| `enter_plan_mode` | `enter_plan_mode` |
| `exit_plan_mode` | `exit_plan_mode` |
| `codebase_investigator` | `codebase_investigator` |

## Feature Flags

```
mcpSkillContentHandler:  true
policyEnforcer:          false (native TOML policies instead)
exampleBlocks:           false
geminiHookModel:         true
geminiDelegation:        true
geminiToolExamples:      true
geminiAskFormat:         true
geminiStateContract:     true
geminiRuntimeConfig:     true
```

## Agent Frontmatter

Gemini agent stubs include:

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
agents/                    22 agent stubs (snake_case)
commands/maestro/          12 TOML commands
hooks/                     runtime hook adapters + canonical-source helper + hooks.json
mcp/                       public MCP entrypoint + canonical-source helper
policies/                  1 TOML policy file
README.md, GEMINI.md, gemini-extension.json, .geminiignore
```
