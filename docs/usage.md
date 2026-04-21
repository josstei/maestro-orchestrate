# Maestro Usage

For detailed CI/CD pipeline documentation including workflow diagrams, the release process, and npm publishing strategy, see [docs/cicd.md](cicd.md).

## Development Commands

```bash
# Regenerate runtime files from source
node scripts/generate.js

# Generate runtime adapters using package scripts
npm run build

# Run all 980 tests across 71 files
node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js

# Show unified diff of changes
node scripts/generate.js --diff

# Delete all generated files and regenerate
node scripts/generate.js --clean

# Run CI test subset (see justfile for current file list)
just test

# Run only transform unit tests
just test-transforms

# Run only integration tests
just test-integration

# Generate + verify zero drift (CI equivalent)
just check

# Full CI equivalent (check + test)
just ci

# Verify lib/ import-boundary rules (enforced by check target)
just check-layers

# Delete local branches whose remotes are gone
just cleanup-branches
```

## Editing Workflow

1. Edit canonical source in `src/`. Maintain root docs (`README.md`, `USAGE.md`, `OVERVIEW.md`, `ARCHITECTURE.md`) directly, and do not edit generated `claude/`, `plugins/maestro/`, or `qwen/` output.
2. Run `node scripts/generate.js` or `npm run build` to regenerate runtime adapters
3. Run `node --test tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js` (or `just test`) before committing
4. Commit canonical source, directly owned root docs, and generated adapter output together
5. CI will fail if runtime adapters drift from canonical `src/`

## Configuration

### Settings

All settings are resolved with precedence: environment variable > workspace `.env` > extension `.env` > default.

| Setting | Default | Values | Purpose |
|---------|---------|--------|---------|
| `MAESTRO_STATE_DIR` | `docs/maestro` | path | Session state directory |
| `MAESTRO_DISABLED_AGENTS` | (none) | comma-separated names | Exclude agents from assignment |
| `MAESTRO_EXECUTION_MODE` | `ask` | parallel, sequential, ask | Execution strategy |
| `MAESTRO_VALIDATION_STRICTNESS` | `normal` | strict, normal, lenient | Validation mode |
| `MAESTRO_AUTO_ARCHIVE` | `true` | true, false | Auto-archive on completion |
| `MAESTRO_MAX_RETRIES` | `2` | integer | Max retries per phase |
| `MAESTRO_MAX_CONCURRENT` | `0` | integer | Max parallel agents (0 = unlimited) |

### Runtime-Specific Environment Variables

| Variable | Runtime | Purpose |
|----------|---------|---------|
| `MAESTRO_EXTENSION_PATH` | Gemini | Override extension root path |
| `MAESTRO_WORKSPACE_PATH` | Gemini | Workspace root (set by Gemini CLI) |
| `MAESTRO_WORKSPACE_PATH` | Codex | Optional workspace root override; otherwise Codex uses MCP `roots/list` |
| `CLAUDE_PLUGIN_ROOT` | Claude | Plugin root (set by Claude Code) |
| `CLAUDE_PROJECT_DIR` | Claude | Project directory (set by Claude Code) |

## Invoking Maestro

### Gemini CLI

Commands are TOML-based slash commands:

| Command | Purpose |
|---------|---------|
| `/maestro:orchestrate` | Full orchestration workflow |
| `/maestro:execute` | Execute an approved plan |
| `/maestro:resume` | Resume interrupted session |
| `/maestro:review` | Code review |
| `/maestro:debug` | Debugging workflow |
| `/maestro:archive` | Archive active session |
| `/maestro:status` | Show session status |
| `/maestro:security-audit` | Security assessment |
| `/maestro:perf-check` | Performance assessment |
| `/maestro:seo-audit` | SEO audit |
| `/maestro:a11y-audit` | Accessibility audit |
| `/maestro:compliance-check` | Compliance review |

### Claude Code

Skills are Markdown-based slash commands:

