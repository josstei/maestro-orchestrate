# Maestro

[![Version](https://img.shields.io/badge/version-1.2.1-blue)](https://github.com/josstei/maestro-gemini/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-extension-orange)](https://geminicli.com)

Multi-agent orchestration extension for Gemini CLI. Maestro delegates work to 12 specialized subagents — with support for parallel dispatch of independent phases — coordinated by a TechLead orchestrator through structured design, planning, and execution workflows.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Commands](#commands)
  - [Orchestration](#orchestration)
  - [Standalone Tools](#standalone-tools)
  - [Session Management](#session-management)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Model Configuration](#model-configuration)
- [Architecture](#architecture)
  - [Orchestration Flow](#orchestration-flow)
  - [Component Model](#component-model)
  - [Workflow Phases](#workflow-phases)
- [Agents](#agents)
  - [Agent Roster](#agent-roster)
  - [Tool Access Philosophy](#tool-access-philosophy)
- [Skills](#skills)
- [Parallel Execution](#parallel-execution)
  - [How It Works](#how-it-works)
  - [When to Use Each Mode](#when-to-use-each-mode)
  - [Dispatch Directory Structure](#dispatch-directory-structure)
  - [Constraints](#constraints)
- [Session State & Project Output](#session-state--project-output)
- [Documentation](#documentation)
  - [Usage Guide](USAGE.md)
  - [Architecture](docs/architecture/)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

Maestro transforms Gemini CLI into a multi-agent orchestration platform. Instead of a single AI session handling everything, Maestro delegates work to 12 specialized subagents — each with its own context, tools, and expertise — coordinated by a TechLead orchestrator through a structured 4-phase workflow: Design, Plan, Execute, Complete.

## Features

- **Guided Design Dialogue** — Structured requirements gathering with multiple-choice questions and architectural approach proposals
- **Automated Planning** — Generates implementation plans with phase dependencies, agent assignments, and parallelization opportunities
- **Parallel Execution** — Independent phases run concurrently through shell-based parallel dispatch
- **Session Persistence** — All orchestration state tracked in YAML+Markdown files for reliable resumption
- **Hooks-Based Lifecycle Middleware** — Lifecycle hooks for active-agent tracking and handoff validation
- **Least-Privilege Security** — Each subagent receives only the tools required for its role
- **Standalone Commands** — Direct access to code review, debugging, security audit, and performance analysis without full orchestration
- **Configurable Settings** — 14 environment-variable-driven parameters for model selection, timeouts, validation strictness, and dispatch behavior

## Getting Started

### Prerequisites

Maestro relies on Gemini CLI's experimental subagent system. Enable it in your Gemini CLI settings:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

> **Warning**: Parallel-dispatched agents run in autonomous mode (`--approval-mode=yolo`). Sequential delegation uses your current Gemini CLI approval mode. Review the [subagents documentation](https://geminicli.com/docs/core/subagents/) for details.

The `settings.json` file is located at:
- **macOS/Linux**: `~/.gemini/settings.json`
- **Windows**: `%USERPROFILE%\.gemini\settings.json`

Maestro does not auto-edit `settings.json`. Enable `experimental.enableAgents` manually before running orchestration commands.

### Installation

**From Git Repository:**

```bash
gemini extensions install https://github.com/josstei/maestro-gemini
```

**Local Development:**

```bash
git clone https://github.com/josstei/maestro-gemini
cd maestro-gemini
gemini extensions link .
```

Restart Gemini CLI after installation for the extension to load.

### Quick Start

```
/maestro:orchestrate Build a REST API for a task management system with user authentication
```

Maestro will:
1. Engage you in a structured design dialogue
2. Present 2-3 architectural approaches with trade-offs
3. Generate a design document for your approval
4. Create a detailed implementation plan with agent assignments
5. Execute the plan phase by phase, delegating to specialized agents
6. Track all progress in session state files

## Commands

| Command | Purpose |
|---------|---------|
| [`/maestro:orchestrate`](#maestroorchestrate) | Full orchestration workflow (design → plan → execute → complete) |
| [`/maestro:execute`](#maestroexecute) | Execute an existing implementation plan |
| [`/maestro:resume`](#maestroresume) | Resume an interrupted session |
| [`/maestro:review`](#maestroreview) | Standalone code review |
| [`/maestro:debug`](#maestrodebug) | Standalone debugging session |
| [`/maestro:security-audit`](#maestrosecurity-audit) | Standalone security assessment |
| [`/maestro:perf-check`](#maestroperf-check) | Standalone performance analysis |
| [`/maestro:status`](#maestrostatus) | View current session status |
| [`/maestro:archive`](#maestroarchive) | Archive the active session |

### Orchestration

#### /maestro:orchestrate

Initiates the full Maestro orchestration workflow.

**Usage**: `/maestro:orchestrate <task description>`

**Behavior**:
1. Checks for existing active sessions in `<MAESTRO_STATE_DIR>/state/` (default: `.gemini/state/`)
2. If an active session exists, offers to resume or archive it
3. Begins the four-phase orchestration workflow:
   - Phase 1: Design Dialogue
   - Phase 2: Team Assembly & Planning
   - Phase 3: Execution
   - Phase 4: Completion & Archival

#### /maestro:execute

Executes an existing implementation plan, skipping design and planning phases.

**Usage**: `/maestro:execute <path-to-implementation-plan>`

**Behavior**:
1. Reads the specified implementation plan file
2. Creates a session state file for tracking
3. Presents an execution summary for user confirmation
4. Executes phases according to the plan with full progress tracking
5. Archives the session on completion

#### /maestro:resume

Resumes an interrupted orchestration session.

**Usage**: `/maestro:resume`

**Behavior**:
1. Reads active session state through `scripts/read-active-session.js` (default path: `.gemini/state/active-session.md`)
2. Parses session metadata and phase statuses
3. Presents a status summary with completed/pending/failed phases
4. If errors exist from the previous run, presents them and asks for guidance
5. Continues execution from the last active phase using the execution and delegation skills

### Standalone Tools

#### /maestro:review

Runs a standalone code review on staged changes, last commit, or specified paths.

**Usage**: `/maestro:review [file paths or glob patterns]`

**Behavior**:
1. Auto-detects review scope: user-specified paths > staged changes > last commit diff
2. Confirms detected scope with the user
3. Delegates to the code_reviewer agent
4. Presents findings classified by severity (Critical, Major, Minor, Suggestion)
5. Every finding references a specific file and line number

#### /maestro:debug

Focused debugging session to investigate and diagnose an issue.

**Usage**: `/maestro:debug <issue description>`

**Behavior**:
1. Delegates to the debugger agent with the issue description
2. Follows systematic methodology: reproduce, hypothesize, investigate, isolate, verify
3. Presents root cause analysis with evidence, execution trace, and recommended fix

#### /maestro:security-audit

Runs a security assessment on the specified scope.

**Usage**: `/maestro:security-audit <scope>`

**Behavior**:
1. Delegates to the security_engineer agent
2. Reviews for OWASP Top 10 vulnerabilities, traces data flow, audits authentication/authorization
3. Presents findings with CVSS-aligned severity, proof of concept, and remediation steps

#### /maestro:perf-check

Runs a performance analysis on the specified scope.

**Usage**: `/maestro:perf-check <scope>`

**Behavior**:
1. Delegates to the performance_engineer agent
2. Establishes baseline, profiles hotspots, analyzes bottlenecks
3. Presents optimization recommendations ranked by impact-to-effort ratio

### Session Management

#### /maestro:status

Displays the current orchestration session status.

**Usage**: `/maestro:status`

**Behavior**:
1. Reads the active session state via file injection
2. Presents phase-by-phase status, file manifest, token usage, and errors
3. Read-only — does not modify state or continue execution

#### /maestro:archive

Archives the current active orchestration session.

**Usage**: `/maestro:archive`

**Behavior**:
1. Checks for an active session
2. Presents a summary and asks for confirmation
3. Moves design document, implementation plan, and session state to archive directories
4. Verifies archival was successful

## Configuration

### Environment Variables

Maestro works out of the box with sensible defaults. To customize behavior, set any of these environment variables in your shell profile or project `.env` file:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MAESTRO_DEFAULT_MODEL` | _(inherit)_ | Model override for parallel-dispatched agents (sequential delegation inherits main session model) |
| `MAESTRO_WRITER_MODEL` | _(inherit)_ | Model override for technical_writer agent in parallel dispatch only |
| `MAESTRO_DEFAULT_TEMPERATURE` | _(inherit)_ | Temperature override for delegation prompts (agents define own defaults in frontmatter) |
| `MAESTRO_MAX_TURNS` | _(inherit)_ | Max turns override per agent (agents define own defaults in frontmatter) |
| `MAESTRO_AGENT_TIMEOUT` | `10` | Timeout in minutes per subagent |
| `MAESTRO_DISABLED_AGENTS` | _(none)_ | Comma-separated list of agents to exclude |
| `MAESTRO_MAX_RETRIES` | `2` | Retry attempts per phase before escalation |
| `MAESTRO_AUTO_ARCHIVE` | `true` | Archive sessions on completion |
| `MAESTRO_VALIDATION_STRICTNESS` | `normal` | `strict` / `normal` / `lenient` |
| `MAESTRO_STATE_DIR` | `.gemini` | Directory for session state and plans |
| `MAESTRO_MAX_CONCURRENT` | `0` (unlimited) | Max simultaneous agents in parallel dispatch |
| `MAESTRO_STAGGER_DELAY` | `5` | Seconds between parallel agent launches |
| `MAESTRO_GEMINI_EXTRA_ARGS` | _(none)_ | Extra Gemini CLI args forwarded to each parallel dispatch process (prefer `--policy`) |
| `MAESTRO_EXECUTION_MODE` | `ask` | Phase 3 dispatch: `parallel` / `sequential` / `ask` |

All settings are optional. The orchestrator uses the defaults shown above when a variable is not set.
Script-backed setting precedence is: exported env var -> workspace `.env` -> extension `.env` -> default.
You can configure extension-scoped settings interactively with `gemini extensions config maestro`.

### Model Configuration

| Role | Model | Purpose |
|------|-------|---------|
| Inherited | _(main session model)_ | All agents inherit the model from the main Gemini CLI session |
| Override | `MAESTRO_DEFAULT_MODEL` | Set to a specific model (e.g., `gemini-2.5-pro`) to override parallel-dispatched agents |

All agents omit the `model` field by default, inheriting the main session's model selection. Override via `MAESTRO_DEFAULT_MODEL` or `MAESTRO_WRITER_MODEL` environment variables. These overrides apply to parallel dispatch only — sequentially delegated subagents always inherit the main session model.

### Hooks

Maestro uses Gemini CLI's hooks system for lifecycle middleware. Tool permissions are enforced natively via agent frontmatter `tools:` declarations — hooks handle supplementary lifecycle concerns:

| Hook | Purpose |
|------|---------|
| SessionStart | Initialize hook state, prune stale sessions |
| BeforeAgent | Track active agent identity, inject session context |
| AfterAgent | Validate handoff report format, clear agent tracking |
| SessionEnd | Clean up hook state for ended session |

Hook handlers are in `hooks/` and registered via `hooks/hooks.json`.

## Architecture

### Orchestration Flow

```mermaid
graph TB
    User([User]) -->|/maestro:orchestrate| TL[TechLead Orchestrator]

    TL -->|Phase 1| DD[Design Dialogue]
    TL -->|Phase 2| IP[Implementation Planning]
    TL -->|Phase 3| EX[Execution]
    TL -->|Phase 4| CO[Completion]

    EX -->|Sequential| DA[Gemini CLI Delegation]
    EX -->|Parallel| PD[parallel-dispatch.js]

    DA --> Agents
    PD --> Agents

    subgraph Agents [Specialized Subagents]
        direction LR
        A1[architect]
        A2[coder]
        A3[tester]
        A4[debugger]
        A5[+ 8 more]
    end

    Agents -->|Results| TL
    TL -->|State| SS[(Session State)]
```

### Component Model

Maestro is built from seven layers, each with a distinct responsibility:

| Layer | Directory | Format | Purpose |
|-------|-----------|--------|---------|
| **Orchestrator** | `GEMINI.md` | Markdown | TechLead persona, phase transitions, delegation rules |
| **Commands** | `commands/` | TOML | CLI command definitions mapping user commands to prompts/skills |
| **Agents** | `agents/` | Markdown + YAML frontmatter | 12 subagent persona definitions with tool permissions and model config |
| **Skills** | `skills/` | Markdown (`SKILL.md` per directory) | Reusable methodology modules with embedded protocols |
| **Scripts** | `scripts/` | Node.js | Execution infrastructure (workspace setup, state management, parallel dispatch, version sync) |
| **Hooks** | `hooks/` | JSON + Node.js | Lifecycle middleware for active-agent tracking and handoff validation |
| **Templates** | `templates/` | Markdown | Structure templates for generated artifacts (designs, plans, sessions) |

### Workflow Phases

#### Phase 1: Design Dialogue

The TechLead engages you in a structured conversation to understand requirements:
- Asks one question at a time, preferring multiple-choice format
- Covers problem scope, constraints, technology preferences, quality requirements, and deployment context
- Presents 2-3 architectural approaches with pros, cons, and recommendations
- Builds the design document section by section, validating each with you

#### Phase 2: Team Assembly & Planning

After design approval, the TechLead:
- Analyzes the design for components, interfaces, and dependencies
- Assigns phases to specialized agents based on task domain
- Identifies parallel execution opportunities
- Generates a detailed implementation plan for your approval

#### Phase 3: Execution

With plan approval, the TechLead:
- Delegates work to subagents phase by phase
- Runs parallel phases concurrently when dependencies allow
- Updates session state after each phase completion
- Handles errors with up to 2 automatic retries before escalating

#### Phase 4: Completion

After all phases complete:
- Final `code_reviewer` quality gate — blocks completion on unresolved Critical/Major findings
- Session state marked as completed
- Plans and state files archived to `archive/` subdirectories
- Summary delivered with files changed, token usage, and next steps

## Agents

### Agent Roster

Maestro coordinates 12 specialized subagents:

All agents share a baseline tool set: `read_file`, `list_directory`, `glob`, `grep_search`, `read_many_files`, `ask_user`. The table below shows additional tools granted beyond that baseline.

| Agent | Specialization | Additional Tools | Model |
|-------|---------------|-----------------|-------|
| architect | System design, technology selection, component design | web search/fetch | inherit |
| api_designer | REST/GraphQL endpoint design, API contracts | web search/fetch | inherit |
| coder | Feature implementation, clean code, SOLID principles | write, replace, shell, todos, skills | inherit |
| code_reviewer | Code quality review, best practices, security | _(baseline only)_ | inherit |
| data_engineer | Schema design, query optimization, ETL pipelines | write, replace, shell, todos, web search | inherit |
| debugger | Root cause analysis, log analysis, execution tracing | shell, todos | inherit |
| devops_engineer | CI/CD pipelines, containerization, infrastructure | write, replace, shell, todos, web search/fetch | inherit |
| performance_engineer | Profiling, bottleneck identification, optimization | shell, todos, web search/fetch | inherit |
| refactor | Code modernization, technical debt, design patterns | write, replace, todos, skills | inherit |
| security_engineer | Vulnerability assessment, OWASP, threat modeling | shell, todos, web search/fetch | inherit |
| tester | Unit/integration/E2E tests, TDD, coverage analysis | write, replace, shell, todos, skills, web search | inherit |
| technical_writer | API docs, READMEs, architecture documentation | write, replace, todos, web search | inherit |

### Tool Access Philosophy

All agents can ask the user clarifying questions via `ask_user` (not available during parallel dispatch where agents run non-interactively).

- **Read-only agents** (architect, api_designer, code_reviewer): Produce analysis and recommendations
- **Read + Shell agents** (debugger, performance_engineer, security_engineer): Investigate without modifying files
- **Read + Write agents** (refactor, technical_writer): Modify code/docs without shell access
- **Full access agents** (coder, data_engineer, devops_engineer, tester): Complete implementation capabilities

## Skills

Maestro uses skills to encapsulate detailed methodologies that are activated on demand, keeping the base context lean.

| Skill | Purpose | Activated By |
|-------|---------|-------------|
| `design-dialogue` | Structured requirements gathering and architectural design convergence | `/maestro:orchestrate` (Phase 1) |
| `implementation-planning` | Phase decomposition, agent assignment, and plan generation | `/maestro:orchestrate` (Phase 2) |
| `execution` | Phase execution protocols, error handling, and completion workflows | `/maestro:orchestrate` (Phase 3), `/maestro:execute`, `/maestro:resume` |
| `delegation` | Subagent prompt construction, scope boundaries, and parallel delegation | Any phase involving subagent delegation |
| `session-management` | Session creation, state updates, resume protocol, and archival | `/maestro:orchestrate`, `/maestro:resume`, `/maestro:archive` |
| `code-review` | Scope detection, severity classification, and structured review output | `/maestro:review` |
| `validation` | Build/lint/test pipeline, project type detection, and result interpretation | Post-phase validation during execution |

## Parallel Execution

Maestro uses Node.js-based parallel dispatch, enabling independent implementation phases to run concurrently instead of sequentially.

### How It Works

The TechLead orchestrator uses `scripts/parallel-dispatch.js` to spawn concurrent Gemini CLI processes that execute independently. This bypasses the sequential subagent tool invocation pattern, which processes one delegation at a time.

**Dispatch flow:**
1. The orchestrator writes self-contained delegation prompts to a dispatch directory
2. Invokes `parallel-dispatch.js` via shell
3. The script spawns one `gemini --approval-mode=yolo --output-format json` process per prompt file, streaming prompt content over stdin
4. All agents execute concurrently as independent OS processes
5. Results are collected with exit codes, logs, and structured JSON output
6. The orchestrator reads results and updates session state

### When to Use Each Mode

| Use Parallel Dispatch | Use Sequential Delegation |
|---|---|
| Phases at the same dependency depth | Phases with shared file dependencies |
| Non-overlapping file ownership | Phases that may need interactive clarification |
| Fully self-contained prompts | Single-phase execution |
| Batch size of 2-4 agents | Fallback when parallel dispatch fails |

### Dispatch Directory Structure

```
<state_dir>/parallel/<batch-id>/
├── prompts/
│   ├── agent-a.txt          # Full delegation prompt
│   └── agent-b.txt
└── results/
    ├── agent-a.json          # Structured JSON output
    ├── agent-a.exit          # Exit code (0=success, 124=timeout)
    ├── agent-a.log           # stderr/debug output
    ├── agent-b.json
    ├── agent-b.exit
    ├── agent-b.log
    └── summary.json          # Batch summary with status per agent
```

### Constraints

Parallel agents run as independent CLI processes with no shared context. Each prompt must be complete and self-contained — agents cannot ask follow-up questions or access results from other agents in the same batch.

## Session State & Project Output

Maestro creates the following directories in your project:

```
<your-project>/
└── .gemini/
    ├── parallel/                       # Parallel dispatch batches
    ├── plans/                          # Active design docs and implementation plans
    │   ├── archive/                    # Completed plans
    │   ├── YYYY-MM-DD-<topic>-design.md
    │   └── YYYY-MM-DD-<topic>-impl-plan.md
    └── state/                          # Session tracking
        ├── archive/                    # Completed sessions
        └── active-session.md           # Current orchestration state
```

Maestro tracks orchestration progress in `<MAESTRO_STATE_DIR>/state/active-session.md` (default: `.gemini/state/active-session.md`) with:

- **Phase status tracking**: pending, in_progress, completed, failed, skipped
- **File manifest**: Files created, modified, and deleted per phase
- **Error tracking**: Per-phase error logs with retry counts and resolution records
- **Token usage**: Per-agent, per-phase token consumption metrics

All state files use YAML frontmatter for machine-readable metadata and Markdown body for human-readable logs.

## Documentation

- **[Usage Guide](USAGE.md)** — Comprehensive guide to installing, configuring, and using Maestro
- **[System Overview](docs/architecture/system-overview.md)** — Extension entry point, component model, and configuration system
- **[Agent System](docs/architecture/agent-system.md)** — Agent definitions, tool permissions, model assignment, and delegation
- **[Skills & Commands](docs/architecture/skills-and-commands.md)** — Skill activation, command definitions, and protocol contracts
- **[State Management & Scripts](docs/architecture/state-management-and-scripts.md)** — Session state, parallel dispatch, and execution infrastructure
- **[Comprehensive Map](docs/architecture/comprehensive-map.md)** — High-level architectural map connecting all components

## Troubleshooting

### Extension Not Loading

1. Verify the extension is linked: `gemini extensions list`
2. Restart Gemini CLI after installation or linking
3. Check `gemini-extension.json` exists in the maestro directory

### /maestro:orchestrate Not Responding

1. Ensure GEMINI.md is present in the maestro directory
2. Check that `commands/maestro/orchestrate.toml` exists
3. Restart Gemini CLI

### Session Resume Fails

1. Verify `active-session.md` exists under your configured state directory (`.gemini/state/` by default)
2. Check the YAML frontmatter is valid (no syntax errors)
3. If corrupted, manually fix the YAML or delete and start fresh with `/maestro:orchestrate`

### Subagent Errors

- Maestro automatically retries failed phases up to 2 times
- If retries are exhausted, you'll be asked for guidance
- Check the session state file for detailed error logs
- Common causes: file conflicts, missing dependencies, validation failures

### Parallel Dispatch Issues

**Agents timing out:**
- Check `MAESTRO_AGENT_TIMEOUT` setting (default: 10 minutes)
- Review agent logs in `<dispatch-dir>/results/<agent>.log`
- Reduce batch size to 2 agents if system resources are constrained

**Empty or missing results:**
- Verify prompt files are non-empty in `<dispatch-dir>/prompts/`
- Check that `gemini` CLI is on PATH and accessible
- Review `summary.json` for per-agent status and exit codes

**Parallel dispatch script not found:**
- Verify `scripts/parallel-dispatch.js` exists in the extension directory
- Ensure Node.js is available on PATH (provided by Gemini CLI)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test manually by linking the extension: `gemini extensions link .`
5. Verify commands work in Gemini CLI
6. Submit a pull request

Run the test suite with `node tests/run-all.js`. All other changes are validated manually via Gemini CLI.

## License

MIT
