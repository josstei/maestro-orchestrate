# Maestro Architecture Reference

## Orchestration Model

Maestro is a multi-agent orchestration system that coordinates 39 specialized agents through a structured 4-phase workflow:

1. **Design** — Structured requirements discovery, tradeoff-backed design questions, and design approval
2. **Plan** — Phase-based implementation planning with dependencies, file ownership, and validation gates
3. **Execute** — Delegated execution through child agents in parallel or sequential mode
4. **Complete** — Deliverable verification, code review gate, archival, and summary

The TechLead orchestrator does not implement code directly. It designs, plans, delegates to specialized agents, validates results, and reports outcomes.

## Agent Roster

<!-- @roster -->

Agent names use the format specified by the runtime's Agent Naming Convention section. When delegating, use the exact name from the roster.

## State Contract

Maestro maintains session state under `docs/maestro` in the workspace root
(or the configured `MAESTRO_STATE_DIR`):

- **Active session**: `docs/maestro/state/active-session.md`
- **Plans**: `docs/maestro/plans/`
- **Archives**: `docs/maestro/state/archive/`, `docs/maestro/plans/archive/`

State access is mediated by MCP state tools:

- `initialize_workspace` — create workspace state directories and marker
- `get_session_status` — read active session status
- `create_session`, `update_session`, `transition_phase` — mutate session state
- `archive_session` — archive completed or abandoned sessions
- `resolve_settings` — resolve Maestro settings with documented precedence

The on-disk paths are an implementation detail of the MCP server, not a public
shell or direct-file contract.

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
