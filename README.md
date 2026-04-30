# Maestro

[![Version](https://img.shields.io/badge/version-1.6.3-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-extension-orange)](https://github.com/google-gemini/gemini-cli)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex](https://img.shields.io/badge/Codex-plugin-black)](docs/runtime-codex.md)
[![Qwen Code](https://img.shields.io/badge/Qwen_Code-extension-purple)](https://github.com/QwenLM/qwen-code)

Maestro is a multi-agent development orchestration platform with 39 specialists, an Express path for simple work, a 4-phase standard workflow for medium and complex work, persistent session state, and standalone review/debug/security/perf/seo/accessibility/compliance entrypoints. It runs from one canonical `src/` tree across **Gemini CLI**, **Claude Code**, **Codex**, and **Qwen Code**.

## Runtime Targets

| Runtime | Location | Public Surface | Notes |
|---------|----------|----------------|-------|
| Gemini CLI | repo root | `/maestro:*` | Snake-case agents, TOML commands, hooks, TOML shell policies |
| Claude Code | `claude/` | `/orchestrate`, `/review-code`, ... | Kebab-case agents with `maestro:` subagent names |
| Codex | `plugins/maestro/` | `$maestro:*` | Plugin skills, `spawn_agent`, no runtime hooks |
| Qwen Code | `qwen/` | `/maestro:*` | Gemini-CLI-compatible extension, `QWEN.md` context file, `SubagentStart`/`SubagentStop` hooks |

## Getting Started

### Prerequisites

- One supported runtime: Gemini CLI, Claude Code, Codex, or Qwen Code
- Node.js 20+ for the MCP server and helper scripts
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

## Examples

Usage examples: [EXAMPLES.md](EXAMPLES.md). Gemini/Qwen forms shown:

- Full orchestration: `/maestro:orchestrate Build a REST API for a task management system with user authentication`
- Standalone review: `/maestro:review Review the staged changes for correctness, regressions, security, maintainability risk, and missing tests`
- Security audit: `/maestro:security-audit Audit authentication, authorization, data exposure, secret handling, and exploitability risks`

## Configuration

Defaults work; these settings tune behavior:

| Setting | Default | Purpose |
|---------|---------|---------|
| `MAESTRO_STATE_DIR` | `docs/maestro` | Session, plan, and archive output path |
| `MAESTRO_EXECUTION_MODE` | `ask` | Choose `parallel`, `sequential`, or prompt |
| `MAESTRO_AUTO_ARCHIVE` | `true` | Archive successful sessions automatically |
| `MAESTRO_MAX_RETRIES` | `2` | Retry limit for failed phases |
| `MAESTRO_MAX_CONCURRENT` | `0` | Parallel-agent cap, where `0` means no Maestro cap |
| `MAESTRO_DISABLED_AGENTS` | unset | Specialists to exclude from assignment |

## Commands

| Capability | Gemini CLI | Claude Code | Codex | Qwen Code |
|------------|------------|-------------|-------|-----------|
| Orchestrate | `/maestro:orchestrate` | `/orchestrate` | `$maestro:orchestrate` | `/maestro:orchestrate` |
| Execute | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` |
| Resume | `/maestro:resume` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` |
| Status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` |
| Review | `/maestro:review` | `/review-code` | `$maestro:review-code` | `/maestro:review` |
| Debug | `/maestro:debug` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` |
| Security Audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` |
| Performance Check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` |
| SEO Audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` |
| Accessibility Audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` |
| Compliance Check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` |

For Claude Code and Codex, Maestro intentionally avoids bare skill names that collide with host commands. Use `/review-code`, `/debug-workflow`, and `/resume-session` in Claude Code, and `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` in Codex, so built-in `/review`, `/debug`, and `/resume` commands keep working.

Qwen Code uses the same `/maestro:*` command surface as Gemini CLI.

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
- [docs/usage.md](docs/usage.md) for development workflow, settings, and command surfaces
- [docs/flow.md](docs/flow.md) for the orchestration workflow steps and hard gates
- [docs/cicd.md](docs/cicd.md) for CI/CD pipeline workflows, release process, and Mermaid diagrams
- [docs/runtime-gemini.md](docs/runtime-gemini.md) for Gemini runtime specifics
- [docs/runtime-claude.md](docs/runtime-claude.md) for Claude runtime specifics
- [docs/runtime-codex.md](docs/runtime-codex.md) for Codex runtime specifics
- [docs/runtime-qwen.md](docs/runtime-qwen.md) for Qwen runtime specifics

## Development and Release Validation

Canonical source lives under `src/`. Runtime files in `agents/`, `commands/`, `hooks/`, `mcp/`, `policies/`, `claude/`, `plugins/maestro/`, and `qwen/` are generated; update `src/` first, then regenerate.

```bash
npm ci
node scripts/generate.js
git diff --exit-code --name-only
node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js
npm run pack:verify
npm run release:artifacts
npm run release:verify-artifacts
```

Release validation creates `dist/release/maestro-vX.Y.Z-extension.tar.gz`. The archive is intentionally generic: it unpacks with `gemini-extension.json`, `qwen-extension.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json` at the root, plus the runtime payload needed by Gemini CLI, Qwen Code, Claude Code, and Codex.

Stable releases publish three aligned outputs:

- Git tag `vX.Y.Z`
- npm package `@josstei/maestro@X.Y.Z`
- GitHub Release asset `maestro-vX.Y.Z-extension.tar.gz`

Codex plugin releases launch the MCP server through the matching npm package version. Hook installation is explicit via `npm run install-hooks`; package, pack, and publish flows do not install git hooks.

## License

Apache-2.0
