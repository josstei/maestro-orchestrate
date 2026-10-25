# Codex Runtime

The Codex plugin lives in `plugins/maestro/`.

## Configuration

**Manifest**: `plugins/maestro/.codex-plugin/plugin.json`
**Version**: generated from `package.json`
**MCP Config**: `plugins/maestro/.mcp.json`
**App Config**: `plugins/maestro/.app.json`
**Runtime Guide**: `plugins/maestro/references/runtime-guide.md`

`src/platforms/metadata.js` generates the manifest from `package.json`; see `plugins/maestro/.codex-plugin/plugin.json` for its fields.

### MCP Server

```json
{
  "command": "npx",
  "args": ["-y", "-p", "@josstei/maestro@<package version>", "maestro-mcp-server"]
}
```

Codex plugin manifests lack a plugin-root substitution variable (unlike Antigravity's `${PLUGIN_ROOT}`, Claude's `${CLAUDE_PLUGIN_ROOT}`, or Qwen's `${extensionPath}`), so relative paths in `args` would resolve against the user's workspace rather than the plugin directory, and the runtime config's `env.extensionPath` is `.`. Maestro invokes the server via `npx` using the versioned npm package for the current release. The launcher is the `maestro-mcp-server` bin, `bin/maestro-mcp-server.js`, declared in `package.json`; it sets `MAESTRO_EXTENSION_PATH` to the package root and loads the shared server (see [MCP Server Packaging](https://github.com/josstei/maestro-orchestrate/blob/main/docs/architecture.md#mcp-server-packaging)), which identifies Codex by its `clientInfo.name`, `codex-mcp-client`.

Workspace resolution follows the shared MCP contract: tools that need a workspace fail with `WORKSPACE_NOT_INITIALIZED` until the orchestrator calls `initialize_workspace(workspace_path)`. To suggest that path, `get_runtime_context` returns a `workspace_suggestion` taken from, in order:
- `MAESTRO_WORKSPACE_PATH`, when the host exports it
- the first valid local `file://` root in the MCP client `roots/list` response
- the server's `cwd`

Candidates inside a host extension cache (`.codex/plugins`, `.claude/plugins`, or Antigravity's plugin directories) are skipped. Because session state is anchored to the path passed to `initialize_workspace`, it stays under the workspace's `<state_dir>` (`MAESTRO_STATE_DIR`, default `docs/maestro`) regardless of where `npx` materializes the package.

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

`plugins/maestro/skills/` holds a public skill for each core command and entry point (see [Entry-Point Registry](https://github.com/josstei/maestro-orchestrate/blob/main/docs/architecture.md#entry-point-registry)), invoked as `$maestro:<skill>`, plus a discovery stub for each shared skill. Codex keeps built-in `/review`, `/debug`, and `/resume` commands, so Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` instead of those bare names.

## Hooks

**Codex has no hooks.** No hook registration exists in the plugin manifest. Delegation tracking and policy enforcement are handled through inline methodology constraints.

## Policies

**No policy enforcement.** Codex relies on inline constraints within skill and agent methodologies rather than runtime-level policy rules.

## MCP Behavior

Skills prefer the Maestro MCP tools for stateful operations and fall back to direct file operations under `<state_dir>` when the server is unavailable, because spawned Codex agents may not reach the parent plugin's MCP server; see the [runtime guide](../plugins/maestro/references/runtime-guide.md#mcp-behavior). The server reads shared methodology and agent bodies from the `src/` of the `@josstei/maestro` package that `npx` runs; the plugin has no `agents/` directory.

## Tool Mapping

Codex tools use descriptive names rather than direct API mappings. `get_runtime_context` returns this table from `src/platforms/codex/runtime-config.js`; the runtime guide's [tool mapping](../plugins/maestro/references/runtime-guide.md#tool-mapping) is the model-facing version, with usage notes:

| Canonical | Codex |
|-----------|-------|
| `read_file` | `direct file reads` |
| `read_many_files` | `direct file reads` |
| `write_file` | `apply_patch` |
| `replace` | `apply_patch` |
| `list_directory` | exec_command (`rg --files` or `ls`) |
| `glob` | exec_command (`rg --files` or `find`) |
| `grep_search` | exec_command (`rg`) |
| `google_web_search` | `web search` |
| `web_fetch` | `web fetch` |
| `run_shell_command` | `exec_command` |
| `ask_user` | `request_user_input` |
| `write_todos` | `update_plan` |
| `activate_skill` | `open the referenced skill and follow it` |
| `enter_plan_mode` | `update_plan` |
| `exit_plan_mode` | `request_user_input approval` |
| `codebase_investigator` | `local inspection or spawn_agent` |

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

The repo-root `.agents/plugins/marketplace.json` is generated too. The plugin ships no local `mcp/` directory: `node scripts/generate.js` derives `plugins/maestro/.mcp.json` from `package.json`, so the plugin manifest and the MCP package spec stay on the same version.
