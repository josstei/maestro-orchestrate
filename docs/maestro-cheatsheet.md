# Maestro Cheatsheet

This document summarizes the minimum commands and concepts for using Maestro across the supported runtimes.

## 1. Runtime Matrix

| Runtime | Install | Entry Point |
|---|---|---|
| Gemini CLI | `gemini extensions install https://github.com/josstei/maestro-orchestrate` | `/maestro:*` |
| Claude Code | `claude plugin marketplace add josstei/maestro-orchestrate` + `claude plugin install maestro@maestro-orchestrator --scope user` | `/orchestrate`, `/review-code`, `/status`, ... |
| Codex CLI | `codex plugin marketplace add josstei/maestro-orchestrate`, then install Maestro inside Codex via `/plugins` | `$maestro:*` |
| Qwen Code | `qwen extensions install https://github.com/josstei/maestro-orchestrate` | `/maestro:*` |

## 2. Most Common Commands

| Capability | Gemini CLI | Claude Code | Codex CLI | Qwen Code |
|---|---|---|---|---|
| Start the full workflow | `/maestro:orchestrate <task>` | `/orchestrate <task>` | `$maestro:orchestrate <task>` | `/maestro:orchestrate <task>` |
| Run an existing plan | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` |
| Check status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` |
| Resume a session | `/maestro:resume` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` |
| Code review | `/maestro:review` | `/review-code` | `$maestro:review-code` | `/maestro:review` |
| Debug | `/maestro:debug` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` |
| Security audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` |
| Perf check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` |
| SEO audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` |
| A11y audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` |
| Compliance check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` |

## 3. Minimal Usage Examples

### Start a new task

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

### Check the current session

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

### Gemini CLI

- Command entry point: `/maestro:*`
- Supports hooks
- Uses TOML policy files
- Agent naming: `snake_case`

### Claude Code

- Command entry point: `/orchestrate`, `/review-code`, `/status`, ...
- Supports hooks
- Uses `PreToolUse` matchers and policy enforcement
- Agent naming: `kebab-case`

### Codex CLI

- Command entry point: `$maestro:*`
- **No runtime hooks**
- Uses plugin skills + `spawn_agent`
- Built-in `/review`, `/debug`, and `/resume` conflict with the host, so Maestro uses:
  - `$maestro:review-code`
  - `$maestro:debug-workflow`
  - `$maestro:resume-session`

### Qwen Code

- Command entry point: `/maestro:*`
- Same command surface as Gemini CLI
- Uses `qwen/agents/` and `qwen/hooks.json`; commands, policies, MCP, and hook runner are shared from the repository root

## 7. Hook Reference

### Gemini CLI

- `SessionStart`
- `BeforeAgent`
- `AfterAgent`
- `SessionEnd`

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

## 8. Common Notes

### Codex CLI

- Use `$maestro:...`, not `/maestro:...`
- Because `review/debug/resume` names conflict with built-in host commands, use:
  - `$maestro:review-code`
  - `$maestro:debug-workflow`
  - `$maestro:resume-session`

### Gemini / Qwen

- Experimental subagents must be enabled
- The config should include:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

## 9. Suggested Reading Order

If you want to go deeper:

1. `README.md`
2. `EXAMPLES.md`
3. `docs/flow.md`
4. `docs/architecture.md`
5. `docs/runtime-gemini.md`
6. `docs/runtime-claude.md`
7. `docs/runtime-codex.md`
