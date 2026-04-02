# Changelog

All notable changes to Maestro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-04-01

### Added

- **Claude Code plugin** — Full dual-runtime support. Same 22 agents, 19 skills, 12 commands, lifecycle hooks, and MCP state management now available on Claude Code via the `claude/` subdirectory
- **Claude Code MCP auto-registration** (`claude/.mcp.json`) — MCP server discovered automatically when the plugin is loaded
- **MCP tool name mapping** — Orchestrator commands include mapping tables translating bare tool names (e.g., `initialize_workspace`) to Claude Code's prefixed names (`mcp__plugin_maestro_maestro__initialize_workspace`)
- **Agent name mapping** — Orchestrator commands include mapping for Claude Code's `maestro:` agent prefix (e.g., `maestro:coder`, `maestro:code-reviewer`)
- **Claude Code hook adapter** (`claude/scripts/hook-adapter.js`) — Normalizes Claude Code's PreToolUse/SessionStart/SessionEnd hook contract to Maestro's internal format
- **Policy enforcer** (`claude/scripts/policy-enforcer.js`) — Blocks destructive shell commands via Claude Code's PreToolUse hook on Bash tool calls
- **Library drift detection** (`scripts/check-claude-lib-drift.sh`) — CI script that validates shared `lib/` files haven't diverged between Gemini and Claude runtimes

### Changed

- **Express Flow state persistence** — Added step 5 (`transition_phase`) between coder delegation and code review to persist file manifests and downstream context before the review runs. Previously, state was only updated after the review.
- **Express Flow delegation enforcement** — Added HARD-GATE blocks preventing the orchestrator from editing code directly after code review findings. Fixes must be re-delegated to the implementing agent.
- **Express Flow brief presentation** — Split into two explicit sub-steps (2a: output brief as text, 2b: short approval prompt) with HARD-GATE preventing brief content from being stuffed into AskUserQuestion/ask_user
- **`create_session` field name** — Express Flow instructions now explicitly require `agent` (singular string) in phase objects, not `agents` (plural array which was silently ignored by the MCP server)
- **Delegation headers** — Added `Batch: single` to Express Flow delegation headers to match the delegation skill's required header set
- **Environment variable fallbacks** — `lib/config/setting-resolver.js` checks `CLAUDE_PLUGIN_ROOT` as fallback for `MAESTRO_EXTENSION_PATH`; `lib/core/project-root-resolver.js` checks `CLAUDE_PROJECT_DIR` as fallback for `MAESTRO_WORKSPACE_PATH`. Harmless no-op under Gemini CLI.

## [1.4.0] - 2026-03-19

### Added

- **10 new specialist agents** — `seo_specialist`, `copywriter`, `content_strategist`, `ux_designer`, `accessibility_specialist`, `product_manager`, `analytics_engineer`, `i18n_specialist`, `design_system_engineer`, `compliance_reviewer`; roster expanded from 12 to 22
- **MCP server** (`mcp/maestro-server.js`) — Bundled Model Context Protocol server registered via `mcpServers` in `gemini-extension.json` with 9 tools: `initialize_workspace`, `assess_task_complexity`, `validate_plan`, `create_session`, `get_session_status`, `update_session`, `transition_phase`, `archive_session`, `resolve_settings`
- **Express workflow** — Streamlined inline flow for `simple` tasks: 1-2 clarifying questions, combined design+plan structured brief, single-agent delegation, code review, and archival without skill activations or execution-mode gating
- **Task complexity classification** — Three-tier system (`simple`, `medium`, `complex`) gating workflow mode selection (Express vs Standard), design depth defaults, domain analysis breadth, question coverage, and phase count limits
- **8-domain analysis** — Pre-planning domain sweep across Engineering, Product, Design, Content, SEO, Compliance, Internationalization, and Analytics; scaled by task complexity to identify specialist involvement
- **Design depth gate** — Three-tier depth selector (`Quick`, `Standard`, `Deep`) in design-dialogue controlling reasoning richness: assumption surfacing, decision matrices, rationale annotations, and requirement traceability; orthogonal to task complexity
- **3 standalone commands** — `/maestro:a11y-audit` (WCAG compliance), `/maestro:compliance-check` (GDPR/CCPA/regulatory), `/maestro:seo-audit` (technical SEO assessment)
- **Policy engine rules** (`policies/maestro.toml`) — Extension-tier deny/ask guardrails: blocks `rm -rf`, `git reset --hard`, `git clean`, and heredoc shell writes; prompts on `tee` and shell redirection operators
- **Hook adapter layer** (`hooks/hook-adapter.js`) — Normalizes Gemini stdin JSON to internal context contract and formats responses for stdout, decoupling hook I/O from business logic
- **Runtime-agnostic hook logic** — Extracted core hook behavior into `lib/hooks/` modules (`before-agent-logic.js`, `after-agent-logic.js`, `session-start-logic.js`, `session-end-logic.js`) separate from I/O handling
- **`scripts/read-setting.js`** — CLI utility to resolve a single Maestro setting using script-accurate precedence
- **Architecture reference** (`references/architecture.md`) — Compact reference for agent roster, state contract, session lifecycle, execution modes, and delegation contract; read by commands at startup
- **`ARCHITECTURE.md`** and **`OVERVIEW.md`** — Top-level project documentation for architecture deep-dive and quick-start overview
- **Context budget guidance** — GEMINI.md section on minimizing skill activations, leveraging delegation for context relief, and preferring compact MCP responses over full state reads
- **`codebase_investigator` integration** — Design-dialogue and implementation-planning skills call the built-in investigator for repo grounding before proposing approaches or decomposing phases
- **Design document enrichments** — Decision matrix template (Standard/Deep), rationale annotations, per-decision alternatives (Deep), requirement traceability tags (Deep), `design_depth` and `task_complexity` frontmatter fields, numbered requirement IDs (`REQ-N`)
- **Session state fields** — `workflow_mode`, `execution_backend`, `current_batch`, and `task_complexity` added to session state template

