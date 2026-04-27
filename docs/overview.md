# Maestro Overview

Maestro is a multi-agent development orchestration platform that coordinates 39 specialized AI agents through structured workflows. It runs as four runtime targets from a single canonical source tree:

- **Gemini CLI extension** (root directory — `GEMINI.md`, `gemini-extension.json`, shared `agents/`, `commands/maestro/`)
- **Claude Code plugin** (`claude/` subdirectory)
- **Codex plugin** (`plugins/maestro/` subdirectory)
- **Qwen Code extension** (`qwen/` subdirectory — `qwen-extension.json` manifest + `QWEN.md` context file live at repo root; generated `qwen/agents/` and `qwen/hooks.json` live in the subdirectory)

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
| Source transforms | 6 |
| Test cases | see `just test` output (70+ files across unit, transforms, integration) |

## Project Structure

```
maestro-orchestrate/
├── src/                          # Canonical source (edit here)
│   ├── agents/                   # 39 agent definitions
│   ├── skills/shared/            # 7 shared methodology modules + protocols
│   ├── templates/                # Session state, design doc, impl plan
│   ├── references/               # Architecture ref, orchestration steps
│   ├── transforms/               # Generator transform library
│   ├── entry-points/             # 9 entry-point + 3 core-command registries, preamble builders, 6 templates
│   ├── config/                   # Canonical config helpers
│   ├── core/                     # Shared runtime helpers and resolvers
│   ├── state/                    # Session-state helpers
│   ├── hooks/                    # Shared hook logic modules
│   │   └── logic/                # Hook implementations (session-start, before-agent, after-agent, session-end, hook-state)
│   ├── mcp/                      # Canonical MCP server modules
│   ├── platforms/                # Runtime adapters, manifests, and public shells
│   ├── scripts/                  # Runtime helper scripts (workspace, session, settings)
│   └── manifest.js               # Declarative file mapping rules
├── scripts/
│   └── generate.js               # Generator (manifest → output)
├── tests/                        # 71 test files, 980 tests (see `just test` output)
│
├── agents/                       # [generated] Gemini agent stubs
├── commands/maestro/             # [generated] Gemini TOML commands
├── hooks/                        # [generated] Gemini hook adapters
├── mcp/                          # [generated] Gemini MCP adapter
├── policies/                     # [generated] Gemini shell policies
│
├── claude/                       # [generated] Claude Code plugin
│   ├── agents/                   # Claude agent stubs
│   ├── skills/                   # Claude skills (19)
│   ├── hooks/                    # Hook config (claude-hooks.json)
│   ├── scripts/                  # Claude hook scripts
│   ├── mcp/                      # Claude MCP adapter
│   ├── .claude-plugin/           # Plugin manifest
│   └── .mcp.json                 # MCP server config
│
├── plugins/maestro/              # [generated] Codex plugin
│   ├── skills/                   # Codex skills (19)
│   ├── src/                      # generated detached runtime payload
│   ├── references/               # Runtime guide
│   ├── .codex-plugin/            # Plugin manifest
│   ├── .mcp.json                 # MCP server config (spawns bin via npx)
│   ├── .app.json                 # App config
│   └── README.md
│
└── qwen/                         # [generated] Qwen Code extension
    ├── agents/                   # Qwen agent stubs (39, snake_case, Qwen tool names)
    └── hooks.json                # Qwen hook registration
```

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

A bundled Model Context Protocol server providing 19 tools across 3 packs:

- **Workspace** (4): initialize_workspace, assess_task_complexity, validate_plan, resolve_settings
- **Session** (11): create_session, get_session_status, update_session, append_session_phases, transition_phase, archive_session, enter_design_gate, record_design_approval, get_design_gate_status, scan_phase_changes, reconcile_phase
- **Content** (4): get_skill_content, get_agent, get_runtime_context, get_agent_recommendation

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

A manifest-driven code generator (`scripts/generate.js`) transforms canonical source into runtime-specific adapter output. It applies frontmatter, stub, and metadata transforms, emits only the public files each runtime needs, and maintains a zero-drift guarantee enforced by CI.

### State Management

Session state lives in `docs/maestro/` (configurable via `MAESTRO_STATE_DIR`):

```
docs/maestro/
├── state/
│   ├── active-session.md          # Current session (YAML frontmatter + log)
│   └── archive/                   # Completed sessions
└── plans/
    ├── *-design.md                # Design documents
    ├── *-impl-plan.md             # Implementation plans
    └── archive/                   # Archived plans
```
