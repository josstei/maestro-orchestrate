# Codex Runtime

The Codex plugin lives in `plugins/maestro/`.

## Configuration

**Manifest**: `plugins/maestro/.codex-plugin/plugin.json`
**Version**: 1.5.0
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

The bundled server at `plugins/maestro/mcp/maestro-server.js` still passes `srcRelativePath="../../src"` for filesystem fallback, but the packaged runtime now prefers bundled content registries under `plugins/maestro/lib/mcp/generated/`.

### Plugin Manifest

```json
{
  "name": "maestro",
  "version": "1.5.0",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "apps": "./.app.json",
  "interface": {
    "displayName": "Maestro",
    "category": "Coding",
    "capabilities": ["Interactive", "Write"],
    "brandColor": "#2563EB"
  }
}
```

## Agent Naming

Codex uses **kebab-case** for agent names (same as Claude): `code-reviewer`, `api-designer`.

Agent files are generated at `plugins/maestro/agents/*.md`.

## Delegation

Codex-native `spawn_agent` with generated agent references:

```
spawn_agent(...) with generated agent references from ./agents/
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

This MCP-first with filesystem fallback approach exists because spawned Codex agents may not have access to the parent plugin's MCP server.

In the packaged plugin, shared methodology and agent bodies are served from bundled registries first, then fall back to filesystem reads only when a registry is unavailable.

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
- Path references in generated content are computed relative to the output file's location

This differs from Gemini (passthrough variables) and Claude (environment variable references).

## Bundled Content Registries

The Codex plugin no longer mirrors canonical source files into `plugins/maestro/src/`.

Instead, generation produces two runtime-ready registry modules under `plugins/maestro/lib/mcp/generated/`:
- `resource-registry.js` for shared skills, protocols, templates, and references
- `agent-registry.js` for agent methodology bodies and Codex-mapped tool lists

These registries are generated from canonical `src/` content at build time and are the primary packaged content source for `get_skill_content` and `get_agent`.

Codex now declares this explicitly in runtime config as `primary: registry` with `fallback: filesystem`. The filesystem path remains for repo-local and workspace scenarios where canonical `src/` is intentionally available, but packaged installs are expected to succeed from the bundled registries alone.

## Generated Files (~83 total)

```
plugins/maestro/
├── agents/                22 agent stubs (kebab-case)
├── skills/                19 skill directories
├── lib/                   36 shared/runtime files (including content registries)
├── mcp/                   1 bundled server
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
| Hooks | 4 events, no matchers | PreToolUse + matchers | None |
| Policies | TOML rules | JS hook enforcer | None |
| Skill surface | N/A (commands) | None | plugin namespace `maestro:` |
| Path style | Variable passthrough | Env var refs | Relative |
| Extra files | — | policy-enforcer | 2 bundled content registries |
| Total files | ~79 | ~85 | ~83 |
