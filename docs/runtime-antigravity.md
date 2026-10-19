# Antigravity Runtime

The Antigravity plugin lives in `antigravity/`, the output directory declared in `src/platforms/antigravity/runtime-config.js`. The Antigravity CLI (`agy`) and the Antigravity app share one plugin format. `agy plugin install` copies the directory that holds `plugin.json`, so the plugin is self-contained: it carries its own agent stubs, skills, hook and MCP registrations, thin shims, and a detached copy of `src/`.

## Configuration

**Manifest**: `antigravity/plugin.json`
**Version**: generated from `package.json`
**MCP Config**: `antigravity/mcp_config.json`
**Hooks**: `antigravity/hooks.json`

The manifest holds only `name` (`maestro`), `displayName`, `version`, `description`, and `suggestedPrompts`. Antigravity reads MCP servers and hooks from `mcp_config.json` and `hooks.json` at the plugin root, not from the manifest.

### MCP Server

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["${PLUGIN_ROOT}/mcp/maestro-server.js"]
    }
  }
}
```

Antigravity substitutes `${PLUGIN_ROOT}` in `args` and starts the server with the plugin root as its `cwd`. The public server at `antigravity/mcp/maestro-server.js` is a thin adapter. It prefers canonical repo `src/mcp/maestro-server.js` when the plugin is loaded from a checkout, and falls back to bundled `antigravity/src/mcp/maestro-server.js` for installed copies. Content tools read from the filesystem only. The server identifies the Antigravity runtime from the `clientInfo.name` Antigravity sends in `initialize` (`antigravity-client`); setting `MAESTRO_RUNTIME` overrides that.

### MCP Tool Naming

Antigravity registers the plugin's server as `maestro_maestro` (`<plugin directory>_<server>`). By default it loads MCP tools on demand: the model reads a tool's schema file and calls it through `call_mcp_tool` (`ServerName`, `ToolName`, `Arguments`). The Maestro server lists every tool with `_meta: { "antigravity/alwaysLoad": true }` (the runtime config's `mcpToolMeta`, attached in `src/mcp/core/create-server.js`), so Antigravity registers all 17 tools as native tools named `mcp_maestro_maestro_<tool>`, which matches `mcpPrefix`. Antigravity adds a required `toolSummary` argument to each declared schema and strips it before calling the server.

The generated skills fall back to `call_mcp_tool` with `ServerName: "maestro_maestro"` when the native tools are missing. If Antigravity asks before each Maestro tool call, allow them with `"mcp(maestro_maestro/*)"` under `permissions.allow` in `~/.gemini/antigravity-cli/settings.json`.

### Workspace Resolution

Workspace resolution follows the shared MCP contract: tools that need a workspace fail with `WORKSPACE_NOT_INITIALIZED` until the orchestrator calls `initialize_workspace(workspace_path)`. To suggest that path, `get_runtime_context` returns a `workspace_suggestion` taken from, in order:
- `MAESTRO_WORKSPACE_PATH`, when it is exported before starting `agy`
- the first valid local `file://` root in the `roots/list` response, which Antigravity answers with the workspace
- the server's `cwd`

Antigravity sends `notifications/roots/list_changed` repeatedly, sometimes right after answering `roots/list`, so the server requests the roots again on each one instead of only forgetting them. Candidates inside Antigravity's plugin directories (`~/.gemini/config/plugins/` and `~/.gemini/antigravity-cli/plugins/`) are skipped like the other host extension caches, so an installed plugin's `cwd` is never suggested.

## Installation

Requires Node.js 20+ on `PATH`. Maestro is tested against Antigravity CLI 1.4.2.

```bash
agy plugin install https://github.com/josstei/maestro-orchestrate/tree/main/antigravity
```