### Changed

- **`src/lib/` flattened to `lib/`** — All shared modules relocated from `src/lib/` to `lib/`; scripts, hooks, and internal imports updated to new paths
- **Default state directory** — `MAESTRO_STATE_DIR` default changed from `.gemini` to `docs/maestro`; updated in `gemini-extension.json`, GEMINI.md, session-state module, and all command/skill references
- **Hook architecture** — Hooks (`before-agent.js`, `after-agent.js`, `session-start.js`, `session-end.js`) refactored from `defineHook`/`hook-facade` pattern to direct stdin/stdout with `hook-adapter.js` normalization and separated logic modules
- **Agent registry** — `KNOWN_AGENTS` array updated from 12 to 22 entries; `detectAgentFromPrompt` now checks agent header (`agent: <name>`) before env var and prompt pattern matching
- **Orchestrate command** — Expanded from 14-line protocol summary to full orchestrator template with hard gates, first-turn contract, required question order, design/plan approval gates, execution mode gate, delegation requirements, Express workflow routing, and recovery rules
- **Execute command** — Added inline Maestro Execute section with workspace initialization, execution-mode gate resolution, and parallel/sequential dispatch constraints
- **Resume command** — Added Express resume detection (`workflow_mode: "express"`), anti-delegation guards for token/status queries, and inline Maestro Resume section with constraint rules
- **Archive command** — Rewritten to use `get_session_status` and `archive_session` MCP tools instead of direct file manipulation
- **Status and resume commands** — Added anti-delegation guards preventing token/accounting questions from being routed to `cli_help` or research agents
- **All standalone audit commands** (`debug`, `perf-check`, `security-audit`, `review`) — Added delegation skill activation for protocol injection
- **Delegation skill** — Protocol injection paths updated to `${extensionPath}/skills/delegation/protocols/`; added missing context fallback and downstream consumer declaration patterns
- **Design-dialogue skill** — Added Standard-workflow-only gate, Express bypass, repository grounding protocol with `codebase_investigator`, depth gate with first-turn contract, and complexity-aware section/question scaling
- **Implementation-planning skill** — Added Standard-workflow-only gate, codebase grounding protocol, `task_complexity` propagation from design document to plan frontmatter
- **Session-management skill** — Added MCP-first state access protocol (preferred > fallback > legacy), Express workflow session creation, and `workflow_mode` awareness
- **Execution skill** — Added Standard-workflow-only scope note and Express bypass
- **GEMINI.md orchestrator context** — Expanded with workflow routing, complexity classification, Express workflow definition, domain analysis matrix, context budget section, MCP tool preference for state operations, `codebase_investigator` guidance, and 22-agent roster
- **Package identity** — Renamed from `gemini-maestro` to `@maestro-orchestrator/gemini-extension`; added `files` manifest for publishable assets
- **License** — Changed from MIT to Apache-2.0
- **`env-file-parser`** — Added multi-line quoted value support for values spanning multiple lines within double quotes
- **`session-state` module** — Added `resolveStateDirPath` helper; `ensureWorkspace` accepts absolute `stateDir` paths; removed `parallel` subdirectory from workspace scaffold
- **`atomic-write`** — Added monotonic counter to temp file names to prevent PID-only collisions
- **`project-root-resolver`** — Added `MAESTRO_WORKSPACE_PATH` env var check before git fallback
- **`hook-state`** — Added `MAESTRO_HOOKS_DIR` env var override for hook state base directory
- **`setting-resolver`** — Removed `os.homedir()` fallback for extension path; requires `MAESTRO_EXTENSION_PATH` env var when resolving extension `.env`
- **`refactor` agent** — Added `run_shell_command` to tool set
- **Implementation plan template** — Updated parallel dispatch note from `--approval-mode=yolo` reference to native subagent framing; added `task_complexity` frontmatter
- **`USAGE.md`** and **`README.md`** — Rewrites reflecting 22-agent roster, Express workflow, MCP tools, policy engine, and updated configuration