| Command | Purpose |
|---------|---------|
| `/orchestrate` | Full orchestration workflow |
| `/execute` | Execute an approved plan |
| `/resume-session` | Resume interrupted session |
| `/review-code` | Code review |
| `/debug-workflow` | Debugging workflow |
| `/archive` | Archive active session |
| `/status` | Show session status |
| `/security-audit` | Security assessment |
| `/perf-check` | Performance assessment |
| `/seo-audit` | SEO audit |
| `/a11y-audit` | Accessibility audit |
| `/compliance-check` | Compliance review |

### Codex

Skills are invoked through the plugin namespace:

| Command | Purpose |
|---------|---------|
| `$maestro:orchestrate` | Full orchestration workflow |
| `$maestro:execute` | Execute an approved plan |
| `$maestro:resume-session` | Resume interrupted session |
| `$maestro:review-code` | Code review |
| `$maestro:debug-workflow` | Debugging workflow |
| `$maestro:archive` | Archive active session |
| `$maestro:status` | Show session status |
| `$maestro:security-audit` | Security assessment |
| `$maestro:perf-check` | Performance assessment |
| `$maestro:seo-audit` | SEO audit |
| `$maestro:a11y-audit` | Accessibility audit |
| `$maestro:compliance-check` | Compliance review |

Codex keeps its built-in `/review`, `/debug`, and `/resume` commands. Maestro exposes `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` to avoid colliding with those host commands.

## State Directory Structure

After running Maestro, the state directory (default: `docs/maestro/`) contains:

```
docs/maestro/
├── state/
│   ├── active-session.md         # Current session
│   └── archive/
│       └── <session-id>.md       # Archived sessions
└── plans/
    ├── <date>-<topic>-design.md  # Design documents
    ├── <date>-<topic>-impl-plan.md # Implementation plans
    └── archive/
        └── ...                   # Archived plans
```

### Session State Format

Active sessions use YAML frontmatter + Markdown body:

```yaml
---
session_id: "2024-03-15-auth-system"
task: "Implement user authentication"
created: "2024-03-15T10:00:00Z"
updated: "2024-03-15T11:30:00Z"
status: "in_progress"
workflow_mode: "standard"
design_document: "docs/maestro/plans/2024-03-15-auth-system-design.md"
implementation_plan: "docs/maestro/plans/2024-03-15-auth-system-impl-plan.md"
current_phase: 2
total_phases: 4
execution_mode: "sequential"
execution_backend: null
current_batch: null
task_complexity: "medium"

token_usage:
  total_input: 0
  total_output: 0
  total_cached: 0
  by_agent: {}

phases:
  - id: 1
    name: "Foundation"
    status: "completed"
    agents: ["architect"]
    parallel: false
    started: "2024-03-15T10:05:00Z"
    completed: "2024-03-15T10:45:00Z"
    blocked_by: []
    files_created: ["src/services/user.ts"]
    files_modified: []
    files_deleted: []
    downstream_context:
      key_interfaces_introduced: ["UserService"]
      patterns_established: ["Repository pattern"]
      integration_points: ["/api/users"]
      assumptions: []
      warnings: []
    errors: []
    retry_count: 0
  - id: 2
    name: "Implementation"
    status: "in_progress"
    agents: ["coder"]
    parallel: false
    started: "2024-03-15T10:50:00Z"
    completed: null
    blocked_by: [1]
    files_created: []
    files_modified: []
    files_deleted: []
    downstream_context:
      key_interfaces_introduced: []
      patterns_established: []
      integration_points: []
      assumptions: []
      warnings: []
    errors: []
    retry_count: 0
---

# Auth System Orchestration Log

## Phase 1: Foundation
...
```

## Agent Catalog

### Read-Only Agents (analysis, no code changes)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| architect | System design, technology selection | 15 | 0.3 |
| api-designer | Endpoint design, API contracts | 15 | 0.3 |
| cloud-architect | AWS/GCP/Azure topology, IaC, multi-region design | 15 | 0.3 |
| code-reviewer | Bug detection, quality assessment | 15 | 0.2 |
| compliance-reviewer | GDPR/CCPA, license auditing | 15 | 0.3 |
| content-strategist | Content planning, editorial calendars | 15 | 0.3 |
| solutions-architect | Enterprise integration, cross-team architecture | 15 | 0.3 |

