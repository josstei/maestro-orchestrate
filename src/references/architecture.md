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

See the `session-management` skill (load via `get_skill_content`) for the full state-access protocol, session paths, and lifecycle. State is mediated exclusively through MCP state tools — never direct file or shell access.

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

See the `execution` skill's Execution Mode Gate (load via `get_skill_content`) for the parallel/sequential/ask modes and the gate that must resolve before any implementation delegation begins.

## Delegation Contract

See the `delegation` skill's Agent Tool Dispatch Contract (load via `get_skill_content`) for the required `Agent`/`Phase`/`Batch`/`Session` header, and `agent-base-protocol`'s Output Handoff Contract for the required `## Task Report` / `## Downstream Context` conclusion.
