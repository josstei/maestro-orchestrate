# Maestro

[![Version](https://img.shields.io/badge/version-1.6.4-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![Antigravity](https://img.shields.io/badge/Antigravity-plugin-orange)](docs/runtime-antigravity.md)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex](https://img.shields.io/badge/Codex-plugin-black)](docs/runtime-codex.md)
[![Qwen Code](https://img.shields.io/badge/Qwen_Code-extension-purple)](https://github.com/QwenLM/qwen-code)

Maestro is a multi-agent development orchestration platform with 39 specialists, an Express path for simple work, a 4-phase standard workflow for medium and complex work, persistent session state, and standalone review/debug/security/perf/seo/accessibility/compliance entry points. It runs from one canonical `src/` tree across **Antigravity**, **Claude Code**, **Codex**, and **Qwen Code**.

## Runtime Targets

| Runtime | Location | Public Surface | Notes |
|---------|----------|----------------|-------|
| Antigravity | `antigravity/` | `/maestro:*` | Plugin skills, kebab-case subagents run with `invoke_subagent`, SessionStart and `run_command` policy hooks |
| Claude Code | `claude/` | `/orchestrate`, `/review-code`, ... | Kebab-case agents with `maestro:` subagent names |
| Codex | `plugins/maestro/` | `$maestro:*` | Plugin skills, `spawn_agent`, no runtime hooks |
| Qwen Code | repo root + `qwen/hooks.json` | `/maestro:*` | Snake-case agents, TOML commands, `QWEN.md` context file, `SubagentStart`/`SubagentStop` hooks |

## Getting Started

### Prerequisites

- One supported runtime: Antigravity (the `agy` CLI or the Antigravity app), Claude Code, Codex, or Qwen Code
- Node.js 20+ for the MCP server and helper scripts

### Installation

#### Antigravity

```bash
agy plugin install https://github.com/josstei/maestro-orchestrate/tree/main/antigravity
```

Restart `agy` afterwards: Antigravity discovers a newly installed plugin only on startup. Verify with `agy plugin list`.

Local development (link the plugin directory, then restart `agy`; a linked plugin loads but is not listed by `agy plugin list`):

```bash
git clone https://github.com/josstei/maestro-orchestrate
mkdir -p ~/.gemini/config/plugins
ln -s "$PWD/maestro-orchestrate/antigravity" ~/.gemini/config/plugins/maestro
```

More Antigravity-specific setup and runtime details live in [antigravity/README.md](antigravity/README.md) and [docs/runtime-antigravity.md](docs/runtime-antigravity.md).

#### Claude Code

Marketplace install:

```bash
claude plugin marketplace add josstei/maestro-orchestrate
claude plugin install maestro@maestro-orchestrator --scope user
```

Development / temporary loading:

```bash
git clone https://github.com/josstei/maestro-orchestrate
claude --plugin-dir /path/to/maestro-orchestrate/claude
```

More Claude-specific setup and plugin management lives in [claude/README.md](claude/README.md).

#### Codex

Register the marketplace:

```bash
codex plugin marketplace add josstei/maestro-orchestrate
```

Then start Codex, run `/plugins` to browse, select **Maestro**, and choose **Install**.

Local development (path must start with `./`, `../`, `/`, or `~/` — Codex otherwise treats bare `owner/repo` as a GitHub source):

```bash
git clone https://github.com/josstei/maestro-orchestrate
codex plugin marketplace add /absolute/path/to/maestro-orchestrate
# then: start Codex, run `/plugins`, select Maestro → Install
```

More Codex-specific setup and runtime details live in [plugins/maestro/README.md](plugins/maestro/README.md) and [docs/runtime-codex.md](docs/runtime-codex.md).

#### Qwen Code

```bash
qwen extensions install https://github.com/josstei/maestro-orchestrate
```

Local development:

```bash
git clone https://github.com/josstei/maestro-orchestrate
cd maestro-orchestrate
qwen extensions link .
```

Verify with `qwen extensions list`. Qwen Code reads `QWEN.md` as its context file and loads the `/maestro:*` commands from `commands/maestro/*.toml`.

### Quick Start

Start a full orchestration with the runtime-specific entry point:

| Runtime | Example |
|---------|---------|
| Antigravity | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Claude Code | `/orchestrate Build a REST API for a task management system with user authentication` |
| Codex | `$maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Qwen Code | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |

Maestro classifies the task, chooses Express or Standard workflow, asks the required design questions, produces an implementation plan when needed, delegates execution to specialists, runs a quality gate, and archives the session state under `MAESTRO_STATE_DIR` (default `docs/maestro/`).

## Examples

Usage examples: [EXAMPLES.md](EXAMPLES.md). Qwen Code forms shown:

- Full orchestration: `/maestro:orchestrate Build a REST API for a task management system with user authentication`
- Standalone review: `/maestro:review Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests`
- Security audit: `/maestro:security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks`

## Configuration

Defaults work; these settings tune behavior:

| Setting | Default | Purpose |
|---------|---------|---------|
| `MAESTRO_STATE_DIR` | `docs/maestro` | Session, plan, and archive output path |
| `MAESTRO_EXECUTION_MODE` | `ask` | Choose `parallel`, `sequential`, or prompt |
| `MAESTRO_VALIDATION_STRICTNESS` | `normal` | Post-phase validation strictness (`strict`, `normal`, or `lenient`) |
| `MAESTRO_AUTO_ARCHIVE` | `true` | Archive successful sessions automatically |
| `MAESTRO_MAX_RETRIES` | `2` | Retry limit for failed phases |
| `MAESTRO_MAX_CONCURRENT` | `0` | Parallel-agent cap, where `0` means no Maestro cap |
| `MAESTRO_DISABLED_AGENTS` | unset | Specialists to exclude from assignment |

## Commands

| Capability | Antigravity | Claude Code | Codex | Qwen Code |
|------------|-------------|-------------|-------|-----------|
| Orchestrate | `/maestro:orchestrate` | `/orchestrate` | `$maestro:orchestrate` | `/maestro:orchestrate` |
| Execute | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` |
| Resume | `/maestro:resume-session` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` |
| Status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` |
| Review | `/maestro:review-code` | `/review-code` | `$maestro:review-code` | `/maestro:review` |
| Debug | `/maestro:debug-workflow` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` |
| Security Audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` |
| Performance Check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` |
| SEO Audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` |
| Accessibility Audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` |
| Compliance Check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` |

Antigravity, Claude Code, and Codex expose review, debug, and resume as `review-code`, `debug-workflow`, and `resume-session` so they avoid host built-in command names (some are reserved defensively); Qwen Code keeps `review`, `debug`, and `resume` ([details](docs/usage.md#invoking-maestro)).

## Workflow

- **Express**: For simple work. Maestro asks 1-2 clarifying questions, proposes a brief, delegates to one specialist, runs code review, and archives without a design doc or implementation plan.
- **Standard**: For medium and complex work. Maestro runs Design, Plan, Execute, and Complete phases with explicit approval gates, phased execution, and final review blocking on unresolved Critical or Major findings.

## Outputs and Success Criteria

Maestro writes orchestration outputs under `MAESTRO_STATE_DIR`, usually `docs/maestro/`. Standard workflow outputs include active session state, design documents, implementation plans, phase reports, validation output, and archived records.

A successful run must have an approved plan when Standard workflow is used, completed phase reports, validation results for the changed surface, and no unresolved Critical or Major review findings. If a phase cannot complete, Maestro records the blocker and the next required action instead of silently continuing.

## Security and Permissions

Maestro follows the host runtime's tool permissions, sandboxing, and confirmation model. It does not require committed secrets or long-lived credentials, and orchestration session state stays inside `MAESTRO_STATE_DIR` unless configured otherwise. Use `MAESTRO_DISABLED_AGENTS` to restrict specialists in sensitive repositories, and run `$maestro:security-audit` or the equivalent runtime command before adopting changes that touch authentication, authorization, secrets, or data exposure paths.

## Documentation

- [EXAMPLES.md](EXAMPLES.md) for copyable usage scenarios across all runtimes
- [docs/overview.md](docs/overview.md) for the project model and generated structure
- [docs/architecture.md](docs/architecture.md) for orchestration internals and architecture layout
- [docs/usage.md](docs/usage.md) for settings, command surfaces, state layout, agents, and MCP tools
- [docs/flow.md](docs/flow.md) for the orchestration workflow steps and hard gates
- [docs/maestro-cheatsheet.md](docs/maestro-cheatsheet.md) for a one-page command and runtime quick reference
- [docs/runtime-antigravity.md](docs/runtime-antigravity.md) for Antigravity runtime specifics
- [docs/runtime-claude.md](docs/runtime-claude.md) for Claude runtime specifics
- [docs/runtime-codex.md](docs/runtime-codex.md) for Codex runtime specifics
- [docs/runtime-qwen.md](docs/runtime-qwen.md) for Qwen runtime specifics

## Development

Canonical source lives under `src/`, and the runtime directories are regenerated from it with `node scripts/generate.js`. [CONTRIBUTING.md](https://github.com/josstei/maestro-orchestrate/blob/main/CONTRIBUTING.md#architecture-canonical-source-and-generated-runtimes) lists which files are generated and which are maintained by hand, and its [Key Commands](https://github.com/josstei/maestro-orchestrate/blob/main/CONTRIBUTING.md#key-commands) table lists the development commands. [docs/cicd.md](https://github.com/josstei/maestro-orchestrate/blob/main/docs/cicd.md) covers the CI workflows and the release process.

## License

Apache-2.0
