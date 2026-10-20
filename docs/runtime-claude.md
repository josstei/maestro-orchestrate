# Claude Runtime

The Claude Code plugin lives in the `claude/` subdirectory.

## Configuration

**Manifest**: `claude/.claude-plugin/plugin.json`
**Version**: generated from `package.json`
**Hooks**: `claude/hooks/claude-hooks.json`
**MCP Config**: `claude/.mcp.json`

### MCP Server

```json
{
  "mcpServers": {
    "maestro": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}"
    }
  }
}
```

The public server at `claude/mcp/maestro-server.js` is a thin adapter. It prefers canonical repo `src/mcp/maestro-server.js` when the plugin is loaded from a checkout, and falls back to bundled `claude/src/mcp/maestro-server.js` for detached marketplace or copied installs. Content tools read from the filesystem only. The server identifies the Claude runtime from the `clientInfo.name` Claude Code sends in `initialize` (`claude-code`); setting `MAESTRO_RUNTIME` overrides that.

## Agent Naming

Claude uses **kebab-case** for agent names: `code-reviewer`, `api-designer`, `accessibility-specialist`.

Agent files are generated at `claude/agents/*.md` with kebab-case filenames.

## Delegation

Claude Code Agent subagent syntax:

```
Agent(subagent_type: "maestro:coder", prompt: "...")
Agent(subagent_type: "maestro:architect", prompt: "...")
```

## Skills

19 Markdown skills in `claude/skills/`:

**Core (3)** — generated public entry points from the core command registry:
- `orchestrate/SKILL.md`
- `execute/SKILL.md`
- `resume-session/SKILL.md`

**Entry-point (9)** — from registry (`review`, `debug`, `resume` are remapped to `review-code`, `debug-workflow`, `resume-session` because they collide with Claude Code built-in commands; see `src/generator/entry-point-expander.js` `HOST_RESERVED_NAMES`):
- `review-code/SKILL.md`, `debug-workflow/SKILL.md`, `archive/SKILL.md`, `status/SKILL.md`
- `security-audit/SKILL.md`, `perf-check/SKILL.md`, `seo-audit/SKILL.md`
- `a11y-audit/SKILL.md`, `compliance-check/SKILL.md`

**Infrastructure (7)** — discovery stubs for shared skills:
- `code-review/SKILL.md`, `delegation/SKILL.md`, `design-dialogue/SKILL.md`
- `execution/SKILL.md`, `implementation-planning/SKILL.md`
- `session-management/SKILL.md`, `validation/SKILL.md`

Infrastructure skills set `user-invocable: false`: they stay out of the `/` menu but remain available to the model, and their bodies point at MCP `get_skill_content` for the content.

## Hooks

4 hook entries in `claude/hooks/claude-hooks.json`, across 3 event types (2 with matchers):

| Event | Matcher | Script | Timeout |
|-------|---------|--------|---------|
| `SessionStart` | — | `scripts/hook-runner.js claude session-start` | 10s |
| `PreToolUse` | `Agent` | `scripts/hook-runner.js claude before-agent` | 10s |
| `PreToolUse` | `Bash` | `scripts/policy-enforcer.js` | 5s |
| `SessionEnd` | — | `scripts/hook-runner.js claude session-end` | 10s |

### Key Differences from Qwen

- Uses `PreToolUse` with matchers instead of `SubagentStart`/`SubagentStop`
- **No after-agent hook** — Claude does not validate handoff report format via hooks
- Same effective timeouts (10s) but Claude config uses seconds, Qwen uses milliseconds (10000ms)
- Policy enforcement via hook script, not TOML

### Hook Adapter

`src/platforms/claude/hook-adapter.js` normalizes Claude Code stdin:

| Claude Field | Internal Field |
|-------------|----------------|
| `session_id` | `sessionId` |
| `cwd` | `cwd` |
| `tool_input.subagent_type` | `agentName` |
| `tool_input.prompt` | `agentInput` |
| `tool_result` | `agentResult` |
| (hardcoded false) | `stopHookActive` |

Output format: `{ continue: boolean, decision: "approve"|"block", systemMessage?: string, reason?: string }`

## Policy Enforcement

`src/platforms/claude/policy-enforcer.js` — JavaScript-based, triggered on Bash tool use. The hook runs it through the `claude/scripts/policy-enforcer.js` shim, which prefers the repo `src/` and falls back to the bundled `claude/src/`. Its rules come from `src/platforms/shared/policy-rules.js`, the same rules the Antigravity `run_command` enforcer applies and `policies/maestro.toml` applies for Qwen Code:

**Deny rules** (blocks command):
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<EOF`, `<< 'EOF'`, `<<-EOF`; not here-strings `<<<` or arithmetic shifts such as `1<<4`)

**Ask rules** (requires user confirmation):
- `tee` commands
- Output redirection (`>`, `>>`)

`checkCommand()` in `src/platforms/shared/policy-rules.js` parses compound commands (`;`, `&&`, `||`, `|`) and recursively checks subshells (`$(...)`, backticks); the shared runner `src/platforms/shared/policy-enforcer.js` reads stdin and emits `{ decision: "block", reason }` when the check cannot run.

## Tool Mapping

| Canonical | Claude |
|-----------|--------|
| `read_file` / `read_many_files` | `Read` |
| `write_file` | `Write` |
| `replace` | `Edit` |
| `list_directory` / `glob` | `Glob` |
| `grep_search` | `Grep` |
| `google_web_search` | `WebSearch` |
| `web_fetch` | `WebFetch` |
| `run_shell_command` | `Bash` |
| `ask_user` | `AskUserQuestion` |
| `write_todos` | `TaskCreate`, `TaskUpdate`, `TaskList` |
| `activate_skill` | `Skill` |
| `enter_plan_mode` | `EnterPlanMode` |
| `exit_plan_mode` | `ExitPlanMode` |
| `codebase_investigator` | `Agent (Explore)` / `Grep` / `Glob` |

## Feature Flags

The canonical feature set (same 4 flags across all runtimes, values per runtime):

```
exampleBlocks:             true   (examples embedded in description)
claudeStateContract:       true   (Claude-specific session-state contract)
scriptBasedStateContract:  false
codexStateContract:        false
```

See `src/platforms/claude/runtime-config.js` for the authoritative values.

## Agent Frontmatter

Claude agent stubs include the fields listed in `agentFrontmatter.fields` (`src/platforms/claude/runtime-config.js`), take their tools from each agent's `tools.claude` list, include example blocks in the description, and use camelCase for turns:

```yaml
---
name: coder
description: |
  Implementation specialist...
  
  <example>
  Context: User needs a new feature implemented.
  user: "Implement the login flow"
  assistant: "I'll follow existing patterns..."
  </example>
model: inherit
color: green
maxTurns: 25
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
```

Fields: `model` (always "inherit"), `color`, `maxTurns` (camelCase). No temperature or timeout.

## Runtime Files

```
claude/
├── agents/                [generated] 39 agent stubs (kebab-case)
├── skills/                [generated] 19 skill directories
├── hooks/                 [generated] claude-hooks.json
├── scripts/               hook-runner.js and policy-enforcer.js shims (hand-maintained)
├── mcp/                   maestro-server.js shim (hand-maintained)
├── src/                   [generated] detached runtime payload for isolated installs
├── .claude-plugin/        [generated] plugin.json manifest
├── .mcp.json              [generated]
├── mcp-config.example.json  hand-maintained
└── README.md              hand-maintained (version badge stamped by scripts/update-versions.js)
```

The repo-root `.claude-plugin/marketplace.json` is generated too.
