# Maestro Cheatsheet

This document summarizes the minimum commands and concepts for using Maestro across the supported runtimes.

## 1. Runtime Matrix

| Runtime | Install | Entry Point |
|---|---|---|
| Antigravity | `agy plugin install https://github.com/josstei/maestro-orchestrate/tree/main/antigravity`, then restart `agy` | `/maestro:*` |
| Claude Code | `claude plugin marketplace add josstei/maestro-orchestrate` + `claude plugin install maestro@maestro-orchestrator --scope user` | `/orchestrate`, `/review-code`, `/status`, ... |
| Codex CLI | `codex plugin marketplace add josstei/maestro-orchestrate`, then install Maestro inside Codex via `/plugins` | `$maestro:*` |
| Qwen Code | `qwen extensions install https://github.com/josstei/maestro-orchestrate` | `/maestro:*` |

## 2. Most Common Commands

| Capability | Antigravity | Claude Code | Codex CLI | Qwen Code |
|---|---|---|---|---|
| Start the full workflow | `/maestro:orchestrate <task>` | `/orchestrate <task>` | `$maestro:orchestrate <task>` | `/maestro:orchestrate <task>` |
| Run an existing plan | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` |
| Check status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` |
| Resume a session | `/maestro:resume-session` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` |
| Code review | `/maestro:review-code` | `/review-code` | `$maestro:review-code` | `/maestro:review` |
| Debug | `/maestro:debug-workflow` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` |
| Security audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` |
| Perf check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` |
| SEO audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` |
| A11y audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` |
| Compliance check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` |

## 3. Minimal Usage Examples

### Start a new task

Antigravity:

```text
/maestro:orchestrate Build a REST API with authentication
```

Claude Code:

```text
/orchestrate Build a REST API with authentication
```

Codex CLI:

```text
$maestro:orchestrate Build a REST API with authentication
```

Qwen Code:

```text
/maestro:orchestrate Build a REST API with authentication
```

### Check the current session

Antigravity:

```text
/maestro:status
```

Claude Code:

```text
/status
```

Codex CLI:

```text
$maestro:status
```

Qwen Code:

```text
/maestro:status
```

## 4. Workflow Mental Model

Maestro first classifies task complexity, then follows one of two modes:

### Express

Best for simple tasks:

1. Ask 1–2 clarifying questions
2. Produce a brief
3. Run a single specialist
4. Code review
5. Archive the session

### Standard

Best for medium to complex tasks:

1. **Design**
2. **Plan**
3. **Execute**
4. **Complete**

Key gates:

- design approval
- `validate_plan`
- execution mode gate
- `transition_phase`
- code review blocks unresolved Critical / Major findings

## 5. Session State Location

Maestro stores session state inside the workspace:

```text
docs/maestro/
```

Common paths:

- `docs/maestro/state/active-session.md`
- `docs/maestro/plans/`
- `docs/maestro/state/archive/`
- `docs/maestro/plans/archive/`

## 6. Runtime Differences at a Glance

### Antigravity

- Command entry point: `/maestro:*`
- Supports hooks: `SessionStart` session context and a `run_command` shell policy
- Uses plugin skills + `invoke_subagent`; each subagent's result arrives as a message when it finishes
- Antigravity has a built-in `/resume`, so Maestro uses the same remapped names as Claude Code and Codex:
  - `/maestro:review-code`
  - `/maestro:debug-workflow`
  - `/maestro:resume-session`
- Agent naming: `kebab-case`

### Claude Code

- Command entry point: `/orchestrate`, `/review-code`, `/status`, ...
- Supports hooks
- Uses `PreToolUse` matchers and policy enforcement
- Agent naming: `kebab-case`

### Codex CLI

- Command entry point: `$maestro:*` (use `$maestro:...`, not `/maestro:...`)
- **No runtime hooks**
- Uses plugin skills + `spawn_agent`
- Built-in `/review`, `/debug`, and `/resume` conflict with the host, so Maestro uses:
  - `$maestro:review-code`
  - `$maestro:debug-workflow`
  - `$maestro:resume-session`

### Qwen Code

- Command entry point: `/maestro:*`
- Uses TOML commands
- Agent naming: `snake_case`
- Agent stubs (`agents/`), commands (`commands/maestro/`), policy pack (`policies/maestro.toml`), MCP server shim (`mcp/maestro-server.js`), and hook runner (`hooks/hook-runner.js`) live at the repository root, Qwen Code's extension directory; `qwen/` holds only the generated `qwen/hooks.json`

## 7. Hook Reference

### Antigravity

- `SessionStart` (fires for the main conversation and each subagent)
- `PreToolUse` + `run_command`

### Claude Code

- `SessionStart`
- `PreToolUse` + `Agent`
- `PreToolUse` + `Bash`
- `SessionEnd`

### Codex CLI

- No runtime hooks

### Qwen Code

- `SessionStart`
- `SubagentStart`
- `SubagentStop`
- `SessionEnd`

## 8. Suggested Reading Order

If you want to go deeper:

1. `README.md`
2. `EXAMPLES.md`
3. `docs/flow.md`
4. `docs/architecture.md`
5. `docs/runtime-antigravity.md`
6. `docs/runtime-claude.md`
7. `docs/runtime-codex.md`
8. `docs/runtime-qwen.md`
