# Codex Runtime

The Codex plugin lives in `plugins/maestro/`.

## Configuration

**Manifest**: `plugins/maestro/.codex-plugin/plugin.json`
**Version**: generated from `package.json`
**MCP Config**: `plugins/maestro/.mcp.json`
**App Config**: `plugins/maestro/.app.json`
**Runtime Guide**: `plugins/maestro/references/runtime-guide.md`

### MCP Server

```json
{
  "command": "npx",
  "args": ["-y", "-p", "@josstei/maestro@<package version>", "maestro-mcp-server"]
}
```

Codex plugin manifests lack a plugin-root substitution variable (unlike Antigravity's `${PLUGIN_ROOT}`, Claude's `${CLAUDE_PLUGIN_ROOT}`, or Qwen's `${extensionPath}`), so relative paths in `args` would resolve against the user's workspace rather than the plugin directory. Maestro invokes the server via `npx` using the versioned npm package for the current release. The `maestro-mcp-server` bin lives in `bin/maestro-mcp-server.js` and is declared in `package.json`; it sets `MAESTRO_EXTENSION_PATH` to the package root and delegates to `src/mcp/maestro-server.js`. The server identifies the Codex runtime from the `clientInfo.name` Codex sends in `initialize` (`codex-mcp-client`); setting `MAESTRO_RUNTIME` overrides that.

Workspace resolution follows the shared MCP contract: tools that need a workspace fail with `WORKSPACE_NOT_INITIALIZED` until the orchestrator calls `initialize_workspace(workspace_path)`. To suggest that path, `get_runtime_context` returns a `workspace_suggestion` taken from, in order:
- `MAESTRO_WORKSPACE_PATH`, when the host exports it
- the first valid local `file://` root in the MCP client `roots/list` response
- the server's `cwd`

Candidates inside a host extension cache (`.codex/plugins`, `.claude/plugins`, or Antigravity's plugin directories) are skipped. Because session state is anchored to the path passed to `initialize_workspace`, it stays under the workspace's `docs/maestro` regardless of where `npx` materializes the package.

### Plugin Manifest

```json
{
  "name": "maestro",
  "version": "<package version>",
  "description": "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
  "author": { "name": "josstei", "email": "hello@josstei.dev", "url": "https://github.com/josstei" },
  "homepage": "https://github.com/josstei/maestro-orchestrate",
  "repository": "https://github.com/josstei/maestro-orchestrate",
  "license": "Apache-2.0",
  "keywords": ["orchestration", "multi-agent", "planning", "execution", "coding"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "apps": "./.app.json",
  "interface": {
    "displayName": "Maestro",
    "shortDescription": "Multi-agent coding orchestration for Codex",
    "longDescription": "Generated Codex runtime for Maestro. ...",
    "developerName": "josstei",
    "category": "Coding",
    "capabilities": ["Interactive", "Write"],
    "websiteURL": "https://github.com/josstei/maestro-orchestrate",
    "defaultPrompt": ["Use Maestro to orchestrate a feature...", "..."],
    "brandColor": "#2563EB"
  }
}
```

## Agent Naming

Codex uses **kebab-case** agent identifiers in runtime context and MCP-served methodology content, matching Claude: `code-reviewer`, `api-designer`.

## Delegation

Codex-native `spawn_agent(...)`:

```
spawn_agent(...)
```

The runtime guide recommends mapping Maestro agents to Codex delegation modes:
- Evidence gathering or repo mapping → `explorer`
- Bounded implementation → `worker`
- No clear benefit from delegation → stay local

## Skills

19 Markdown skills in `plugins/maestro/skills/`:

Codex keeps built-in `/review`, `/debug`, and `/resume` commands, so Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` instead of those bare names.

**Core (3)** — unprefixed in the plugin, invoked as `$maestro:<name>`:
- `orchestrate/SKILL.md`
- `execute/SKILL.md`
- `resume-session/SKILL.md`

**Entry-point (9)** — unprefixed in the plugin, invoked as `$maestro:<name>`:
- `review-code/SKILL.md`, `debug-workflow/SKILL.md`, `archive/SKILL.md`
- `status/SKILL.md`, `security-audit/SKILL.md`
- `perf-check/SKILL.md`, `seo-audit/SKILL.md`
- `a11y-audit/SKILL.md`, `compliance-check/SKILL.md`

**Infrastructure (7)** — NOT prefixed:
- `code-review/SKILL.md`, `delegation/SKILL.md`, `design-dialogue/SKILL.md`
- `execution/SKILL.md`, `implementation-planning/SKILL.md`
- `session-management/SKILL.md`, `validation/SKILL.md`

## Hooks

**Codex has no hooks.** No hook registration exists in the plugin manifest. Delegation tracking and policy enforcement are handled through inline methodology constraints.

## Policies

**No policy enforcement.** Codex relies on inline constraints within skill and agent methodologies rather than runtime-level policy rules.

## MCP Behavior

The runtime guide states:

> If Maestro MCP tools are available, prefer them for stateful operations. If the MCP server is unavailable in the current Codex environment, fall back to direct file operations under `<state_dir>` as described by the shared skills.

This MCP-first with direct filesystem fallback approach exists because spawned Codex agents may not have access to the parent plugin's MCP server. When MCP is available, shared methodology and agent bodies are served from the `src/` directory of the `@josstei/maestro` npm package that `npx` runs, the same `src/` tree the server runs from. There is no hand-maintained packaged registry copy and no plugin-level `agents/` directory.

## Tool Mapping

Codex tools use descriptive names rather than direct API mappings:

| Canonical | Codex |
|-----------|-------|
| `read_file` / `read_many_files` | direct file reads |
| `write_file` / `replace` | `apply_patch` |
| `list_directory` / `glob` | `exec_command` (rg --files, ls, find) |
| `grep_search` | `exec_command` (rg) |
| `google_web_search` | web search |
| `web_fetch` | web fetch |
| `run_shell_command` | `exec_command` |
| `ask_user` | `request_user_input` |
| `write_todos` | `update_plan` |
| `activate_skill` | open the referenced skill and follow it |
| `enter_plan_mode` | `update_plan` |
| `exit_plan_mode` | `request_user_input` approval |
| `codebase_investigator` | local inspection or `spawn_agent` |

## Feature Flags

The canonical feature set (same 3 flags across all runtimes, values per runtime):

```
exampleBlocks:             false
scriptBasedStateContract:  false
codexStateContract:        true
```

See `src/platforms/codex/runtime-config.js` for the authoritative values.

## Path Resolution

Codex uses relative paths:

- `env.extensionPath`: `.` (plugin root)
- `env.workspacePath`: `MAESTRO_WORKSPACE_PATH`, the first source of `workspace_suggestion` when the host exports it

This differs from Qwen (passthrough variables), Claude (environment variable references), and Antigravity (`${PLUGIN_ROOT}`, substituted in the `mcp_config.json` args).

When `MAESTRO_WORKSPACE_PATH` is not set, the suggestion comes from the first valid local `file://` root in the client `roots/list` response, then from the server's `cwd`. The orchestrator still passes the chosen path to `initialize_workspace`; the server never falls back to the suggestion on its own.

## Canonical Filesystem Content

Codex follows the same source-of-truth model as the other runtimes:

- shared skills, protocols, templates, references, and agent bodies are authored in canonical root `src/`
- generated `plugins/maestro/src/` is the detached runtime payload for published Codex bundles
- generated `plugins/maestro/skills/` files are public entrypoints or discovery stubs only
- Codex does not consume plugin agent files; `get_agent` serves the canonical methodology bodies
- no tracked `plugins/maestro/lib/` mirror or bundled content registry is part of the runtime

## Runtime Files

```
plugins/maestro/
├── skills/                [generated] 19 skill directories
├── src/                   [generated] detached runtime payload
├── references/            runtime-guide.md (hand-maintained)
├── .codex-plugin/         [generated] plugin.json manifest
├── .mcp.json              [generated] npx-based spawn (no local wrapper)
├── .app.json              [generated]
└── README.md              hand-maintained
```

The repo-root `.agents/plugins/marketplace.json` is generated too. The runtime server is invoked via `npx` rather than a local wrapper file, so the plugin ships no local `mcp/` directory under `plugins/maestro/`. The bin entrypoint lives in the repo root `bin/maestro-mcp-server.js`; `node scripts/generate.js` derives `plugins/maestro/.mcp.json` from `package.json` so the plugin manifest and MCP package spec stay on the same version.

## Differences from Other Runtimes

| Aspect | Antigravity | Claude | Qwen | Codex |
|--------|-------------|--------|------|-------|
| Agent names | kebab-case | kebab-case | snake_case | kebab-case |
| Delegation | invoke_subagent | Agent subagent | Direct function call | spawn_agent |
| Hooks | SessionStart, PreToolUse + `run_command` matcher in `antigravity/hooks.json` | SessionStart, SessionEnd, PreToolUse + matchers | 4 events in `qwen/hooks.json`, no matchers | None |
| Policies | JS hook enforcer | JS hook enforcer | TOML rules | None |
| Skill surface | 19 skills, plugin namespace `/maestro:*` | 19 skills | N/A (12 TOML commands) | plugin namespace `$maestro:*` |
| Path style | `${PLUGIN_ROOT}` substitution | Env var refs | Variable passthrough | `npx` bin |
| Extra files | policy-enforcer, `mcp_config.json`, `hooks.json` | policy-enforcer | Qwen manifest, context, TOML commands, policy rules | runtime guide |
| Runtime payload | thin entrypoint + detached `src/` payload | thin entrypoint + detached `src/` payload | repo-root thin entrypoint + `agents/` stubs | npx bin + detached `src/` payload |
