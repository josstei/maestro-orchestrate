# Gemini Runtime

The Gemini CLI extension lives at the repository root. It is the primary runtime target.

## Configuration

**Manifest**: `gemini-extension.json`
**Version**: 1.5.0
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

The bundled server at `mcp/maestro-server.js` is a thin wrapper over `mcp/maestro-server-core.js`. Gemini declares `primary: filesystem` and `fallback: none`, so shared content is read from `./src/` via `srcRelativePath="src"`.

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
| `orchestrate.toml` | `src/runtime-only/gemini/commands/` |
| `execute.toml` | `src/runtime-only/gemini/commands/` |
| `resume.toml` | `src/runtime-only/gemini/commands/` |
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

- Checks for both `## Task Report` and `## Downstream Context` headings
- First failure: blocks and requests retry
- Second failure (stopHookActive=true): allows through with warning

### Hook Adapter

`hooks/hook-adapter.js` normalizes Gemini CLI JSON input:

| Gemini Field | Internal Field |
|-------------|----------------|
| `session_id` | `sessionId` |
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
| `read_file` / `read_many_files` | `read_file` / `read_many_files` |
| `write_file` | `write_file` |
| `glob` | `glob` |
| `grep_search` | `grep_search` |
| `run_shell_command` | `run_shell_command` |
| `ask_user` | `ask_user` |

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

## Generated Files (~79 total)

```
agents/                    22 agent stubs (snake_case)
commands/maestro/          12 TOML commands
hooks/                     6 files (5 scripts + hooks.json)
lib/                       32 shared library files
mcp/                       1 bundled server
policies/                  1 TOML policy file
README.md, GEMINI.md, gemini-extension.json, .geminiignore
```
