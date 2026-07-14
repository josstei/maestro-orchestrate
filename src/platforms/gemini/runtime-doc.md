# Gemini Runtime

The Gemini CLI extension lives at the repository root. It is the primary runtime target.

## Runtime Surface Facts

<!-- BEGIN GENERATED RUNTIME FACTS -->
<!-- END GENERATED RUNTIME FACTS -->

## Configuration

**Manifest**: `gemini-extension.json`
**Version**: generated from `package.json`
**Context File**: `GEMINI.md`

### MCP Server

```json
{
  "command": "npx",
  "args": ["-y", "-p", "@josstei/maestro@<package version>", "maestro-mcp-server"],
  "env": {
    "MAESTRO_RUNTIME": "gemini",
    "MAESTRO_WORKSPACE_PATH": "${workspacePath}"
  }
}
```

The manifest launches the server via `npx` against the versioned `@josstei/maestro` npm package, with `MAESTRO_RUNTIME=gemini`. The public `maestro-mcp-server` bin resolves to compiled `dist/src/bin/maestro-mcp-server.js`, which loads the compiled server from `dist/src/mcp/maestro-server.js`. The repo-root `mcp/maestro-server.js` adapter still ships for direct source-checkout use and also requires the compiled `dist/src` server. Gemini uses the manifest-backed content provider with no fallback: installed `dist/src` storage is packed, while generated source-checkout storage is file-backed and reads stable paths live; source additions, removals, and renames require regeneration and provider/server recreation.

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

4 hook events, no matchers, 10-second timeout:

| Event | Script | Purpose |
|-------|--------|---------|
| `SessionStart` | `hooks/hook-runner.js gemini session-start` | Initialize hook state, prune stale sessions |
| `BeforeAgent` | `hooks/hook-runner.js gemini before-agent` | Detect agent, inject session context |
| `AfterAgent` | `hooks/hook-runner.js gemini after-agent` | Validate Task Report + Downstream Context |
| `SessionEnd` | `hooks/hook-runner.js gemini session-end` | Clean up hook state |

### AfterAgent Validation

Gemini has a post-delegation validation hook that Claude lacks:

- Checks for `## Task Report` (or `# Task Report`) and `## Downstream Context` headings
- First failure: blocks and requests retry
- Second failure (stopHookActive=true): allows through with warning

### Hook Adapter

`hooks/adapters/gemini-adapter.js` normalizes Gemini CLI JSON input:

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

The canonical feature set (same flags across all runtimes, values per runtime):

<!-- @feature-flags -->

See `src/platforms/gemini/runtime-config.ts` for the authoritative values.

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
agents/                    39 agent stubs (snake_case)
commands/maestro/          12 TOML commands
hooks/                     thin hook runner, adapter wrapper, hooks.json
mcp/                       thin MCP entrypoint
policies/                  1 TOML policy file
README.md, GEMINI.md, gemini-extension.json, .geminiignore
```

These files are generated by `npm run generate` and are untracked in git (`.gitignore`-governed) — a fresh clone must run `npm run generate` once before local runtime use (e.g. `gemini extensions link .`). Hosted installs (`gemini extensions install <url>`) resolve from the GitHub release archive, which already bundles the generated output, so no local generate step applies there.

### Dev-Loop and Publish-Window Consequences

Because the manifest launches the server via `npx -y -p @josstei/maestro@<package version> maestro-mcp-server`, a locally linked extension (`gemini extensions link .`) and TUI dogfooding now execute the *published* `@<package version>` package from the npm registry, not local `src/`. Local iteration on unreleased `src/` changes requires a local-path launch override (point `command`/`args` at a local `node dist/src/bin/maestro-mcp-server.js` invocation after `npm run build`) or `npm link` so the linked package resolves to the working tree. Separately, between bumping `package.json`'s version and running `npm publish`, the pinned `@<package version>` does not yet exist on the registry and `npx` 404s — publish must always precede advertising (tagging, announcing, or launching a manifest pinned to) the new version.
