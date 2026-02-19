# Changelog

All notable changes to Maestro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-19

### Added

- **Hooks-based lifecycle middleware** — BeforeAgent and AfterAgent hooks with shared shell library (`hooks/lib/common.sh`), `safe_main` wrapper for guaranteed JSON output, and advisory error handling
- **Agent tracking** — BeforeAgent/AfterAgent hooks track active agent identity via `/tmp/maestro-hooks/<session-id>/active-agent`; lazy state creation on first write, stale-pruned during BeforeAgent
- **Handoff report validation** — AfterAgent hook validates delegated agent output includes `Task Report` and `Downstream Context`; skips TechLead and non-delegation turns; requests one retry on malformed output
- **Active session gating** — `has_active_maestro_session` helper allows hooks to skip initialization when no Maestro session exists in the workspace
- **Final code review quality gate** — Phase 4 completion requires a `code-reviewer` pass on non-documentation file changes before archival; blocks on unresolved Critical/Major findings with remediation loop
- **14 extension settings** — All `MAESTRO_*` env vars declared in `gemini-extension.json`: `DEFAULT_MODEL`, `WRITER_MODEL`, `DEFAULT_TEMPERATURE`, `MAX_TURNS`, `AGENT_TIMEOUT`, `DISABLED_AGENTS`, `MAX_RETRIES`, `AUTO_ARCHIVE`, `VALIDATION_STRICTNESS`, `STATE_DIR`, `MAX_CONCURRENT`, `STAGGER_DELAY`, `GEMINI_EXTRA_ARGS`, `EXECUTION_MODE`
- **`MAESTRO_WRITER_MODEL`** — Per-agent model override for technical-writer in parallel dispatch
- **`MAESTRO_GEMINI_EXTRA_ARGS`** — Space-separated Gemini CLI flags forwarded to each parallel dispatch process
- **`MAESTRO_STATE_DIR`** — Configurable state directory with `extensionPath` resolution and env/workspace/extension/default precedence
- **`read-active-session.sh`** — Script to resolve the active session file path respecting `MAESTRO_STATE_DIR`
- **macOS timeout fallback** — Cancel-file-based watchdog with SIGTERM/SIGKILL for systems without GNU `timeout`
- **Shell helper library** (`hooks/lib/common.sh`) — `read_stdin`, `json_get`, `json_get_bool`, `respond_allow`, `respond_block`, `log_hook`, `validate_session_id`, `resolve_active_session_path`, `has_active_maestro_session`, `prune_stale_hook_state`
- **Built-in tools expanded** — `read_many_files`, `write_todos`, `ask_user`, and web tools added across agents
- **`activate_skill` guidance** — Agents and skills document how to activate skills with user consent behavior
- `enter_plan_mode`/`exit_plan_mode` for read-only Phase 1-2 with fallback when Plan Mode unavailable
- `save_memory` for cross-session knowledge persistence at Phase 4
- `{{args}}` parameter forwarding in status and resume commands
- **Integration test suite** — `tests/run-all.sh` covering all hooks, parallel dispatch (args forwarding, config fallback, exit-code propagation), and active-session resolution (8 test files)
- **`CLAUDE.md`** — Project-level contributor instructions

### Changed

- **Lazy hook lifecycle** — SessionStart and SessionEnd removed from `hooks.json` registration; hook state created lazily by BeforeAgent and stale-pruned inline (2-hour threshold)
- All 12 agents: switched to `model: auto` (inherits main session model), canonical `grep_search` tool name, unified Handoff Report output contract
- `parallel-dispatch.sh`: sets `MAESTRO_CURRENT_AGENT` per spawned process, forwards `MAESTRO_GEMINI_EXTRA_ARGS`, warns on deprecated `--allowed-tools` flag
- Commands moved from `commands/maestro.*.toml` to `commands/maestro/*.toml` (directory-based namespace)
- Protocols moved from `protocols/` to `skills/delegation/protocols/` (co-located with delegation skill)
- `delegation` skill: prompt-based enforcement documented as defense-in-depth (native frontmatter is primary gate)
- `code-review` skill: updated for orchestration quality gates (post-phase checks and final completion gate); includes current file contents when diff unavailable
- `execution` skill: documents hook lifecycle, adds final code review gate section, includes review status in completion summary
- `session-management` skill: documents lazy hook state lifecycle with BeforeAgent creation and stale pruning
- `design-dialogue` skill: adds Plan Mode handling
- `session-start.sh`: checks for active Maestro session before initializing state
- `session-end.sh`: simplified to minimal cleanup without logging
- Architecture docs rewritten for accuracy against Gemini CLI specification
- Deprecated `--yolo` and `-p` flags replaced with `--approval-mode=yolo` and positional args in dispatch
- Session state template: added `task` field, reconciled `execution_mode`

### Fixed

- Hook advisory behavior: `safe_main` wrapper guarantees JSON output on all code paths; errors emit `{}` instead of crashing
- Hook matchers removed (were too restrictive for SessionStart/SessionEnd)
- AfterAgent validates on retry without re-issuing denial
- `ask_user` parameter schema corrected in design-dialogue skill
- Plan Mode write paths corrected (`exit_plan_mode` path)
- Delegation paths corrected in skills to use `activate_skill` resources
- State template synced with runtime expectations
- `read_file` ignore enforcement and state access asymmetry clarified in skills
- Agent roster corrections: `run_shell_command` removed from refactor, `get_internal_docs` removed from devops-engineer and technical-writer
- macOS timeout support in parallel dispatch

### Removed

- **SessionStart/SessionEnd hook registrations** from `hooks.json` — functionality absorbed by BeforeAgent lazy init and inline pruning; scripts retained as standalone utilities
- `before-tool.sh`, `before-tool-selection.sh`, `after-tool.sh` hooks — native frontmatter `tools:` handles tool enforcement
- `BeforeModel` hook — Gemini CLI discards model field from hook output
- `permissions.json` and `generate-permissions.sh` — redundant with native frontmatter enforcement
- `validate-agent-permissions.sh` — validated against the removed permissions manifest
- `display_name` field from all agent frontmatter (undocumented by Gemini CLI)
- `excludeTools` patterns — non-functional; use Policy Engine instead
- `hookEventName` from hook output (not consumed by Gemini CLI)

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
