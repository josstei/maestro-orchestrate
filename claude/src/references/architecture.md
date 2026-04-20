# Maestro Architecture Reference

## Orchestration Model

Maestro is a multi-agent orchestration system that coordinates 39 specialized agents through a structured 4-phase workflow:

1. **Design** — Structured requirements discovery, tradeoff-backed design questions, and design approval
2. **Plan** — Phase-based implementation planning with dependencies, file ownership, and validation gates
3. **Execute** — Delegated execution through child agents in parallel or sequential mode
4. **Complete** — Deliverable verification, code review gate, archival, and summary

The TechLead orchestrator does not implement code directly. It designs, plans, delegates to specialized agents, validates results, and reports outcomes.

## Agent Roster

| Agent | Focus |
| --- | --- |
| `accessibility-specialist` | WCAG compliance auditing, ARIA review |
| `analytics-engineer` | Event tracking, conversion funnels |
| `api-designer` | API contracts and endpoint design |
| `architect` | System design and architecture decisions |
| `cloud-architect` | AWS/GCP/Azure topology, IaC, multi-region design |
| `cobol-engineer` | Mainframe COBOL, JCL, CICS/IMS on z/OS |
| `code-reviewer` | Code quality review and bug identification |
| `coder` | Feature implementation |
| `compliance-reviewer` | Legal and regulatory compliance (GDPR, CCPA, licensing) |
| `content-strategist` | Content planning and strategy |
| `copywriter` | Marketing copy and landing-page content |
| `data-engineer` | Schema design, queries, and data pipelines |
| `database-administrator` | RDBMS tuning, indexes, migration safety (Postgres, MySQL, Oracle, SQL Server) |
| `db2-dba` | DB2 for z/OS and LUW, REORG, RUNSTATS, bind/rebind |
| `debugger` | Root cause analysis and defect investigation |
| `design-system-engineer` | Design tokens and theming |
| `devops-engineer` | CI/CD, containerization, and deployment |
| `hlasm-assembler-specialist` | IBM HLASM for z/OS, macros, SVCs |
| `i18n-specialist` | Internationalization and locale management |
| `ibm-i-specialist` | IBM i RPG/CL, DB2 for i, OS/400 |
| `integration-engineer` | B2B APIs, ETL, message brokers (Kafka, MQ) |
| `ml-engineer` | Model training, feature pipelines, evaluation |
| `mlops-engineer` | Model registry, CI/CD for models, drift detection |
| `mobile-engineer` | iOS/Android/React Native/Flutter platform work |
| `observability-engineer` | Metrics, logs, traces, OpenTelemetry, dashboards |
| `performance-engineer` | Performance profiling and optimization |
| `platform-engineer` | Internal developer platforms, paved paths |
| `product-manager` | Requirements and product strategy |
| `prompt-engineer` | LLM prompt design, few-shot, RAG tuning |
| `refactor` | Structural refactoring and technical debt |
| `release-manager` | Release notes, changelogs, rollout planning |
| `security-engineer` | Security assessment and vulnerability analysis |
| `seo-specialist` | Technical SEO auditing and structured data |
| `site-reliability-engineer` | SLOs, error budgets, runbooks, postmortems |
| `solutions-architect` | Enterprise integration, cross-team architecture |
| `technical-writer` | Documentation and technical writing |
| `tester` | Test implementation and coverage analysis |
| `ux-designer` | User experience design |
| `zos-sysprog` | z/OS systems programming, JCL, USS, RACF |

Agent names use the format specified by the runtime's Agent Naming Convention section. When delegating, use the exact name from the roster.

## State Contract

<!-- @feature scriptBasedStateContract -->
Maestro maintains session state under `<state_dir>` (resolved from `MAESTRO_STATE_DIR`):

- **Active session**: `<state_dir>/state/active-session.md`
- **Plans**: `<state_dir>/plans/`
- **Archives**: `<state_dir>/state/archive/`, `<state_dir>/plans/archive/`

State scripts:

- `node ${extensionPath}/src/scripts/ensure-workspace.js <state_dir>` — initialize workspace directories
- `node ${extensionPath}/src/scripts/read-active-session.js` — read current session state
- `node ${extensionPath}/src/scripts/read-state.js <relative-path>` — read arbitrary state file
- `node ${extensionPath}/src/scripts/write-state.js <relative-path>` — write state from stdin
- `node ${extensionPath}/src/scripts/read-setting.js <SETTING_NAME>` — resolve a Maestro setting
<!-- @end-feature -->
<!-- @feature claudeStateContract -->
Maestro maintains session state under `docs/maestro` (resolved from `MAESTRO_STATE_DIR`):

- **Active session**: `docs/maestro/state/active-session.md`
- **Plans**: `docs/maestro/plans/`
- **Archives**: `docs/maestro/state/archive/`, `docs/maestro/plans/archive/`

State scripts:

- `node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/ensure-workspace.js docs/maestro` — initialize workspace directories
- `node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/read-active-session.js` — read current session state
- `node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/read-state.js <relative-path>` — read arbitrary state file
- `node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/write-state.js <relative-path>` — write state from stdin
- `node ${CLAUDE_PLUGIN_ROOT}/../src/scripts/read-setting.js <SETTING_NAME>` — resolve a Maestro setting
<!-- @end-feature -->
<!-- @feature codexStateContract -->
Maestro maintains session state under `docs/maestro` in the workspace root:

- **Active session**: `docs/maestro/state/active-session.md`
- **Plans**: `docs/maestro/plans/`
- **Archives**: `docs/maestro/state/archive/`, `docs/maestro/plans/archive/`

State scripts:

- `node ./src/scripts/ensure-workspace.js docs/maestro` — initialize workspace directories
- `node ./src/scripts/read-active-session.js` — read current session state
- `node ./src/scripts/read-state.js <relative-path>` — read arbitrary state file
- `node ./src/scripts/write-state.js <relative-path>` — write state from stdin
- `node ./src/scripts/read-setting.js <SETTING_NAME>` — resolve a Maestro setting
<!-- @end-feature -->

## Session Management

Sessions track:

- Session ID and creation timestamp
- Current phase and overall status
- Phase-by-phase progress with assigned agents, file manifests, and validation results
- Execution mode (`parallel` or `sequential`)
- Downstream context for inter-phase dependencies
- Error history and retry counts

Session lifecycle: create -> active -> (resume if interrupted) -> archive on completion.

## Execution Modes

- **parallel**: Dispatch multiple child agents for phases at the same dependency depth with non-overlapping file ownership
- **sequential**: Dispatch one child agent at a time in dependency order
- **ask**: Prompt the user for mode selection after plan approval (default)

The execution mode gate must resolve before any implementation delegation begins.

## Delegation Contract

Every delegated agent query must include the header:
- `Agent: <agent_name>`
- `Phase: <id>/<total>`
- `Batch: <batch_id|single>`
- `Session: <session_id>`

Every agent must conclude with:
- `## Task Report` — what was done, files changed, tests run
- `## Downstream Context` — information needed by subsequent phases
