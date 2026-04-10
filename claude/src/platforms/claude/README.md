# Maestro — Claude Code Plugin

[![Version](https://img.shields.io/badge/version-1.6.1-blue)](https://github.com/josstei/maestro-orchestrate/releases)
[![License](https://img.shields.io/badge/license-Apache-2.0-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-orange)](https://docs.anthropic.com/en/docs/claude-code)

Multi-agent development orchestration platform — 22 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands

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

- Type `/` and verify `orchestrate`, `review`, `debug`, `security-audit`, `perf-check`, `seo-audit`, `a11y-audit`, and `compliance-check` appear in autocomplete.
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
| `/resume` | Resume an interrupted session |
| `/archive` | Archive the active session |
| `/review` | Standalone code review |
| `/debug` | Standalone debugging session |
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
| architect | Engineering | System design, technology selection | Read-Only |
| api-designer | Engineering | REST/GraphQL endpoint design | Read-Only |
| coder | Engineering | Feature implementation, SOLID principles | Full Access |
| code-reviewer | Engineering | Code quality review, bug detection | Read-Only |
| data-engineer | Engineering | Schema design, query optimization | Full Access |
| debugger | Engineering | Root cause analysis, execution tracing | Read + Shell |
| devops-engineer | Engineering | CI/CD pipelines, containerization | Full Access |
| performance-engineer | Engineering | Profiling, bottleneck identification | Read + Shell |
| refactor | Engineering | Code modernization, technical debt | Full Access |
| security-engineer | Engineering | Vulnerability assessment, OWASP | Read + Shell |
| tester | Engineering | Unit/integration/E2E tests, TDD | Full Access |
| technical-writer | Engineering | API docs, READMEs, documentation | Read + Write |
| product-manager | Product | Requirements gathering, PRDs | Read + Write |
| ux-designer | Design | User flow design, interaction patterns | Read + Write |
| design-system-engineer | Design | Design tokens, component APIs | Full Access |
| content-strategist | Content | Content planning, editorial calendars | Read-Only |
| copywriter | Content | Persuasive copy, landing pages | Read + Write |
| seo-specialist | SEO | Technical SEO audits, schema markup | Read + Shell |
| accessibility-specialist | Design | WCAG compliance, ARIA review | Read + Shell |
| compliance-reviewer | Compliance | GDPR/CCPA auditing, license checks | Read-Only |
| i18n-specialist | Internationalization | String extraction, locale management | Full Access |
| analytics-engineer | Analytics | Event tracking, conversion funnels | Full Access |

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
