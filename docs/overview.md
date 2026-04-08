# Maestro Overview

Maestro is a multi-agent development orchestration platform that coordinates 22 specialized AI agents through structured workflows. It runs as three runtime targets from a single canonical source tree:

- **Gemini CLI extension** (root directory)
- **Claude Code plugin** (`claude/` subdirectory)
- **Codex plugin** (`plugins/maestro/` subdirectory)

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
| Specialized agents | 22 |
| MCP tools | 12 |
| Shared skills | 7 |
| Entry-point commands | 9 (+ 3 core) |
| Runtime targets | 3 |
| Source transforms | 10 |
| Test cases | 159 |

## Project Structure

```
maestro-orchestrate/
├── src/                          # Canonical source (edit here)
│   ├── agents/                   # 22 agent definitions
│   ├── skills/shared/            # 7 shared methodology modules + protocols
│   ├── templates/                # Session state, design doc, impl plan
│   ├── references/               # Architecture ref, orchestration steps
│   ├── transforms/               # 10 content transforms
│   ├── runtimes/                 # 3 runtime definitions + shared config
│   ├── entry-points/             # 9 entry-point registry + 3 templates
│   ├── lib/                      # Shared library (MCP handlers, hooks, state, core)
│   ├── mcp/                      # Thin MCP wrapper + generated core artifact
│   ├── hooks/                    # Hook system
│   │   ├── hook-configs/         # gemini.json, claude.json
│   │   └── runtime-only/         # Runtime-specific hook scripts
│   ├── runtime-only/             # Files unique to one runtime
│   │   ├── gemini/               #   Commands, policies, README
│   │   ├── claude/               #   Skills, hooks, policy-enforcer
│   │   └── codex/                #   Skills, runtime guide
│   └── manifest.js               # Declarative file mapping rules
├── scripts/
│   └── generate.js               # Generator (manifest → output)
├── tests/                        # 21 test files, 159 tests
│
├── agents/                       # [generated] Gemini agent stubs
├── commands/maestro/             # [generated] Gemini TOML commands
├── hooks/                        # [generated] Gemini hook scripts
├── lib/                          # [generated] Gemini shared library
├── mcp/                          # [generated] Gemini MCP server
├── policies/                     # [generated] Gemini shell policies
│
├── claude/                       # [generated] Claude Code plugin
│   ├── agents/                   # Claude agent stubs
│   ├── skills/                   # Claude skills (19)
│   ├── scripts/                  # Claude hook scripts
│   ├── lib/                      # Claude shared library
│   └── mcp/                      # Claude MCP server
│
└── plugins/maestro/              # [generated] Codex plugin
    ├── agents/                   # Codex agent stubs
    ├── skills/                   # Codex skills (19)
    ├── lib/                      # Codex shared library + bundled MCP registries
    ├── mcp/                      # Codex MCP server
    └── README.md
```

## Core Concepts

### Agents

22 specialized agents, each with a defined methodology, tool restrictions, and capability tier:

| Tier | Capability | Agents |
|------|-----------|--------|
| `read_only` | Read, search, analyze | architect, api-designer, code-reviewer, content-strategist, compliance-reviewer |
| `read_shell` | Read + shell execution | debugger, performance-engineer, security-engineer, seo-specialist, accessibility-specialist |
| `read_write` | Read + create/modify files | technical-writer, product-manager, ux-designer, copywriter |
| `full` | All tools | coder, data-engineer, devops-engineer, tester, refactor, design-system-engineer, i18n-specialist, analytics-engineer |

### MCP Server

A bundled Model Context Protocol server providing 12 tools across 3 packs:

- **Workspace** (4): initialize_workspace, assess_task_complexity, validate_plan, resolve_settings
- **Session** (5): create_session, get_session_status, update_session, transition_phase, archive_session
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

A manifest-driven code generator (`scripts/generate.js`) transforms canonical source into runtime-specific output. It applies 10 transforms (frontmatter injection, agent stubs, feature stripping, tool/path/name mapping, registry generation, etc.), enforces runtime-specific content-source contracts, and maintains a zero-drift guarantee enforced by CI.

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