### Read + Shell Agents (investigation, profiling)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| accessibility-specialist | WCAG compliance, ARIA review | 20 | 0.2 |
| database-administrator | RDBMS tuning, indexes, migration safety | 20 | 0.2 |
| db2-dba | DB2 for z/OS and LUW, REORG/RUNSTATS/bind | 20 | 0.2 |
| debugger | Root cause analysis, execution tracing | 20 | 0.2 |
| performance-engineer | Profiling, optimization | 20 | 0.2 |
| security-engineer | Vulnerability assessment, threat modeling | 20 | 0.2 |
| seo-specialist | Technical SEO, structured data | 20 | 0.2 |
| site-reliability-engineer | SLOs, error budgets, runbooks, postmortems | 20 | 0.2 |
| zos-sysprog | z/OS systems programming, JCL, USS, RACF | 20 | 0.2 |

### Read + Write Agents (documentation, design)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| copywriter | Marketing copy, landing pages | 20 | 0.3 |
| product-manager | PRDs, user stories, prioritization | 20 | 0.2 |
| prompt-engineer | LLM prompt design, few-shot, RAG tuning | 15 | 0.3 |
| release-manager | Release notes, changelogs, rollout planning | 15 | 0.3 |
| technical-writer | Documentation, API references | 15 | 0.3 |
| ux-designer | User flows, wireframes, heuristics | 20 | 0.2 |

### Full Access Agents (implementation)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| analytics-engineer | Event tracking, A/B testing, funnels | 25 | 0.2 |
| cobol-engineer | Mainframe COBOL, JCL, CICS/IMS on z/OS | 25 | 0.2 |
| coder | Feature implementation, SOLID principles | 25 | 0.2 |
| data-engineer | Schema design, ETL, migrations | 20 | 0.2 |
| design-system-engineer | Design tokens, theming, component APIs | 25 | 0.2 |
| devops-engineer | CI/CD, containerization, infrastructure | 20 | 0.2 |
| hlasm-assembler-specialist | IBM HLASM for z/OS, macros, SVCs | 25 | 0.2 |
| i18n-specialist | Internationalization, RTL, locales | 20 | 0.2 |
| ibm-i-specialist | IBM i RPG/CL, DB2 for i, OS/400 | 25 | 0.2 |
| integration-engineer | B2B APIs, ETL, message brokers (Kafka, MQ) | 25 | 0.2 |
| ml-engineer | Model training, feature pipelines, evaluation | 25 | 0.2 |
| mlops-engineer | Model registry, CI/CD for models, drift detection | 25 | 0.2 |
| mobile-engineer | iOS/Android/React Native/Flutter platform work | 25 | 0.2 |
| observability-engineer | Metrics, logs, traces, OpenTelemetry, dashboards | 25 | 0.2 |
| platform-engineer | Internal developer platforms, paved paths | 25 | 0.2 |
| refactor | Code restructuring, debt reduction | 25 | 0.2 |
| tester | Unit/integration/E2E tests, TDD | 25 | 0.2 |

## MCP Tools Quick Reference

| Tool | Pack | Purpose |
|------|------|---------|
| `initialize_workspace` | Workspace | Create state directories |
| `assess_task_complexity` | Workspace | Repo analysis signals |
| `validate_plan` | Workspace | Plan validation + dependency DAG |
| `resolve_settings` | Workspace | Setting resolution with precedence |
| `create_session` | Session | Create active session |
| `get_session_status` | Session | Read session state |
| `update_session` | Session | Update execution metadata |
| `transition_phase` | Session | Complete phase + start next |
| `archive_session` | Session | Move to archive |
| `enter_design_gate` | Session | Mark session as entering design phase (idempotent) |
| `record_design_approval` | Session | Record user approval of design document |
| `get_design_gate_status` | Session | Read design gate status for a session |
| `scan_phase_changes` | Session | Scan workspace for files changed since phase start |
| `reconcile_phase` | Session | Record file manifests for un-handed-off phase |
| `get_skill_content` | Content | Serve skills/templates/references |
| `get_agent` | Content | Serve agent methodologies |
| `get_runtime_context` | Content | Runtime config snapshot |
