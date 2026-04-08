# Maestro Usage

## Development Commands

```bash
# Regenerate runtime files from source
node scripts/generate.js

# Generate runtime adapters using package scripts
npm run build

# Run the architecture and runtime validation suite
node --test tests/transforms/*.test.js tests/integration/*.test.js

# Show unified diff of changes
node scripts/generate.js --diff

# Delete all generated files and regenerate
node scripts/generate.js --clean

# Run all tests
just test

# Run only transform unit tests
just test-transforms

# Run only integration tests
just test-integration

# Generate + verify zero drift (CI equivalent)
just check

# Full CI equivalent (check + test)
just ci

# Release: tag a version and push
just release <version>
```

## Editing Workflow

1. Edit files in `src/`, never in root, `claude/`, or `plugins/maestro/` directly
2. Run `node scripts/generate.js` or `npm run build` to regenerate runtime adapters
3. Run `node --test tests/transforms/*.test.js tests/integration/*.test.js` before committing
4. Commit both canonical source and generated adapter output together
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
| `/resume` | Resume interrupted session |
| `/review` | Code review |
| `/debug` | Debugging workflow |
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
| `$maestro:resume` | Resume interrupted session |
| `$maestro:review` | Code review |
| `$maestro:debug` | Debugging workflow |
| `$maestro:archive` | Archive active session |
| `$maestro:status` | Show session status |
| `$maestro:security-audit` | Security assessment |
| `$maestro:perf-check` | Performance assessment |
| `$maestro:seo-audit` | SEO audit |
| `$maestro:a11y-audit` | Accessibility audit |
| `$maestro:compliance-check` | Compliance review |

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
status: "in_progress"
workflow_mode: "standard"
current_phase: 2
total_phases: 4
execution_mode: "sequential"
task_complexity: "medium"
phases:
  - id: 1
    name: "Foundation"
    status: "completed"
    agents: ["architect"]
  - id: 2
    name: "Implementation"
    status: "in_progress"
    agents: ["coder"]
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
| code-reviewer | Bug detection, quality assessment | 15 | 0.2 |
| content-strategist | Content planning, editorial calendars | 15 | 0.3 |
| compliance-reviewer | GDPR/CCPA, license auditing | 15 | 0.3 |

### Read + Shell Agents (investigation, profiling)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| debugger | Root cause analysis, execution tracing | 20 | 0.2 |
| performance-engineer | Profiling, optimization | 20 | 0.2 |
| security-engineer | Vulnerability assessment, threat modeling | 20 | 0.2 |
| seo-specialist | Technical SEO, structured data | 20 | 0.2 |
| accessibility-specialist | WCAG compliance, ARIA review | 20 | 0.2 |

### Read + Write Agents (documentation, design)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| technical-writer | Documentation, API references | 15 | 0.3 |
| product-manager | PRDs, user stories, prioritization | 20 | 0.2 |
| ux-designer | User flows, wireframes, heuristics | 20 | 0.2 |
| copywriter | Marketing copy, landing pages | 20 | 0.3 |

### Full Access Agents (implementation)

| Agent | Specialty | Turns | Temp |
|-------|-----------|-------|------|
| coder | Feature implementation, SOLID principles | 25 | 0.2 |
| data-engineer | Schema design, ETL, migrations | 20 | 0.2 |
| devops-engineer | CI/CD, containerization, infrastructure | 20 | 0.2 |
| tester | Unit/integration/E2E tests, TDD | 25 | 0.2 |
| refactor | Code restructuring, debt reduction | 25 | 0.2 |
| design-system-engineer | Design tokens, theming, component APIs | 25 | 0.2 |
| i18n-specialist | Internationalization, RTL, locales | 20 | 0.2 |
| analytics-engineer | Event tracking, A/B testing, funnels | 25 | 0.2 |

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
| `get_skill_content` | Content | Serve skills/templates/references |
| `get_agent` | Content | Serve agent methodologies |
| `get_runtime_context` | Content | Runtime config snapshot |