Restart `agy` afterwards: Antigravity discovers a newly installed plugin directory only on startup. The plugin is copied to `~/.gemini/config/plugins/maestro/`, named after the manifest `name`. Check it with `agy plugin list`, update it by running the install command again, and remove it with `agy plugin uninstall maestro`. Plugins installed in the Antigravity app also appear in the CLI.

For local development, symlink the checkout's `antigravity/` directory to `~/.gemini/config/plugins/maestro` and restart `agy`. A linked plugin loads at startup but is not listed by `agy plugin list`. `agy plugin validate antigravity --strict --json` reports the components Antigravity finds and any findings.

## Agent Naming

Antigravity uses **kebab-case** agent names with no prefix: `code-reviewer`, `api-designer`, `accessibility-specialist`.

Agent files are generated at `antigravity/agents/*.md` with kebab-case filenames. The main agent sees each plugin subagent under its bare name, which is the `TypeName` of a delegation (`coder`, not `maestro:coder`).

## Delegation

Antigravity-native `invoke_subagent`, with one `Subagents` entry per agent:

```
invoke_subagent(Subagents: [{ TypeName: "coder", Role: "Implementation engineer", Prompt: "Implement the user service..." }])
```

`Role` is a 2-5 word job title and `Prompt` the full delegation prompt; the skills leave `Model` unset. The call returns conversation IDs at once (`delegation.constraints.result_surface: "notified"`). When a subagent goes idle, Antigravity wakes the orchestrator with a system message: "Subagent <id> has gone idle. This was the subagent's most recent response: ...". The orchestrator ends its turn instead of polling and parses the Task Report and Downstream Context from each message.

A parallel batch is one `invoke_subagent` call whose `Subagents` array holds the whole batch (at most `MAESTRO_MAX_CONCURRENT` entries when it is not 0). The batch transitions only after every subagent in it has reported.

## Skills

19 Markdown skills in `antigravity/skills/`. Antigravity turns plugin skills into slash commands under the plugin namespace, `/maestro:<skill>`; the 7 infrastructure skills opt out.

Antigravity has a built-in `/resume`, so `review`, `debug`, and `resume` are remapped to `review-code`, `debug-workflow`, and `resume-session`, as in Claude Code and Codex (see `src/generator/entry-point-expander.js` `HOST_RESERVED_NAMES`).

**Core (3)** — generated public entry points from the core command registry, invoked as `/maestro:<name>`:
- `orchestrate/SKILL.md`
- `execute/SKILL.md`
- `resume-session/SKILL.md`

**Entry-point (9)** — from registry, invoked as `/maestro:<name>`:
- `review-code/SKILL.md`, `debug-workflow/SKILL.md`, `archive/SKILL.md`, `status/SKILL.md`
- `security-audit/SKILL.md`, `perf-check/SKILL.md`, `seo-audit/SKILL.md`
- `a11y-audit/SKILL.md`, `compliance-check/SKILL.md`

**Infrastructure (7)** — discovery stubs for shared skills:
- `code-review/SKILL.md`, `delegation/SKILL.md`, `design-dialogue/SKILL.md`
- `execution/SKILL.md`, `implementation-planning/SKILL.md`
- `session-management/SKILL.md`, `validation/SKILL.md`

Infrastructure skills set `disable-slash-command: true`: they stay out of the `/` menu but remain available to the model, and their bodies point at MCP `get_skill_content` for the content.

Antigravity lists each plugin skill to the model with the absolute path of its `SKILL.md`, which the model reads with `view_file`. Skills get no argument substitution: the user's request is the text that came with the invocation. The 3 core skills carry a `## Runtime: Antigravity` preamble that maps step references to Antigravity syntax: the `mcp_maestro_maestro_<tool>` names with the `call_mcp_tool` fallback, `view_file` to load skills, `invoke_subagent` delegation and its notified results, one `send_message` retry for a malformed handoff, and `ask_question` for choices and approvals. The entry-point skills carry the MCP tool note and, when they delegate, the same `invoke_subagent` instructions.

## Hooks

