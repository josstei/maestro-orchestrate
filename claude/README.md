# Maestro — Claude Code Plugin

[![Version](https://img.shields.io/badge/version-1.5.0-blue)](https://github.com/josstei/maestro-gemini/releases)
[![License](https://img.shields.io/badge/license-Apache-2.0-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-orange)](https://docs.anthropic.com/en/docs/claude-code)

Multi-agent development orchestration platform — 22 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands

## Installation

### Session-Only (Development/Testing)

```bash
claude --plugin-dir /path/to/maestro-gemini/claude
```

This loads the plugin for a single session without persistent registration.

### Local Development

```bash
git clone https://github.com/josstei/maestro-gemini
cd maestro-gemini/claude
```

Then start Claude Code with the plugin directory:

```bash
claude --plugin-dir /path/to/maestro-gemini/claude
```

### Verify Installation

After starting Claude Code with the plugin loaded, verify agents and skills are discovered:

- Agents should appear with `maestro:` prefix (e.g., `maestro:coder`, `maestro:architect`)
- Skills should appear as `maestro-orchestrate`, `maestro-review`, etc.
- MCP tools should appear as `mcp__plugin_maestro_maestro__*` (e.g., `mcp__plugin_maestro_maestro__get_session_status`)

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

## Quick Start

Start a full orchestration by describing what you want to build:

```
/maestro:maestro-orchestrate Build a REST API for a task management system with user authentication
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
| `/maestro:maestro-orchestrate` | Full orchestration workflow (design, plan, execute, complete) |
| `/maestro:maestro-execute` | Execute an approved implementation plan |
| `/maestro:maestro-status` | Display current session status |
| `/maestro:maestro-resume` | Resume an interrupted session |
| `/maestro:maestro-archive` | Archive the active session |
| `/maestro:maestro-review` | Standalone code review |
| `/maestro:maestro-debug` | Standalone debugging session |
| `/maestro:maestro-security-audit` | Standalone security assessment |
| `/maestro:maestro-perf-check` | Standalone performance analysis |
| `/maestro:maestro-seo-audit` | Standalone SEO assessment |
| `/maestro:maestro-a11y-audit` | Standalone accessibility audit |
| `/maestro:maestro-compliance-check` | Standalone compliance review |

## Agents

All agents are registered with a `maestro:` namespace prefix. When the orchestrator delegates work, it dispatches agents as `maestro:coder`, `maestro:architect`, etc.

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
| accessibility-specialist | Compliance | WCAG compliance, ARIA review | Read + Shell |
| compliance-reviewer | Compliance | GDPR/CCPA auditing, license checks | Read-Only |
| i18n-specialist | Internationalization | String extraction, locale management | Full Access |
| analytics-engineer | Analytics | Event tracking, conversion funnels | Full Access |

## Claude Code Specifics

### MCP Tool Names

MCP tools are registered with a namespace prefix. Skills reference bare names like `initialize_workspace` but the actual tool name is `mcp__plugin_maestro_maestro__initialize_workspace`. The orchestrator commands include a mapping table that handles this automatically.

### Agent Names

Agents are registered as `maestro:<agent-name>` (e.g., `maestro:coder`, `maestro:code-reviewer`). The orchestrator commands include a mapping that handles this automatically.

### Hooks

Claude Code hooks are registered in `hooks/hooks.json`:

- **SessionStart** — Prune stale sessions, initialize hook state
- **SessionEnd** — Clean up hook state
- **PreToolUse (Agent matcher)** — Track active agent, inject session context
- **PreToolUse (Bash matcher)** — Policy enforcement (blocks destructive commands)

## Configuration

Same environment variables as the Gemini CLI extension. See the main [README](../README.md) for the full configuration table.

## License

Apache-2.0
