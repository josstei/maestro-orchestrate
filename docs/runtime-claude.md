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

The launcher `claude/mcp/maestro-server.js` loads the shared server (see [MCP Server Packaging](https://github.com/josstei/maestro-orchestrate/blob/main/docs/architecture.md#mcp-server-packaging)), which identifies Claude Code by its `clientInfo.name`, `claude-code`.

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

`claude/skills/` holds a public skill for each core command and entry point (see [Entry-Point Registry](https://github.com/josstei/maestro-orchestrate/blob/main/docs/architecture.md#entry-point-registry)). Each shared skill gets a discovery stub that sets `user-invocable: false`: the model can load it, but it stays out of the `/` menu. `review`, `debug`, and `resume` collide with Claude Code built-in commands, so they are remapped to `review-code`, `debug-workflow`, and `resume-session` (`HOST_RESERVED_NAMES` in `src/generator/entry-point-expander.js`).

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

## Policies

`src/platforms/shared/policy-enforcer.js`, with the `shellPolicy` from `src/platforms/claude/hook-adapter.js` — JavaScript-based, triggered on Bash tool use. The hook runs it through the `claude/scripts/policy-enforcer.js` launcher, which prefers the repo `src/` and falls back to the bundled `claude/src/`. It checks `tool_input.command` against the shared rules in `src/core/policy-rules.js` (listed in [Policy Enforcement](https://github.com/josstei/maestro-orchestrate/blob/main/docs/architecture.md#policy-enforcement)): it denies recursive force deletes, `git reset --hard`, `git checkout --`, `git clean -fd` and its variants, and heredocs, and asks before `tee` and output redirects.

A deny rule answers `block`, an ask rule `ask`, which requires user confirmation, and any other command `approve`. The enforcer emits `{ decision: "block", reason }` when the check cannot run.

## Tool Mapping

| Canonical | Claude |
|-----------|--------|
| `read_file` | `Read` |
| `read_many_files` | `Read` |
| `write_file` | `Write` |
| `replace` | `Edit` |
| `list_directory` | `Glob` |
| `glob` | `Glob` |
| `grep_search` | `Grep` |
| `google_web_search` | `WebSearch` |
| `web_fetch` | `WebFetch` |
| `run_shell_command` | `Bash` |
| `ask_user` | `AskUserQuestion` |
| `write_todos` | `TaskCreate`, `TaskUpdate`, `TaskList` |
| `activate_skill` | `Skill` |
| `enter_plan_mode` | `EnterPlanMode` |
| `exit_plan_mode` | `ExitPlanMode` |
| `codebase_investigator` | `Agent (Explore) / Grep / Glob` |

## Agent Frontmatter

Claude agent stubs include the fields listed in `agentFrontmatter.fields` (`src/platforms/claude/runtime-config.js`), derive their tools from the canonical list and Claude's agent-tool defaults, with `tools.claude` retained for intentional exceptions, include example blocks in the description, and use camelCase for turns:

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
  - TaskCreate
  - TaskUpdate
  - TaskList
  - Skill
---
```

Fields: `model` (always "inherit"), `color`, `maxTurns` (camelCase). No temperature or timeout.

## Runtime Files

```
claude/
├── agents/                [generated] 39 agent stubs (kebab-case)
├── skills/                [generated] 19 skill directories
├── hooks/                 [generated] claude-hooks.json
├── scripts/               [generated] hook-runner.js and policy-enforcer.js launchers
├── mcp/                   [generated] maestro-server.js launcher
├── src/                   [generated] detached runtime payload for isolated installs
├── .claude-plugin/        [generated] plugin.json manifest
├── .mcp.json              [generated]
└── README.md              hand-maintained (version badge stamped by scripts/update-versions.js)
```

The repo-root `.claude-plugin/marketplace.json` is generated too.