2 named hooks in `antigravity/hooks.json`, with 3 handlers across 2 event types (1 with a matcher):

| Hook | Event | Matcher | Script | Timeout |
|------|-------|---------|--------|---------|
| `maestro-session` | `SessionStart` | — | `hooks/hook-runner.js antigravity session-start` | 10s |
| `maestro-session` | `SessionStart` | — | `hooks/hook-runner.js antigravity before-agent` | 10s |
| `maestro-shell-policy` | `PreToolUse` | `run_command` | `hooks/policy-enforcer.js` | 5s |

Antigravity reads hook timeouts in seconds and runs hook commands from the plugin root, so the commands use relative paths (`node hooks/...`).

### Key Differences from Claude and Qwen

- `SessionStart` fires for the main conversation and again for every subagent conversation, and its injected message reaches both. Maestro runs `before-agent` there, so each subagent starts with the active session line (for example `Active session: current_phase=3, status=in_progress`) without a pre-delegation hook
- No `SessionEnd`, `SubagentStart`, `SubagentStop`, or other post-delegation event: no hook cleans up at session end, and the orchestrator validates handoffs itself. When a subagent's response lacks `## Task Report` or `## Downstream Context`, the orchestrator sends that conversation one `send_message` asking for the complete report and accepts the second response as-is
- The hook payload carries no agent name, so the hooks do not record the active agent

### Hook Adapter

`src/platforms/antigravity/hook-adapter.js` normalizes Antigravity's camelCase stdin:

| Antigravity Field | Internal Field |
|-------------------|----------------|
| `conversationId` | `sessionId` |
| `workspacePaths[0]` | `cwd` |
| (hardcoded null) | `agentName` |
| (hardcoded null) | `agentInput` |
| (hardcoded null) | `agentResult` |
| (hardcoded false) | `stopHookActive` |

Output format: `{}`, or `{ injectSteps: [{ systemMessage: { systemMessage: string } }] }` when the hook has a context message. Antigravity parses stdout strictly, so the runner prints nothing else and exits with code 0. If the hook fails, the runner emits `{}`.

## Policies

`src/platforms/antigravity/policy-enforcer.js` — a `PreToolUse` hook on `run_command`, run through the `antigravity/hooks/policy-enforcer.js` shim (repo `src/` first, bundled `antigravity/src/` fallback). It checks `toolCall.args.CommandLine` with `checkCommand()` from `src/core/policy-rules.js`, the same rules the Claude policy enforcer and `policies/maestro.toml` apply:

