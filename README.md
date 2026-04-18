# Maestro

[![Version](https://img.shields.io/badge/version-1.6.2-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-extension-orange)](https://github.com/google-gemini/gemini-cli)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex](https://img.shields.io/badge/Codex-plugin-black)](docs/runtime-codex.md)
[![Qwen Code](https://img.shields.io/badge/Qwen_Code-extension-purple)](https://github.com/QwenLM/qwen-code)

Maestro is a multi-agent development orchestration platform with 22 specialists, an Express path for simple work, a 4-phase standard workflow for medium and complex work, persistent session state, and standalone review/debug/security/perf/seo/accessibility/compliance entrypoints. It runs from one canonical `src/` tree across **Gemini CLI**, **Claude Code**, **Codex**, and **Qwen Code**.

## Runtime Targets

| Runtime | Location | Public Surface | Notes |
|---------|----------|----------------|-------|
| Gemini CLI | repo root | `/maestro:*` | Snake-case agents, TOML commands, hooks, TOML shell policies |
| Claude Code | `claude/` | `/orchestrate`, `/review`, ... | Kebab-case agents with `maestro:` subagent names |
| Codex | `plugins/maestro/` | `$maestro:*` | Plugin skills, `spawn_agent`, no runtime hooks |
| Qwen Code | `qwen/` | `/maestro:*` | Gemini-CLI-compatible extension, `QWEN.md` context file, `SubagentStart`/`SubagentStop` hooks |

## Getting Started

### Prerequisites

- One supported runtime: Gemini CLI, Claude Code, Codex, or Qwen Code
- Node.js 18+ for the MCP server and helper scripts
- Gemini CLI and Qwen Code only: enable experimental subagents in `~/.gemini/settings.json` (Gemini) or `~/.qwen/settings.json` (Qwen)

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

Maestro does not edit `~/.gemini/settings.json` or `~/.qwen/settings.json` for you.

### Installation

#### Gemini CLI

```bash
gemini extensions install https://github.com/josstei/maestro-orchestrate
```

Local development:

```bash
git clone https://github.com/josstei/maestro-orchestrate
cd maestro-orchestrate
gemini extensions link .
```

Verify with `gemini extensions list`.

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

```bash
git clone https://github.com/josstei/maestro-orchestrate
cd maestro-orchestrate
node scripts/install-codex-plugin.js
```

Then start Codex, run `/plugins`, and select **Maestro** → **Install**.

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

Verify with `qwen extensions list`. Qwen Code uses the same `/maestro:*` command surface as Gemini CLI and reads `QWEN.md` as its context file.

### Quick Start

Start a full orchestration with the runtime-specific entrypoint:

| Runtime | Example |
|---------|---------|
| Gemini CLI | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Claude Code | `/orchestrate Build a REST API for a task management system with user authentication` |
| Codex | `$maestro:orchestrate Build a REST API for a task management system with user authentication` |
| Qwen Code | `/maestro:orchestrate Build a REST API for a task management system with user authentication` |

Maestro classifies the task, chooses Express or Standard workflow, asks the required design questions, produces an implementation plan when needed, delegates execution to specialists, runs a quality gate, and archives the session state in `docs/maestro/`.

## Commands

| Capability | Gemini CLI | Claude Code | Codex |
|------------|------------|-------------|-------|
| Orchestrate | `/maestro:orchestrate` | `/orchestrate` | `$maestro:orchestrate` |
| Execute | `/maestro:execute` | `/execute` | `$maestro:execute` |
| Resume | `/maestro:resume` | `/resume` | `$maestro:resume-session` |
| Status | `/maestro:status` | `/status` | `$maestro:status` |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` |
| Review | `/maestro:review` | `/review` | `$maestro:review-code` |
| Debug | `/maestro:debug` | `/debug` | `$maestro:debug-workflow` |
| Security Audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` |
| Performance Check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` |
| SEO Audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` |
| Accessibility Audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` |
| Compliance Check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` |

For Codex, Maestro intentionally avoids bare skill names that collide with host commands. Use `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` so Codex's built-in `/review`, `/debug`, and `/resume` commands keep working.

Qwen Code uses the same `/maestro:*` command surface as Gemini CLI.

## Workflow

- **Express**: For simple work. Maestro asks 1-2 clarifying questions, proposes a brief, delegates to one specialist, runs code review, and archives without a design doc or implementation plan.
- **Standard**: For medium and complex work. Maestro runs Design, Plan, Execute, and Complete phases with explicit approval gates, phased execution, and final review blocking on unresolved Critical or Major findings.

## Documentation

- [docs/overview.md](docs/overview.md) for the project model and generated structure
- [docs/architecture.md](docs/architecture.md) for orchestration internals and architecture layout
- [docs/usage.md](docs/usage.md) for development workflow, settings, and command surfaces
- [docs/flow.md](docs/flow.md) for the orchestration workflow steps and hard gates
- [docs/cicd.md](docs/cicd.md) for CI/CD pipeline workflows, release process, and Mermaid diagrams
- [docs/runtime-gemini.md](docs/runtime-gemini.md) for Gemini runtime specifics
- [docs/runtime-claude.md](docs/runtime-claude.md) for Claude runtime specifics
- [docs/runtime-codex.md](docs/runtime-codex.md) for Codex runtime specifics

## License

Apache-2.0