### Removed

- **`src/lib/` directory** — All modules relocated to `lib/`; removed `src/lib/config/dispatch-config-resolver.js`, `src/lib/core/integer-parser.js`, `src/lib/dispatch/concurrency-limiter.js`, `src/lib/dispatch/process-runner.js`, `src/lib/hooks/hook-facade.js`, `src/lib/hooks/hook-response.js`
- **`scripts/parallel-dispatch.js`** — Script-based parallel dispatch replaced by native subagent calls in v1.3.0; module fully removed
- **`scripts/sync-version.js`** — Version sync script between `package.json` and `gemini-extension.json`; replaced by `files` manifest in `package.json`
- **Entire test suite** — Removed `tests/` directory: 19 unit tests, 8 integration tests, test runner (`run-all.js`), and helpers; tests were coupled to removed `src/lib/` modules and dispatch infrastructure
- **CI workflow** — Removed `.github/workflows/ci.yml` (cross-platform test matrix on `ubuntu-latest` and `windows-latest`)
- **Architecture docs directory** — Removed `docs/architecture/` (5 files: `agent-system.md`, `comprehensive-map.md`, `skills-and-commands.md`, `state-management-and-scripts.md`, `system-overview.md`); replaced by `ARCHITECTURE.md`, `OVERVIEW.md`, and `references/architecture.md`

## [1.3.0] - 2026-03-07

### Added

- **Plan-based execution mode recommendation** — When `MAESTRO_EXECUTION_MODE=ask` (default), the orchestrator analyzes the implementation plan's dependency graph and presents a data-driven parallel vs sequential recommendation via `ask_user`
- **Execution mode gate enforcement** — `<HARD-GATE>` language in the execution skill ensures the mode prompt cannot be skipped; safety fallback stops delegation if `execution_mode` is missing from session state
- **Mandatory gate references across all entry points** — `orchestrate`, `execute`, and `resume` command prompts all enforce the execution mode gate before any delegation proceeds

### Changed

- **Native-only parallel execution** — Replaced script-based parallel dispatch (`parallel-dispatch.js`, `process-runner.js`, `concurrency-limiter.js`) with Gemini CLI's native subagent scheduler; parallel batches are now contiguous agent tool calls in a single turn
- **Simplified extension settings** — Removed script-dispatch-only settings (`MAESTRO_DEFAULT_MODEL`, `MAESTRO_WRITER_MODEL`, `MAESTRO_DEFAULT_TEMPERATURE`, `MAESTRO_MAX_TURNS`, `MAESTRO_AGENT_TIMEOUT`, `MAESTRO_STAGGER_DELAY`, `MAESTRO_GEMINI_EXTRA_ARGS`); native tuning uses agent frontmatter and Gemini CLI `agents.overrides`
- **`MAESTRO_MAX_CONCURRENT` redefined** — Now controls native parallel batch chunk size (how many subagent calls per turn) instead of subprocess concurrency limit
- **Execution skill rewrite** — Structured 5-step mode gate protocol with plan analysis, `ask_user` call format, and recommendation logic covering all parallelization percentages
- **GEMINI.md orchestrator context** — Updated Phase 3 description and Execution Mode Protocol section to reference the execution skill as the authoritative gate source

### Removed

