# Maestro Usage

For detailed CI/CD pipeline documentation including workflow diagrams, the release process, and npm publishing strategy, see [docs/cicd.md](https://github.com/josstei/maestro-orchestrate/blob/main/docs/cicd.md).

## Development Commands

```bash
# Regenerate runtime files from source (same as npm run generate, npm run build, or just generate)
node scripts/generate.js

# Preview what the generator would change, without writing (just dry-run)
node scripts/generate.js --dry-run

# Show a unified diff of pending generator changes (just diff)
node scripts/generate.js --diff

# List only pending generator changes, and exit 1 if there are any
node scripts/generate.js --check

# Delete the generated agent and shared-skill stubs, then regenerate (just clean)
node scripts/generate.js --clean

# Run all tests across unit, transform, and integration suites
npm test

# Run all tests through just (same globs as npm test)
just test

# Run only unit tests
just test-unit

# Run only transform unit tests
just test-transforms

# Run only integration tests
just test-integration

# Verify zero drift without writing, in a clean worktree/CI checkout
just check

# Verify lib/ import-boundary rules
just check-layers

# Full CI equivalent in a clean worktree/CI checkout (check + test + pack-verify + release-verify)
just ci

# Delete local branches whose remotes are gone
just cleanup-branches
```

## Editing Workflow

1. Edit canonical source in `src/`. Maintain the hand-authored root docs (`README.md`, `EXAMPLES.md`, `USAGE.md`, `OVERVIEW.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`) and the Qwen context file (`QWEN.md`) directly. Do not edit generator output: public MCP-server, hook-runner and policy-enforcer wrappers, agent stubs, runtime skills, command files, manifests, hook registrations, the policy pack, the `src/generated/` registries, or the detached `antigravity/src/`, `claude/src/`, and `plugins/maestro/src/` payloads.
2. Run `node scripts/generate.js` or `npm run build` to regenerate runtime outputs
3. Run `node scripts/generate.js --diff` to confirm the generator has no additional pending output
4. Run `npm test` (or `just test`) before committing
5. Commit canonical source, directly owned files, and generated output together
6. CI will fail if runtime outputs drift from canonical `src/`; `just check` and `just ci` are designed for clean worktrees because `--check` compares `src/` with the generated files on disk

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
| `MAESTRO_WORKSPACE_PATH` | Antigravity | First source for `workspace_suggestion` when exported before starting `agy`; otherwise the suggestion comes from MCP `roots/list` |
| `MAESTRO_EXTENSION_PATH` | Qwen | Override extension root path |
| `MAESTRO_WORKSPACE_PATH` | Qwen | Workspace root (set by Qwen Code) |
| `MAESTRO_WORKSPACE_PATH` | Codex | First source for `workspace_suggestion` when the host exports it; otherwise the suggestion comes from MCP `roots/list` |
| `CLAUDE_PLUGIN_ROOT` | Claude | Plugin root (set by Claude Code) |
| `CLAUDE_PROJECT_DIR` | Claude | Project directory (set by Claude Code) |

## Invoking Maestro

Qwen Code runs TOML slash commands from `commands/maestro/`, Claude Code runs Markdown skills as slash commands, Antigravity runs plugin skills as slash commands under the plugin namespace, and Codex invokes skills through the plugin namespace:

| Capability | Antigravity | Claude Code | Codex | Qwen Code | Purpose |
|------------|-------------|-------------|-------|-----------|---------|
| Orchestrate | `/maestro:orchestrate` | `/orchestrate` | `$maestro:orchestrate` | `/maestro:orchestrate` | Full orchestration workflow |
| Execute | `/maestro:execute` | `/execute` | `$maestro:execute` | `/maestro:execute` | Execute an approved plan |
| Resume | `/maestro:resume-session` | `/resume-session` | `$maestro:resume-session` | `/maestro:resume` | Resume interrupted session |
| Review | `/maestro:review-code` | `/review-code` | `$maestro:review-code` | `/maestro:review` | Code review |
| Debug | `/maestro:debug-workflow` | `/debug-workflow` | `$maestro:debug-workflow` | `/maestro:debug` | Debugging workflow |
| Archive | `/maestro:archive` | `/archive` | `$maestro:archive` | `/maestro:archive` | Archive active session |
| Status | `/maestro:status` | `/status` | `$maestro:status` | `/maestro:status` | Show session status |
| Security Audit | `/maestro:security-audit` | `/security-audit` | `$maestro:security-audit` | `/maestro:security-audit` | Security assessment |
| Performance Check | `/maestro:perf-check` | `/perf-check` | `$maestro:perf-check` | `/maestro:perf-check` | Performance assessment |
| SEO Audit | `/maestro:seo-audit` | `/seo-audit` | `$maestro:seo-audit` | `/maestro:seo-audit` | SEO audit |
| Accessibility Audit | `/maestro:a11y-audit` | `/a11y-audit` | `$maestro:a11y-audit` | `/maestro:a11y-audit` | Accessibility audit |
| Compliance Check | `/maestro:compliance-check` | `/compliance-check` | `$maestro:compliance-check` | `/maestro:compliance-check` | Compliance review |

Claude Code and Codex keep their built-in `/review`, `/debug`, and `/resume` commands, and Antigravity has a built-in `/resume`. Maestro exposes `review-code`, `debug-workflow`, and `resume-session` in those runtimes (`/review-code` in Claude Code, `$maestro:review-code` in Codex, `/maestro:review-code` in Antigravity, and so on) to avoid colliding with those host commands.

## State Directory Structure

After running Maestro, the state directory (default: `docs/maestro/`) contains:

```
docs/maestro/
├── state/
│   ├── active-session.md         # Current session
│   ├── .maestro/                 # Private coordination and recovery metadata
│   └── archive/
│       └── <session-id>.md       # Archived sessions
└── plans/
    ├── <date>-<topic>-design.md  # Design documents
    ├── <date>-<topic>-impl-plan.md # Implementation plans
    └── archive/
        └── ...                   # Archived plans
```

### Concurrent updates and recovery

MCP state operations and the installed state scripts coordinate access to the configured state directory. Committed operations interrupted by a process crash are completed on the next access. Existing session Markdown and gate JSON formats do not change, and no workspace migration is required. Ordinary reads do not create state directories.

| Error code | Action |
|------------|--------|
| `STATE_BUSY` | Wait for the other operation, then inspect current state before retrying. |
| `STATE_RECOVERED` | A previous operation finished during recovery. Read current state; do not blindly repeat the mutation. |
| `STATE_RECOVERY_REQUIRED` | Resolve the reported filesystem problem or unexpected edit while preserving the transaction journal. |
| `STATE_CONFLICT` | Read the latest content and reapply the intended change. |

For a script-based read/modify/write, run `read-state.js <relative-path> --with-digest`. It returns JSON containing `content` and `sha256`. Send the replacement content to `write-state.js <relative-path> --expected-sha256 <digest>` on stdin, using the returned digest. Guarded writes require a target inside the configured state directory; a missing file or changed digest is a conflict. Existing invocations still return raw content or perform an unguarded whole-file write.

Direct editor writes and older Maestro versions do not participate in coordination. Keep those writers separate from active MCP/script operations. Do not remove `state/.maestro/` or downgrade while a committed transaction is pending. Recovery protects process interruptions; power-loss durability depends on the operating system and filesystem.

### Session State Format

Active sessions are a frontmatter block followed by a Markdown log. MCP `create_session` writes the frontmatter as JSON (`src/core/markdown-state.js`), and the MCP session tools read it back as JSON. The example below uses the YAML layout of the session-state template (`src/templates/session-state.md`), which direct-write fallbacks follow:

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

| Agent | Specialty | Turns |
|-------|-----------|-------|
| architect | System design, technology selection | 15 |
| api-designer | Endpoint design, API contracts | 15 |
| cloud-architect | AWS/GCP/Azure topology, IaC, multi-region design | 15 |
| code-reviewer | Bug detection, quality assessment | 15 |
| compliance-reviewer | GDPR/CCPA, license auditing | 15 |
| content-strategist | Content planning, editorial calendars | 15 |
| solutions-architect | Enterprise integration, cross-team architecture | 15 |

### Read + Shell Agents (investigation, profiling)

| Agent | Specialty | Turns |
|-------|-----------|-------|
| accessibility-specialist | WCAG compliance, ARIA review | 20 |
| database-administrator | RDBMS tuning, indexes, migration safety | 20 |
| db2-dba | DB2 for z/OS and LUW, REORG/RUNSTATS/bind | 20 |
| debugger | Root cause analysis, execution tracing | 20 |
| performance-engineer | Profiling, optimization | 20 |
| security-engineer | Vulnerability assessment, threat modeling | 20 |
| seo-specialist | Technical SEO, structured data | 20 |
| site-reliability-engineer | SLOs, error budgets, runbooks, postmortems | 20 |
| zos-sysprog | z/OS systems programming, JCL, USS, RACF | 20 |

### Read + Write Agents (documentation, design)

| Agent | Specialty | Turns |
|-------|-----------|-------|
| copywriter | Marketing copy, landing pages | 20 |
| product-manager | PRDs, user stories, prioritization | 20 |
| prompt-engineer | LLM prompt design, few-shot, RAG tuning | 15 |
| release-manager | Release notes, changelogs, rollout planning | 15 |
| technical-writer | Documentation, API references | 15 |
| ux-designer | User flows, wireframes, heuristics | 20 |

### Full Access Agents (implementation)

| Agent | Specialty | Turns |
|-------|-----------|-------|
| analytics-engineer | Event tracking, A/B testing, funnels | 25 |
| cobol-engineer | Mainframe COBOL, JCL, CICS/IMS on z/OS | 25 |
| coder | Feature implementation, SOLID principles | 25 |
| data-engineer | Schema design, ETL, migrations | 20 |
| design-system-engineer | Design tokens, theming, component APIs | 25 |
| devops-engineer | CI/CD, containerization, infrastructure | 20 |
| hlasm-assembler-specialist | IBM HLASM for z/OS, macros, SVCs | 25 |
| i18n-specialist | Internationalization, RTL, locales | 20 |
| ibm-i-specialist | IBM i RPG/CL, DB2 for i, OS/400 | 25 |
| integration-engineer | B2B APIs, ETL, message brokers (Kafka, MQ) | 25 |
| ml-engineer | Model training, feature pipelines, evaluation | 25 |
| mlops-engineer | Model registry, CI/CD for models, drift detection | 25 |
| mobile-engineer | iOS/Android/React Native/Flutter platform work | 25 |
| observability-engineer | Metrics, logs, traces, OpenTelemetry, dashboards | 25 |
| platform-engineer | Internal developer platforms, paved paths | 25 |
| refactor | Code restructuring, debt reduction | 25 |
| tester | Unit/integration/E2E tests, TDD | 25 |

## MCP Tools Quick Reference

| Tool | Pack | Required Params | Purpose |
|------|------|-----------------|---------|
| `initialize_workspace` | Workspace | `workspace_path` | Create state/plans directories (idempotent) and record the workspace root |
| `assess_task_complexity` | Workspace | — | Return repo signals for complexity classification |
| `validate_plan` | Workspace | `plan`, `task_complexity` | Validate dependencies, file ownership, and agent capabilities |
| `resolve_settings` | Workspace | — | Resolve `MAESTRO_*` settings with precedence |
| `create_session` | Session | `session_id`, `task`, `phases` | Create the active session document |
| `get_session_status` | Session | — | Read session state |
| `update_session` | Session | `session_id` | Update execution metadata (mode, backend, batch) |
| `transition_phase` | Session | `session_id` | Atomically complete a phase and start the next |
| `archive_session` | Session | `session_id` | Move the session and its plans to archive |
| `enter_design_gate` | Session | `session_id` | Mark the session as entering the design phase (idempotent); blocks `create_session` until approval |
| `record_design_approval` | Session | `session_id`, plus the design document path or inline content | Record user approval of the design document, clearing the design gate |
| `get_design_gate_status` | Session | `session_id` | Read design gate status (`entered_at`, `approved_at`) |
| `scan_phase_changes` | Session | `session_id`, `phase_id` | Scan the workspace for files created or modified since phase start |
| `reconcile_phase` | Session | `session_id`, `phase_id` | Record file manifests and downstream context for a phase that was not handed off cleanly |
| `get_skill_content` | Content | `resources` | Serve skills, templates, and references with runtime transforms |
| `get_agent` | Content | `agents` | Serve agent methodologies with tool mappings |
| `get_runtime_context` | Content | — | Return runtime tool mappings, dispatch syntax, MCP prefix, and `workspace_suggestion` |