**Deny** (`deny`, which blocks in every permission mode, including `--dangerously-skip-permissions`):
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<EOF`, `<< 'EOF'`, `<<-EOF`; not here-strings `<<<` or arithmetic shifts such as `1<<4`)

**Ask User** (`force_ask`, which prompts even when `permissions.allow` covers the command; headless runs deny it and `--dangerously-skip-permissions` approves it):
- `tee` commands
- Output redirection written with surrounding whitespace (`cmd > file`, `cmd >> file`, `2> file`)

**Any other command** (`ask`): Antigravity applies the user's own permission settings and "Always Allow" choices, exactly as without the hook.

Compound commands (`;`, `&&`, `||`, `|`) are split, and `$(...)` and backtick subshells are checked recursively. Antigravity denies a tool call whose `PreToolUse` hook fails or prints anything but a known decision, and it has no "no opinion" decision, so the enforcer answers `deny` when it cannot run the check (unparseable input, an unterminated command substitution, or a payload over 1 MiB).

Output format: `{ decision: "deny"|"force_ask"|"ask", reason?: string }`.

## Tool Mapping

Antigravity maps the canonical tool names to Antigravity tools in `src/platforms/antigravity/runtime-config.js`. Agent stubs list the mapped names as each subagent's `tools` allowlist, so every tool an agent declares maps to a real Antigravity tool name; `none` marks a canonical tool with no Antigravity equivalent, which the stubs leave out. `get_runtime_context` returns the same table:

| Canonical | Antigravity |
|-----------|-------------|
| `read_file` | `view_file` |
| `read_many_files` | `view_file` |
| `list_directory` | `list_dir` |
| `glob` | `find_by_name` |
| `grep_search` | `grep_search` |
| `google_web_search` | `search_web` |
| `web_fetch` | `read_url_content` |
| `write_file` | `write_to_file` |
| `replace` | `replace_file_content` |
| `run_shell_command` | `run_command` |
| `ask_user` | `ask_question` |
| `write_todos` | none |
| `activate_skill` | `view_file` |
| `enter_plan_mode` | none |
| `exit_plan_mode` | none |
| `codebase_investigator` | `invoke_subagent (TypeName: "research")` |

`read_file`, `read_many_files`, and `activate_skill` all map to `view_file`, which each stub lists once. `list_dir`, `find_by_name`, and `grep_search` exist only for subagents that list them in `tools`, as every stub that declares them does; the orchestrator's own tool set lacks them, so the Antigravity skills tell it to search with `run_command` (`ls`, `find`, `rg`) or the built-in `research` subagent. Antigravity has no todo or plan-mode tools: Maestro session state (`update_session`, `transition_phase`) is the progress record, and with `planModeNative: false` the server-side design gate and `ask_question` approvals carry the design approval.

## Feature Flags

The canonical feature set (same 4 flags across all runtimes, values per runtime):

```
exampleBlocks:             false
claudeStateContract:       false
scriptBasedStateContract:  true
codexStateContract:        false
```

See `src/platforms/antigravity/runtime-config.js` for the authoritative values.

## Agent Frontmatter

Antigravity agent stubs carry the fields listed in `agentFrontmatter.fields` (`src/platforms/antigravity/runtime-config.js`), with a quoted description and a block-list `tools` allowlist written in Antigravity tool names:

```yaml
---
name: coder
description: "Implementation specialist..."
subagent: true
mainAgent: false
model: inherit
tools:
  - view_file
  - list_dir
  - find_by_name
  - grep_search
  - write_to_file
  - replace_file_content
  - run_command
  - ask_question
---
```

Fields: `subagent` (always true), `mainAgent` (always false), `model` (always "inherit"). No color or turn limit. Antigravity also gives every subagent `send_message`, `list_resources`, `read_resource`, `manage_task`, and the always-loaded MCP tools.

## Runtime Files

```text
antigravity/
├── agents/                [generated] 39 agent stubs (kebab-case, Antigravity tool names)
├── skills/                [generated] 19 skill directories
├── hooks/                 hook-runner.js and policy-enforcer.js shims (hand-maintained)
├── mcp/                   maestro-server.js shim (hand-maintained)
├── src/                   [generated] detached runtime payload, stamped with version.json
├── plugin.json            [generated] plugin manifest
├── mcp_config.json        [generated] MCP server registration
├── hooks.json             [generated] hook registration (SessionStart, PreToolUse)
└── README.md              hand-maintained
```

The plugin ships no rules or context file.

## Notes

- Antigravity lists custom subagents in the app and the CLI, but the Antigravity IDE does not run them yet, so Maestro delegation needs `agy` or the app.
- `/maestro:<skill>` follows the `/<plugin>:<skill>` form that Antigravity's changelog documents for plugin skills. The model also finds every skill in its skill list and can load one without the slash command.
- Antigravity plugins have no settings form. Export `MAESTRO_*` variables before starting `agy`.
- `${PLUGIN_ROOT}` in served Maestro content is the plugin directory. Antigravity does not export it to hooks or `run_command` shells, so the core skills tell the model to write the absolute path instead.
- `node scripts/generate.js` derives `antigravity/plugin.json` from `package.json` with the other runtime manifests and rebuilds the `antigravity/src/` payload, so release metadata stays aligned.
