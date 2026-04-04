# Maestro Architecture Reference

## Orchestration Model

Maestro is a multi-agent orchestration system that coordinates 22 specialized agents through a structured 4-phase workflow:

1. **Design** — Structured requirements discovery, tradeoff-backed design questions, and design approval
2. **Plan** — Phase-based implementation planning with dependencies, file ownership, and validation gates
3. **Execute** — Delegated execution through child agents in parallel or sequential mode
4. **Complete** — Deliverable verification, code review gate, archival, and summary

The TechLead orchestrator does not implement code directly. It designs, plans, delegates to specialized agents, validates results, and reports outcomes.

## Agent Roster

| Agent | Focus |
| --- | --- |
| `architect` | System design and architecture decisions |
| `api-designer` | API contracts and endpoint design |
| `code-reviewer` | Code quality review and bug identification |
| `coder` | Feature implementation |
| `data-engineer` | Schema design, queries, and data pipelines |
| `debugger` | Root cause analysis and defect investigation |
| `devops-engineer` | CI/CD, containerization, and deployment |
| `performance-engineer` | Performance profiling and optimization |
| `refactor` | Structural refactoring and technical debt |
| `security-engineer` | Security assessment and vulnerability analysis |
| `technical-writer` | Documentation and technical writing |
| `tester` | Test implementation and coverage analysis |
| `seo-specialist` | Technical SEO auditing |
| `copywriter` | Marketing copy and content |
| `content-strategist` | Content planning and strategy |
| `ux-designer` | User experience design |
| `accessibility-specialist` | WCAG compliance auditing |
| `product-manager` | Requirements and product strategy |
| `analytics-engineer` | Tracking and measurement |
| `i18n-specialist` | Internationalization |
| `design-system-engineer` | Design tokens and theming |
| `compliance-reviewer` | Legal and regulatory compliance |

Agent names use the format specified by the runtime's Agent Naming Convention section. When delegating, use the exact name from the roster.

## State Contract

Maestro maintains session state under `docs/maestro` (resolved from `MAESTRO_STATE_DIR`):

- **Active session**: `docs/maestro/state/active-session.md`
- **Plans**: `docs/maestro/plans/`
- **Archives**: `docs/maestro/state/archive/`, `docs/maestro/plans/archive/`

State scripts:

- `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-workspace.js docs/maestro` — initialize workspace directories
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/read-active-session.js` — read current session state
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/read-state.js <relative-path>` — read arbitrary state file
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/write-state.js <relative-path>` — write state from stdin
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/read-setting.js <SETTING_NAME>` — resolve a Maestro setting

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