- **Script-based dispatch backend** — Removed `scripts/parallel-dispatch.js`, `src/lib/dispatch/process-runner.js`, `src/lib/dispatch/concurrency-limiter.js`, `src/lib/config/dispatch-config-resolver.js`, and all associated tests
- **Dispatch-only extension settings** — Removed 7 settings from `gemini-extension.json` that only applied to the script dispatch backend

## [1.2.1] - 2026-02-19

### Added

- **Expanded test coverage** — Added 91 unit tests and migrated integration tests to Node.js to validate hooks, dispatch, state handling, config resolution, and timeout behavior
- **Cross-platform PR CI matrix** — Added GitHub Actions workflow (`.github/workflows/ci.yml`) running `node tests/run-all.js` on both `ubuntu-latest` and `windows-latest`

### Changed

- **Cross-platform runtime migration** — Replaced bash/Python hook and script execution paths with Node.js entry points for Windows PowerShell compatibility
- **Layered module architecture** — Reorganized shared runtime into focused modules under `src/lib/core`, `src/lib/config`, `src/lib/hooks`, `src/lib/state`, and `src/lib/dispatch`
- **Hook lifecycle and context output** — Registered SessionStart/SessionEnd hooks and standardized hook response context metadata (`hookEventName` + `additionalContext`) via shared hook helpers
- **Dispatch and settings behavior** — Moved operational logs to stderr, standardized env resolution/parsing, strengthened integer/path validation, and enforced canonical snake_case agent naming with hyphen alias normalization
- **Windows shell behavior** — Made shell mode opt-in to avoid `cmd.exe` argument mangling in Windows terminal flows
- **Documentation alignment** — Updated project documentation to align with current codebase behavior, naming conventions, and workflows

### Fixed

- **Windows stability fixes** — Resolved Windows-specific dispatch/session regressions and aligned integration harness behavior with `windows-latest` runner semantics
- **AfterAgent stale-state handling** — Cleared active-agent state on deny responses to prevent sticky handoff validation across unrelated turns
- **Process safety hardening** — Added PID guards, timeout validation, descriptor cleanup safeguards, and safer stale hook-state handling

### Removed

- **Legacy shell runtime paths** — Removed `.sh` hooks/scripts and bash/Python runtime dependencies in favor of Node.js equivalents

## [1.2.0] - 2026-02-19

### Added

- **Hooks-based lifecycle middleware** — BeforeAgent and AfterAgent hooks with shared shell library (`hooks/lib/common.sh`), `safe_main` wrapper for guaranteed JSON output, and advisory error handling
- **Agent tracking** — BeforeAgent/AfterAgent hooks track active agent identity via `/tmp/maestro-hooks/<session-id>/active-agent`; lazy state creation on first write, stale-pruned during BeforeAgent
- **Handoff report validation** — AfterAgent hook validates delegated agent output includes `Task Report` and `Downstream Context`; skips TechLead and non-delegation turns; requests one retry on malformed output
- **Active session gating** — `has_active_maestro_session` helper allows hooks to skip initialization when no Maestro session exists in the workspace
- **Final code review quality gate** — Phase 4 completion requires a `code_reviewer` pass on non-documentation file changes before archival; blocks on unresolved Critical/Major findings with remediation loop
- **14 extension settings** — All `MAESTRO_*` env vars declared in `gemini-extension.json`: `DEFAULT_MODEL`, `WRITER_MODEL`, `DEFAULT_TEMPERATURE`, `MAX_TURNS`, `AGENT_TIMEOUT`, `DISABLED_AGENTS`, `MAX_RETRIES`, `AUTO_ARCHIVE`, `VALIDATION_STRICTNESS`, `STATE_DIR`, `MAX_CONCURRENT`, `STAGGER_DELAY`, `GEMINI_EXTRA_ARGS`, `EXECUTION_MODE`
- **`MAESTRO_WRITER_MODEL`** (restored) — Per-agent model override for technical_writer in parallel dispatch
- **`MAESTRO_GEMINI_EXTRA_ARGS`** — Space-separated Gemini CLI flags forwarded to each parallel dispatch process
- **`MAESTRO_STATE_DIR`** (restored) — Configurable state directory with `extensionPath` resolution and env/workspace/extension/default precedence
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
- All 12 agents: `model` field omitted (inherits main session model), canonical `grep_search` tool name, unified Handoff Report output contract
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
- Agent roster corrections: `run_shell_command` removed from refactor, `get_internal_docs` removed from devops_engineer and technical_writer
- macOS timeout support in parallel dispatch

### Removed

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

- Extension settings with 13 configurable parameters via environment variables
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
