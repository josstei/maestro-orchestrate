# Codex Runtime

The Codex plugin lives in `plugins/maestro/`.

## Configuration

**Manifest**: `plugins/maestro/.codex-plugin/plugin.json`
**Version**: 1.6.1
**MCP Config**: `plugins/maestro/.mcp.json`
**App Config**: `plugins/maestro/.app.json`
**Runtime Guide**: `plugins/maestro/references/runtime-guide.md`

### MCP Server

```json
{
  "command": "node",
  "args": ["./mcp/maestro-server.js"],
  "cwd": "."
}
```

The public server at `plugins/maestro/mcp/maestro-server.js` is a thin adapter. It sets `MAESTRO_RUNTIME=codex`, prefers canonical repo `src/mcp/maestro-server.js` when the plugin is launched from the repository, and falls back to bundled `plugins/maestro/src/mcp/maestro-server.js` for detached installs. Codex declares `primary: filesystem` and `fallback: none`, the same as Gemini and Claude.

For workspace resolution, Codex now follows the shared runtime contract:
- use `MAESTRO_WORKSPACE_PATH` when the host exports it explicitly
- otherwise fall back to the MCP client `roots/list` response
- only then fall back to inherited env and `cwd` heuristics

That keeps Maestro state rooted under the actual workspace `docs/maestro` path even when the Codex plugin is launched from an isolated bundle directory.

### Plugin Manifest

```json
{
  "name": "maestro",
  "version": "1.6.1",
  "description": "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
  "author": { "name": "josstei", "url": "https://github.com/josstei" },
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

**Core (3)** — unprefixed in the plugin, invoked as `$maestro:<name>`:
- `orchestrate/SKILL.md`
- `execute/SKILL.md`
- `resume/SKILL.md`

**Entry-point (9)** — unprefixed in the plugin, invoked as `$maestro:<name>`:
- `review/SKILL.md`, `debug/SKILL.md`, `archive/SKILL.md`
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

> If Maestro MCP tools are available, prefer them for stateful operations. If the MCP server is unavailable in the current Codex environment, fall back to direct file operations under `docs/maestro` as described by the shared skills.

This MCP-first with direct filesystem fallback approach exists because spawned Codex agents may not have access to the parent plugin's MCP server. When MCP is available, shared methodology and agent bodies are resolved from generated local `plugins/maestro/src/`, which is produced from canonical root `src/`; there is no hand-maintained packaged registry copy and no plugin-level `agents/` directory.

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

```
mcpSkillContentHandler:  true
policyEnforcer:          false
exampleBlocks:           false
codexDelegation:         true
codexStateContract:      true
codexRuntimeConfig:      true
```

All Gemini-specific and Claude-specific flags are `false`.

## Path Resolution

Codex uses relative paths (`relativeExtensionPath: true`):

- `env.extensionPath`: `.` (plugin root)
- `env.workspacePath`: `MAESTRO_WORKSPACE_PATH` when available
- Path references in generated content are computed relative to the output file's location

This differs from Gemini (passthrough variables) and Claude (environment variable references).

When `MAESTRO_WORKSPACE_PATH` is not set, the MCP server uses the first valid local `file://` root from the client `roots/list` response before falling back to legacy env and `cwd` detection.

## Canonical Filesystem Content

Codex follows the same source-of-truth model as the other runtimes:

- shared skills, protocols, templates, references, and agent bodies are authored in canonical root `src/`
- generated `plugins/maestro/src/` is the detached runtime payload for published Codex bundles
- generated `plugins/maestro/skills/` files are public entrypoints or discovery stubs only
- Codex does not consume plugin agent files; `get_agent` serves the canonical methodology bodies
- no tracked `plugins/maestro/lib/` mirror or bundled content registry is part of the runtime

## Generated Files

```
plugins/maestro/
├── skills/                19 skill directories
├── src/                   generated detached runtime payload
├── mcp/                   thin MCP entrypoint
├── references/            1 runtime guide
├── .codex-plugin/         1 plugin manifest
├── .mcp.json
├── .app.json
└── README.md
```

## Differences from Gemini and Claude

| Aspect | Gemini | Claude | Codex |
|--------|--------|--------|-------|
| Agent names | snake_case | kebab-case | kebab-case |
| Delegation | Direct function call | Agent subagent | spawn_agent |
| Hooks | 4 events, no matchers | SessionStart, SessionEnd, PreToolUse + matchers | None |
| Policies | TOML rules | JS hook enforcer | None |
| Skill surface | N/A (commands) | 19 skills | plugin namespace `$maestro:*` |
| Path style | Variable passthrough | Env var refs | Relative |
| Extra files | TOML policy rules | policy-enforcer | runtime guide |
| Runtime payload | thin entrypoint only | thin entrypoint + detached `src/` payload | thin entrypoint + detached `src/` payload |
