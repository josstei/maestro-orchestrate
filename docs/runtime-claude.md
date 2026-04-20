# Claude Runtime

The Claude Code plugin lives in the `claude/` subdirectory.

## Configuration

**Manifest**: `claude/.claude-plugin/plugin.json`
**Version**: 1.6.3
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

The public server at `claude/mcp/maestro-server.js` is a thin adapter. It sets `MAESTRO_RUNTIME=claude`, prefers canonical repo `src/mcp/maestro-server.js` when the plugin is loaded from a checkout, and falls back to bundled `claude/src/mcp/maestro-server.js` for detached marketplace or copied installs. Claude declares `primary: filesystem` and `fallback: none`.

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
- `resume/SKILL.md`

**Entry-point (9)** — from registry:
- `review/SKILL.md`, `debug/SKILL.md`, `archive/SKILL.md`, `status/SKILL.md`
- `security-audit/SKILL.md`, `perf-check/SKILL.md`, `seo-audit/SKILL.md`
- `a11y-audit/SKILL.md`, `compliance-check/SKILL.md`

**Infrastructure (7)** — discovery stubs for shared skills:
- `code-review/SKILL.md`, `delegation/SKILL.md`, `design-dialogue/SKILL.md`
- `execution/SKILL.md`, `implementation-planning/SKILL.md`
- `session-management/SKILL.md`, `validation/SKILL.md`

Infrastructure skills have `user-invocable: false` — they surface in Claude's skill picker but delegate to MCP for content.

## Hooks

4 hook entries across 3 event types (2 with matchers):

| Event | Matcher | Script | Timeout |
|-------|---------|--------|---------|
| `SessionStart` | — | `scripts/hook-runner.js claude session-start` | 10s |
| `PreToolUse` | `Agent` | `scripts/hook-runner.js claude before-agent` | 10s |
| `PreToolUse` | `Bash` | scripts/policy-enforcer.js | 5s |
| `SessionEnd` | — | `scripts/hook-runner.js claude session-end` | 10s |

### Key Differences from Gemini

- Uses `PreToolUse` with matchers instead of `BeforeAgent`/`AfterAgent`
- **No AfterAgent hook** — Claude does not validate handoff report format via hooks
- Same effective timeouts (10s) but Claude config uses seconds, Gemini uses milliseconds (10000ms)
- Policy enforcement via hook script, not TOML

### Hook Adapter

`claude/scripts/adapters/claude-adapter.js` normalizes Claude Code stdin:

| Claude Field | Internal Field |
|-------------|----------------|
| `session_id` | `sessionId` |
| `cwd` | `cwd` |
| `hook_event_name` | `event` |
| `tool_input.subagent_type` | `agentName` |
| `tool_input.prompt` | `agentInput` |
| `tool_result` | `agentResult` |
| (hardcoded false) | `stopHookActive` |

Output format: `{ continue: boolean, decision: "approve"|"block", systemMessage?: string, reason?: string }`

## Policy Enforcement

`claude/scripts/policy-enforcer.js` — JavaScript-based, triggered on Bash tool use:

**Deny rules** (blocks command):
- `rm -rf`, `rm -fr`, `sudo rm -rf`, `sudo rm -fr`
- `git reset --hard`, `git checkout --`
- `git clean -fd`, `git clean -df`, `git clean -xfd`, `git clean -xdf`
- Heredocs (`<<`)

**Ask rules** (requires user confirmation):
- `tee` commands
- Output redirection (`>`, `>>`)

Parses compound commands (`;`, `&&`, `||`, `|`) and recursively checks subshells (`$(...)`, backticks).

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

```
mcpSkillContentHandler:  true
policyEnforcer:          true
exampleBlocks:           true  (examples embedded in description)
claudeHookModel:         true
claudeDelegation:        true
claudeToolExamples:      true
claudeStateContract:     true
claudeRuntimeConfig:     true
```

## Agent Frontmatter

Claude agent stubs include example blocks in the description and use camelCase for turns:

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

## Generated Files

```
claude/
├── agents/                39 agent stubs (kebab-case)
├── skills/                19 skill directories
├── hooks/                 1 hook config (claude-hooks.json)
├── scripts/               thin hook wrapper, adapter wrapper, policy enforcer, policy-enforcer.test.js
├── mcp/                   thin MCP entrypoint
├── src/                   generated detached runtime payload for isolated installs
├── .claude-plugin/        1 plugin manifest
├── .mcp.json
├── mcp-config.example.json
└── README.md
```
