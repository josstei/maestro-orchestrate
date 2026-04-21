# Maestro — Claude Code Plugin

[![Version](https://img.shields.io/badge/version-1.6.3-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache-2.0-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-orange)](https://docs.anthropic.com/en/docs/claude-code)

Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands

## Installation

### From Marketplace (recommended)

Add the maestro marketplace, then install the plugin:

```bash
claude plugin marketplace add josstei/maestro-orchestrate
claude plugin install maestro@maestro-orchestrator --scope user
```

### Installation Scopes

| Scope | Flag | Effect |
|-------|------|--------|
| User (default) | `--scope user` | Available across all your projects |
| Project | `--scope project` | Shared with your team via version control |
| Local | `--scope local` | Project-specific, gitignored |

### Plugin Management

```bash
claude plugin update maestro          # Pull the latest version
claude plugin disable maestro         # Disable without uninstalling
claude plugin uninstall maestro       # Remove the plugin entirely
```

### Development / Testing

Load the plugin for a single session without persistent registration:

```bash
claude --plugin-dir /path/to/maestro-orchestrate/claude
```

Use `/reload-plugins` inside the session to pick up file changes without restarting.

For local development, clone the repo first:

```bash
git clone https://github.com/josstei/maestro-orchestrate
claude --plugin-dir /path/to/maestro-orchestrate/claude
```

### Verify Installation

After starting Claude Code with the plugin loaded:

- Type `/` and verify `orchestrate`, `review-code`, `debug-workflow`, `security-audit`, `perf-check`, `seo-audit`, `a11y-audit`, and `compliance-check` appear in autocomplete.
- Run `/agents` and verify agents with the `maestro:` prefix appear (e.g., `maestro:coder`, `maestro:architect`).
- Confirm MCP tools are registered: `mcp__plugin_maestro_maestro__*` tools should be available (e.g., `mcp__plugin_maestro_maestro__get_session_status`).

### MCP Server

The MCP server is auto-registered via `claude/.mcp.json`. If MCP tools are not available, verify the `.mcp.json` file exists at the plugin root:

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

**Note:** Claude is filesystem-backed for shared MCP content. Published Claude bundles carry a generated local `src/` payload derived from the canonical source tree, and shared skills, templates, references, and delegation protocols are loaded from that local payload through `get_skill_content`. Runtime-local `SKILL.md` files remain only where Claude needs on-disk discovery stubs or public entry points.

## Quick Start

Start a full orchestration by describing what you want to build:

```
/orchestrate Build a REST API for a task management system with user authentication
```

Maestro will walk you through the complete lifecycle:

1. **Design Dialogue** -- Structured questions one at a time, 2-3 architectural approaches with trade-offs.
2. **Design Review** -- Section-by-section approval of the design document.
3. **Implementation Planning** -- Phase breakdown, agent assignments, dependency graph, parallel execution opportunities.
4. **Execution Mode Selection** -- Parallel or sequential dispatch.
5. **Phase-by-Phase Execution** -- Specialized agents implement the plan with session state updates after each phase.
6. **Quality Gate** -- Final code review blocks on unresolved Critical or Major findings.
7. **Completion & Archival** -- Summary of files changed, token usage, and next steps.

**Express mode** -- For simple tasks, Maestro detects low complexity and uses a streamlined flow: 1-2 questions, brief approval, single agent, code review, done.

## Commands

| Command | Purpose |
|---------|---------|
| `/orchestrate` | Full orchestration workflow (design, plan, execute, complete) |
| `/execute` | Execute an approved implementation plan |
| `/status` | Display current session status |
| `/resume-session` | Resume an interrupted session |
| `/archive` | Archive the active session |
| `/review-code` | Standalone code review |
| `/debug-workflow` | Standalone debugging session |
| `/security-audit` | Standalone security assessment |
| `/perf-check` | Standalone performance analysis |
| `/seo-audit` | Standalone SEO assessment |
| `/a11y-audit` | Standalone accessibility audit |
| `/compliance-check` | Standalone compliance review |

These Claude entrypoints come from the public top-level skills in `skills/`. Internal methodology skills remain hidden with `user-invocable: false`.

## Agents

All agents are registered with a `maestro:` namespace prefix. When the orchestrator delegates work, it dispatches agents as `maestro:coder`, `maestro:architect`, etc. Claude Code agents use **kebab-case** naming (e.g., `code-reviewer`, `api-designer`), contrasting with Gemini CLI's snake_case convention (e.g., `code_reviewer`, `api_designer`). The `maestro:` prefix is always required when dispatching.

All agents share a baseline tool set: `Read`, `Glob`, `Grep`, `Skill`. Tool tiers reflect additional capabilities beyond that baseline.

| Agent | Domain | Specialization | Tool Tier |
|-------|--------|----------------|-----------|
| accessibility-specialist | Design | WCAG compliance auditing, ARIA review | Read + Shell |
| analytics-engineer | Analytics | Event tracking, conversion funnels | Full Access |
| api-designer | Engineering | API contracts and endpoint design | Read-Only |
| architect | Engineering | System design and architecture decisions | Read-Only |
| cloud-architect | Platform | AWS/GCP/Azure topology, IaC, multi-region design | Read-Only |
| cobol-engineer | Mainframe | Mainframe COBOL, JCL, CICS/IMS on z/OS | Full Access |
| code-reviewer | Engineering | Code quality review and bug identification | Read-Only |
| coder | Engineering | Feature implementation | Full Access |
| compliance-reviewer | Compliance | Legal and regulatory compliance (GDPR, CCPA, licensing) | Read-Only |
| content-strategist | Content | Content planning and strategy | Read-Only |
| copywriter | Content | Marketing copy and landing-page content | Read + Write |
| data-engineer | Engineering | Schema design, queries, and data pipelines | Full Access |
| database-administrator | Engineering | RDBMS tuning, indexes, migration safety (Postgres, MySQL, Oracle, SQL Server) | Read + Shell |
| db2-dba | Mainframe | DB2 for z/OS and LUW, REORG, RUNSTATS, bind/rebind | Read + Shell |
| debugger | Engineering | Root cause analysis and defect investigation | Read + Shell |
| design-system-engineer | Design | Design tokens and theming | Full Access |
| devops-engineer | Engineering | CI/CD, containerization, and deployment | Full Access |
| hlasm-assembler-specialist | Mainframe | IBM HLASM for z/OS, macros, SVCs | Full Access |
| i18n-specialist | Internationalization | Internationalization and locale management | Full Access |
| ibm-i-specialist | Mainframe | IBM i RPG/CL, DB2 for i, OS/400 | Full Access |
| integration-engineer | Platform | B2B APIs, ETL, message brokers (Kafka, MQ) | Full Access |
| ml-engineer | ML/AI | Model training, feature pipelines, evaluation | Full Access |
| mlops-engineer | ML/AI | Model registry, CI/CD for models, drift detection | Full Access |
| mobile-engineer | Engineering | iOS/Android/React Native/Flutter platform work | Full Access |
| observability-engineer | Ops | Metrics, logs, traces, OpenTelemetry, dashboards | Full Access |
| performance-engineer | Engineering | Performance profiling and optimization | Read + Shell |
| platform-engineer | Platform | Internal developer platforms, paved paths | Full Access |
| product-manager | Product | Requirements and product strategy | Read + Write |
| prompt-engineer | ML/AI | LLM prompt design, few-shot, RAG tuning | Read + Write |
| refactor | Engineering | Structural refactoring and technical debt | Full Access |
| release-manager | Ops | Release notes, changelogs, rollout planning | Read + Write |
| security-engineer | Engineering | Security assessment and vulnerability analysis | Read + Shell |
| seo-specialist | SEO | Technical SEO auditing and structured data | Read + Shell |
| site-reliability-engineer | Ops | SLOs, error budgets, runbooks, postmortems | Read + Shell |
| solutions-architect | Platform | Enterprise integration, cross-team architecture | Read-Only |
| technical-writer | Engineering | Documentation and technical writing | Read + Write |
| tester | Engineering | Test implementation and coverage analysis | Full Access |
| ux-designer | Design | User experience design | Read + Write |
| zos-sysprog | Mainframe | z/OS systems programming, JCL, USS, RACF | Read + Shell |

## Claude Code Specifics

### MCP Tool Names

MCP tools are registered with a namespace prefix. Skills reference bare names like `initialize_workspace` but the actual tool name is `mcp__plugin_maestro_maestro__initialize_workspace`. The orchestrate skill includes a mapping table that handles this automatically.

### Agent Names

Agents are registered as `maestro:<agent-name>` (e.g., `maestro:coder`, `maestro:code-reviewer`). The orchestrate skill includes a mapping that handles this automatically.

### Hooks

Claude Code hooks are registered in `hooks/claude-hooks.json`:

- **SessionStart** — Prune stale sessions, initialize hook state
- **SessionEnd** — Clean up hook state
- **PreToolUse (Agent matcher)** — Track active agent, inject session context
- **PreToolUse (Bash matcher)** — Policy enforcement (blocks destructive commands)

## Configuration

Supported settings include `MAESTRO_STATE_DIR`, `MAESTRO_DISABLED_AGENTS`, `MAESTRO_EXECUTION_MODE`, `MAESTRO_VALIDATION_STRICTNESS`, `MAESTRO_AUTO_ARCHIVE`, `MAESTRO_MAX_RETRIES`, and `MAESTRO_MAX_CONCURRENT`. Claude-specific runtime paths come from `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR`.

## License

Apache-2.0
