# Changelog

All notable changes to Maestro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-18

### Added

- **Hooks-based lifecycle middleware** — 5 hook handlers for SessionStart, BeforeToolSelection, BeforeTool, BeforeAgent, AfterAgent
- **Tool permission enforcement** — BeforeTool blocks unauthorized tool calls (primary gate); BeforeToolSelection suggests available tools (UX optimization)
- **Dynamic model routing** — All agents switched to `model: auto` for per-turn model selection
- **Agent tracking** — BeforeAgent/AfterAgent track active agent for permission enforcement in parallel dispatch
- **Handoff report validation** — AfterAgent validates agent output includes Task Report and Downstream Context
- **Permissions manifest** — `hooks/generate-permissions.sh` compiles agent frontmatter into permissions.json (stdlib only, no pyyaml)
- **Integration test suite** — `tests/run-all.sh` with tests for permissions, hooks, and tool enforcement
- **macOS timeout fallback** — Cancel-file-based watchdog with SIGTERM/SIGKILL for systems without GNU `timeout`

### Changed

- All agents: hardcoded models to `model: auto`
- All agents: `search_file_content` to `grep_search` (canonical tool name)
- All agents: unified Handoff Report output contract
- `parallel-dispatch.sh`: sets `MAESTRO_CURRENT_AGENT` per spawned process
- `GEMINI.md`: updated agent roster, settings, and hooks documentation
- `delegation` skill: documents hooks-based enforcement as primary, prompt-based as defense-in-depth

### Fixed

- Tool permission enforcement is now middleware-based (hooks) instead of prompt-only
- macOS timeout support in parallel dispatch
- README local development link command (`gemini extensions link .`)
- Inconsistent agent output contracts unified
- `validate-agent-permissions.sh` updated for grep_search

## [1.1.1] - 2026-02-15

### Fixed

- Removed extension settings prompts from install — Gemini CLI doesn't support default values, so users were forced through 13 prompts on install. All settings now use orchestrator defaults and are configurable via environment variables.

### Changed

- README configuration section renamed from "Extension Settings" to "Environment Variables" with all 13 parameters documented

## [1.1.0] - 2026-02-15

### Added

- Extension settings with 10 configurable parameters via environment variables
- Maestro branded dark theme with warm gold accents
- Shell-based parallel dispatch for concurrent subagent execution (`scripts/parallel-dispatch.sh`)
- Agent base protocol with pre-flight procedures and structured output formatting
- Settings references in delegation, execution, session-management, and validation skills
- TechLead orchestrator startup checks with settings resolution
- Filesystem safety protocol for delegated agents (`protocols/filesystem-safety-protocol.md`)
- Workspace bootstrap script for directory safety (`scripts/ensure-workspace.sh`)
- State file I/O scripts for atomic reads and writes (`scripts/read-state.sh`, `scripts/write-state.sh`)
- Agent name validation against `agents/` directory in parallel dispatch (`scripts/validate-agent-permissions.sh`)
- Concurrency cap (`max_concurrent`) and stagger delay (`stagger_delay_seconds`) settings for parallel dispatch
- Execution mode selection (`execution_mode`) in extension settings and session state template
- Workspace readiness startup check in orchestrator
- File-writing enforcement rules across agent base protocol, delegation prompts, and filesystem safety protocol
- Project root auto-injection into all parallel dispatch prompts
- Execution mode gate and state file access protocol in execution skill
- Execution profile requirement in implementation planning skill

### Fixed

- Hardened `parallel-dispatch.sh` against shell injection and edge cases
- Hardened scripts and commands against injection and path traversal attacks
- Stagger delay default changed from 0 to 5 seconds
- File writing rules enforced via `write_file` tool-only policy across all delegation prompts

### Changed

- Execution mode upgraded from sequential-only to PARALLEL (shell-based) as default strategy
- Delegation skill updated with agent name rules and absolute path safety net
- Filesystem safety protocol injected into all delegation prompts
- Session-management `mkdir` steps annotated as defense-in-depth fallbacks

## [1.0.0] - 2026-02-09

### Added

- TechLead orchestrator with 12 specialized subagents
- Guided design dialogue with structured requirements gathering
- Automated implementation planning with phase dependencies and parallelization
- Parallel execution of independent phases via subagent invocation
- Session persistence with YAML+Markdown state tracking
- Least-privilege security model per agent
- Standalone commands: `maestro.orchestrate`, `maestro.resume`, `maestro.execute`
- Standalone commands: `maestro.review`, `maestro.debug`, `maestro.security-audit`, `maestro.perf-check`
- Session management: `maestro.status`, `maestro.archive`
- Design document, implementation plan, and session state templates
- Skill modules: code-review, delegation, design-dialogue, execution, implementation-planning, session-management, validation
