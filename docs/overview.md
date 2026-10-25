# Maestro Overview

Maestro is a multi-agent development orchestration platform that coordinates 39 specialized AI agents through structured workflows. It runs as four runtime targets from a single canonical source tree:

- **Antigravity plugin** (`antigravity/` subdirectory, for the Antigravity CLI `agy` and the Antigravity app)
- **Claude Code plugin** (`claude/` subdirectory)
- **Codex plugin** (`plugins/maestro/` subdirectory)
- **Qwen Code extension** (repo root, which is Qwen Code's extension directory — the `qwen-extension.json` manifest, `QWEN.md` context file, generated `agents/` stubs, and the `commands/maestro/`, `policies/`, `mcp/`, and `hooks/` artifacts; only the generated `qwen/hooks.json` lives in the `qwen/` subdirectory)

The orchestrator adopts a TechLead persona that designs, plans, delegates to agents, validates, and reports.

## What Maestro Does

Maestro takes a development task and orchestrates it through a structured workflow:

1. **Classifies** the task as simple, medium, or complex
2. **Designs** the solution through structured dialogue (standard mode)
3. **Plans** the implementation with phased execution and dependency analysis
4. **Delegates** work to specialized agents (coder, architect, tester, etc.)
5. **Validates** each phase output with build/lint/test checks
6. **Reviews** the final result with a code review agent
7. **Archives** the session state for future reference

Simple tasks use an **Express workflow** (1 agent, 1 phase), while medium/complex tasks use the full **Standard workflow** with multi-phase execution.

## Key Numbers

| Metric | Count |
|--------|-------|
| Specialized agents | 39 |
| MCP tools | 17 |
| Shared skills | 7 |
| Entry-point commands | 9 (+ 3 core) |
| Runtime targets | 4 |
| Stub renderers | 2 |

## Project Structure

```
maestro-orchestrate/
├── src/                          # Canonical source (edit here)
│   ├── agents/                   # 39 agent definitions + shared/ Output Contract
│   ├── skills/shared/            # 7 shared methodology modules + protocols
│   ├── templates/                # Session state, design doc, impl plan
│   ├── references/               # Architecture ref, orchestration steps
│   ├── transforms/               # Generator transforms (agent-stub, skill-discovery-stub)
│   ├── generator/                # Stub and entry-point generation, registries, pruning, payloads
│   ├── generated/                # [generated] Agent, resource, and hook registries
│   ├── entry-points/             # 9 entry-point + 3 core-command registries, 8 templates, 2 partials
│   ├── lib/                      # Low-level helpers; may import only lib/ and node:* (layer-checked)
│   ├── config/                   # Canonical config helpers
│   ├── core/                     # Shared runtime helpers and resolvers
│   ├── state/                    # Session-state and plan-document helpers
│   ├── hooks/                    # Shared hook logic modules
│   │   └── logic/                # Hook implementations (session-start, before-agent, after-agent, session-end, hook-state)
│   ├── mcp/                      # Canonical MCP server modules
│   ├── platforms/                # Runtime configs and their registry (runtime-config-map.js), hook adapters (with each host's shell-policy facts), shared hook and policy-enforcer runners, Qwen policy-pack renderer, metadata.js builders
│   └── scripts/                  # Runtime helper scripts (workspace, session, settings)
├── scripts/                      # Generator (generate.js), layer check, release and install tooling
├── bin/                          # [generated] maestro-mcp-server.js (Codex npx entrypoint)
├── tests/                        # Unit, transform, and integration suites + shared helpers
│
├── agents/                       # [generated] Qwen agent stubs (39, snake_case, Qwen tool names)
├── commands/maestro/             # [generated] Qwen TOML commands
├── hooks/                        # [generated] Hook-runner wrapper (used by qwen/hooks.json)
├── mcp/                          # [generated] MCP server wrapper (Qwen)
├── policies/                     # [generated] Shell policy pack (Qwen)
├── .claude-plugin/               # [generated] Claude marketplace
├── .agents/plugins/              # [generated] Codex marketplace
│
├── antigravity/                  # Antigravity plugin
│   ├── agents/                   # [generated] Antigravity agent stubs
│   ├── skills/                   # [generated] Antigravity skills (19)
│   ├── hooks/                    # [generated] Hook-runner and policy-enforcer wrappers
│   ├── mcp/                      # [generated] MCP server wrapper
│   ├── src/                      # [generated] Detached runtime payload
│   ├── plugin.json               # [generated] Plugin manifest
│   ├── mcp_config.json           # [generated] MCP server config
│   ├── hooks.json                # [generated] Hook config
│   └── README.md
│
├── claude/                       # Claude Code plugin
│   ├── agents/                   # [generated] Claude agent stubs
│   ├── skills/                   # [generated] Claude skills (19)
│   ├── hooks/                    # [generated] Hook config (claude-hooks.json)
│   ├── scripts/                  # [generated] Hook-runner and policy-enforcer wrappers
│   ├── mcp/                      # [generated] MCP server wrapper
│   ├── src/                      # [generated] Detached runtime payload
│   ├── .claude-plugin/           # [generated] Plugin manifest
│   └── .mcp.json                 # [generated] MCP server config
│
├── plugins/maestro/              # Codex plugin
│   ├── skills/                   # [generated] Codex skills (19)
│   ├── src/                      # [generated] Detached runtime payload
│   ├── references/               # Runtime guide
│   ├── .codex-plugin/            # [generated] Plugin manifest
│   ├── .mcp.json                 # [generated] MCP server config (spawns bin via npx)
│   ├── .app.json                 # [generated] App config
│   └── README.md
│
└── qwen/                         # [generated] Qwen Code hook registration
    └── hooks.json                # Qwen hook registration
```

`[generated]` marks generator output; a tag on a directory covers everything in it. Runtime READMEs, the Codex runtime guide, and `QWEN.md` are maintained by hand; [CONTRIBUTING.md](../CONTRIBUTING.md#architecture-canonical-source-and-generated-runtimes) has the full list.

## Core Concepts

### Agents

39 specialized agents, each with a defined methodology, tool restrictions, and capability tier:

| Tier | Capability | Agents |
|------|-----------|--------|
| `read_only` | Read, search, analyze | architect, api-designer, code-reviewer, content-strategist, compliance-reviewer, cloud-architect, solutions-architect |
| `read_shell` | Read + shell execution | debugger, performance-engineer, security-engineer, seo-specialist, accessibility-specialist, database-administrator, site-reliability-engineer, db2-dba, zos-sysprog |
| `read_write` | Read + create/modify files | technical-writer, product-manager, ux-designer, copywriter, release-manager, prompt-engineer |
| `full` | All tools | coder, data-engineer, devops-engineer, tester, refactor, design-system-engineer, i18n-specialist, analytics-engineer, ml-engineer, mlops-engineer, mobile-engineer, cobol-engineer, observability-engineer, platform-engineer, integration-engineer, hlasm-assembler-specialist, ibm-i-specialist |

### MCP Server

A bundled Model Context Protocol server providing 17 tools across 3 packs:

- **Workspace** (4): initialize_workspace, assess_task_complexity, validate_plan, resolve_settings
- **Session** (10): create_session, get_session_status, update_session, transition_phase, archive_session, enter_design_gate, record_design_approval, get_design_gate_status, scan_phase_changes, reconcile_phase
- **Content** (3): get_skill_content, get_agent, get_runtime_context

### Skills

7 shared methodology modules loaded on-demand via MCP:

- **delegation** — Agent dispatch rules, prompt templates, tool restrictions
- **execution** — Phase execution with parallel/sequential modes
- **validation** — Build/lint/test pipeline per project type
- **session-management** — Session creation, tracking, archival, resume
- **implementation-planning** — Phase decomposition from designs
- **code-review** — Severity-classified review with deduplication
- **design-dialogue** — Structured requirements gathering with depth levels

### Generator

The generator (`scripts/generate.js`) turns canonical source into runtime-specific output. It writes agent and shared-skill discovery stubs, expands the entry-point registries into commands and skills, builds the manifests, hook registrations, and policy pack, and mirrors `src/` into the detached payloads. CI enforces a zero-drift guarantee. See [Generator Pipeline](architecture.md#generator-pipeline) for the steps.

### State Management

Session state lives in `docs/maestro/` (configurable via `MAESTRO_STATE_DIR`):

```
docs/maestro/
├── state/
│   ├── active-session.md          # Current session (frontmatter + log)
│   └── archive/                   # Completed sessions
└── plans/
    ├── *-design.md                # Design documents
    ├── *-impl-plan.md             # Implementation plans
    └── archive/                   # Archived plans
```
