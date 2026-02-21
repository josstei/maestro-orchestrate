# Comprehensive Architectural Map

This document provides a high-level map of the Maestro architecture, connecting its configuration, orchestration logic, agent system, and state management.

## Overview

Maestro is a multi-agent development orchestration platform designed to handle complex software delivery tasks through a structured, four-phase workflow. It leverages the Gemini CLI extension ecosystem to provide specialized agents, custom slash commands, and automated quality gates.

### Core Goals
- **Structured Delivery**: Move from design to completion through predictable phases.
- **Specialized Expertise**: Utilize 12 distinct agent roles with specific tool permissions.
- **Scalable Execution**: Support both sequential and parallel multi-agent execution.
- **Persistent Context**: Maintain session state across multiple CLI interactions.

---

## Entry Points

Maestro integrates with the Gemini CLI through several key entry points:

### 1. Extension Manifest (`gemini-extension.json`)
Defines the extension name, version, and user-configurable settings. These settings are hydrated as `MAESTRO_*` environment variables.

### 2. Orchestrator Context (`GEMINI.md`)
The "brain" of the system. This file contains the system prompt for the TechLead orchestrator, defining the four-phase workflow, delegation rules, and tool usage protocols.

### 3. Slash Commands (`commands/maestro/`)
Custom commands registered with the Gemini CLI.
- `/maestro:orchestrate`: Full Design -> Plan -> Execute workflow.
- `/maestro:execute`: Execute an existing implementation plan.
- `/maestro:resume`: Resume an active session.
- `/maestro:status`: View current session status.
- `/maestro:archive`: Archive the active session.
- `/maestro:review`, `/maestro:debug`, `/maestro:perf-check`, `/maestro:security-audit`: Specialized standalone workflows.

### 4. Hooks (`hooks/hooks.json`)
Middleware that runs during agent execution:
- **SessionStart (`session-start.js`)**: Prunes stale hook state, initializes session directory when an active session exists.
- **BeforeAgent (`before-agent.js`)**: Tracks the active agent and injects session context.
- **AfterAgent (`after-agent.js`)**: Validates that agent output follows the mandatory handoff format.
- **SessionEnd (`session-end.js`)**: Removes session hook state directory.

---

## Orchestration Flow

Maestro follows a sequential four-phase lifecycle:

1.  **Design**: Requirements gathering and architectural convergence using the `design-dialogue` skill.
2.  **Plan**: Decomposition of the task into phases, agent assignments, and dependency mapping using `implementation-planning`.
3.  **Execute**: Delegation of tasks to specialized agents using `execution` and `delegation` skills. This phase can run in `parallel`, `sequential`, or `ask` mode.
4.  **Complete**: Final validation, optional code review pass, and session archival.

---

## Agent System

Maestro employs a roster of 12 specialized agents, each defined in `agents/*.md`.

All agents share a baseline tool set: `read_file`, `list_directory`, `glob`, `grep_search`, `read_many_files`, `ask_user`. The table below shows additional tools and primary responsibility.

| Role | Primary Responsibility | Additional Tools |
| :--- | :--- | :--- |
| **architect** | System design & tech stack | Web search/fetch |
| **api_designer** | Interface & contract design | Web search/fetch |
| **coder** | Feature implementation | Write, Replace, Shell, Skills |
| **tester** | Test suite implementation | Write, Replace, Shell, Skills, Web search |
| **code_reviewer** | Quality & pattern enforcement | _(baseline only)_ |
| **debugger** | Root cause analysis | Shell |
| **devops_engineer** | CI/CD & infrastructure | Write, Replace, Shell, Web search/fetch |
| **security_engineer** | Security auditing | Shell, Web search/fetch |
| **performance_engineer** | Profiling & optimization | Shell, Web search/fetch |
| **data_engineer** | Schema & query design | Write, Replace, Shell, Web search |
| **refactor** | Structural improvements | Write, Replace, Skills |
| **technical_writer** | Documentation | Write, Replace, Web search |

### Delegation Protocols
All agents are bound by injected protocols:
- **Agent Base Protocol**: Defines pre-flight checks and mandatory handoff format (`Task Report` + `Downstream Context`).
- **Filesystem Safety Protocol**: Ensures parent directories exist before writing and forbids shell-based file writes.

---

## Parallel Dispatch

The parallel dispatch mechanism allows multiple agents to work concurrently on independent tasks.

1.  **Preparation**: The orchestrator writes self-contained prompt files to `.gemini/parallel/<batch-id>/prompts/`.
2.  **Dispatch**: `scripts/parallel-dispatch.js` launches multiple `gemini` processes.
3.  **Execution**: Each process runs an agent with `--approval-mode=yolo` and streams the prompt via `stdin`.
4.  **Collection**: Results (JSON, logs, exit codes) are collected in `.gemini/parallel/<batch-id>/results/`.
5.  **Aggregation**: A `summary.json` is produced, and the orchestrator processes the results.

---

## State Management

Maestro maintains state in a project-local directory (default: `.gemini/`).

### Directory Structure
```text
.gemini/
├── state/
│   ├── active-session.md      # Current session status and history
│   └── archive/               # Completed/archived sessions
├── plans/
│   ├── *-design.md            # Approved design documents
│   ├── *-impl-plan.md         # Approved implementation plans
│   └── archive/               # Archived plans
└── parallel/
    └── <batch-id>/            # Artifacts from parallel agent runs
        ├── prompts/
        └── results/
```

### Persistence Logic
- **Active Session**: Updated after every phase or parallel batch.
- **Utility Scripts**: `scripts/read-active-session.js` and `scripts/read-state.js` are used to bypass `.gitignore` restrictions when reading state.

---

## Component Map

| Path | Responsibility |
| :--- | :--- |
| `gemini-extension.json` | Extension manifest: name, version, and user-configurable `MAESTRO_*` settings. |
| `GEMINI.md` | TechLead orchestrator system prompt: four-phase protocol, delegation rules, tool usage. |
| `package.json` | NPM package identity and version sync hook (`scripts/sync-version.js`). |
| `agents/` | Agent definitions (system prompts and tool permissions). |
| `commands/maestro/` | Slash command definitions and orchestration logic. |
| `docs/architecture/` | System documentation and architecture guides. |
| `hooks/` | Lifecycle middleware: SessionStart, BeforeAgent, AfterAgent, SessionEnd. |
| `scripts/` | Utility scripts for state management, workspace setup, and dispatch. |
| `skills/` | Reusable procedural protocols (planning, execution, delegation). Includes `delegation/protocols/` for shared agent protocols. |
| `src/lib/` | Shared JavaScript logic organized by domain: `core/`, `config/`, `state/`, `hooks/`, `dispatch/`. |
| `templates/` | Standardized formats for plans and session state (`design-document.md`, `implementation-plan.md`, `session-state.md`). |
| `tests/` | Unit tests (`tests/unit/`) and integration tests (`tests/integration/`) with shared helpers (`tests/helpers/`). |
