# Changelog

All notable changes to Maestro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Maestro cheatsheet**: added an English quick-reference guide covering supported runtimes, common commands, workflow concepts, and suggested reading order.

### Changed

- **npm package identity**: renamed the planned npm package to `@josstei/maestro`, added `hello@josstei.dev` to public author metadata, and moved the stable release publish path toward GitHub Actions trusted publishing.

### Fixed

- **Codex plugin MCP server fails to start**: corrected `npx` args in `plugins/maestro/.mcp.json` — added `-p`/`--package` flag so `maestro-mcp-server` is resolved as the binary name rather than an argument to the package's default binary.

## [1.6.3] - 2026-04-20

### Added

- **5 new MCP tools** (Session pack 5 → 10; total pack count 12 → 17):
  - `enter_design_gate`, `record_design_approval`, `get_design_gate_status` — server-side design-gate lifecycle; `create_session` now enforces approval before session creation
  - `scan_phase_changes`, `reconcile_phase` — post-hoc phase reconciliation when an agent's actual file manifest diverges from the plan
- **17 additional specialist agents** — Expanded the roster from 22 to 39 specialists:
  - **ML / AI**: `ml-engineer`, `mlops-engineer`, `prompt-engineer`
  - **Ops / reliability**: `site-reliability-engineer`, `observability-engineer`, `release-manager`
  - **Platform**: `cloud-architect`, `platform-engineer`, `solutions-architect`, `integration-engineer`
  - **Data / mobile**: `database-administrator`, `mobile-engineer`
  - **Mainframe / legacy**: `cobol-engineer`, `db2-dba`, `zos-sysprog`, `hlasm-assembler-specialist`, `ibm-i-specialist`
- **`maestro-mcp-server` bin** (`bin/maestro-mcp-server.js`) — Thin Node entrypoint declared in `package.json` bin; sets `MAESTRO_RUNTIME=codex` and `MAESTRO_EXTENSION_PATH`, then delegates to `src/mcp/maestro-server.js`. Invoked by Codex via `npx`.
- **Root-level Codex marketplace manifest** (`.agents/plugins/marketplace.json`) — Makes the repo a valid marketplace target for `codex marketplace add`.
- **Declarative `requiresWorkspace` tool contract** — Tool schemas carry `requiresWorkspace: true` when they depend on an initialized workspace; the registry captures the metadata and the dispatcher enforces it before handler invocation, returning a typed `WORKSPACE_NOT_INITIALIZED` error that names `initialize_workspace` in the recovery message.
- **Workspace marker file module** — `initialize_workspace` now writes a canonical marker and `requireExplicitWorkspaceRoot` rejects extension-cache paths.
- **Content variant for design-gate and implementation-plan submission** — `record_design_approval` accepts `design_document_content` + `design_document_filename`; `create_session` accepts `implementation_plan_content` + `implementation_plan_filename`. Bytes are materialized atomically into `<state_dir>/plans/` by the server. Motivation: Gemini Plan Mode resolves relative paths against `~/.gemini/tmp/<uuid>/`, so a path the model hands back to MCP never resolves to the same file the server sees — the content variant bypasses runtime-specific path resolution.
- **Shared plan-phase schema contract** (`src/mcp/contracts/plan-schema.js`) — Single source of truth for phase shape consumed by both `validate_plan` and `create_session`. `phase.files` is recognized as the planning-time canonical file manifest and is checked by `file_overlap` and `agent_capability_mismatch` validators.
- **`downstream-context` contract module** (`src/mcp/contracts/downstream-context.js`) — Canonical handoff shape: accepts string or array, handles `'none'`/`'n/a'`/empty-string sentinels, and embeds a human-readable shape description in the `HANDOFF_INCOMPLETE` error.
- **Runtime `delegation.constraints` object** — Per-runtime machine-readable constraints exposed via `get_runtime_context`. Codex declares deferred results and fork-incompatibility with `agent_type`/`model`/`reasoning_effort`; Claude, Gemini, and Qwen declare synchronous dispatch.
- **Blocker parser for child-agent question surfacing** — Agents emit a `Blockers:` section in their handoff report; the orchestrator surfaces unresolved blockers back to the user.
- **`workspace_suggestion` in `get_runtime_context`** — Server surfaces a recommended workspace path for runtimes that cannot auto-resolve one.
- **Per-entry `runtimeNames`** — Each entry-point registry entry owns its per-runtime rename declaratively; replaces the centralized `ENTRY_POINT_NAME_OVERRIDES` map.
- **Host-reserved command protection extended to Claude** — Entry-point generation now rejects names that would shadow Claude's built-in slash commands (`review`, `debug`, `resume`). Previously only Codex was guarded.
- **Adapter factory** (`src/platforms/shared/adapters/factory.js`) — Captures the adapter contract (`normalizeInput`, `formatOutput`, `errorFallback`, `readBoundedStdin`, `getExitCode`) with shared defaults. `claude`, `gemini`, and `qwen` adapters now declare only their protocol-specific extractors.
- **Adapter naming conventions module** — Shared conventions consumed by `hook-runner` for adapter discovery; replaces open-coded filename parsing.
- **`src/lib/yaml-emit.js`** — `emitBlockList` and `emitInlineQuotedList` helpers replace 4 hand-rolled YAML emission sites.
- **`src/lib/framework-detection.js`** — `SKIP_DIRS`, `CONFIG_FILES`, `FRAMEWORK_INDICATORS` extracted from `assess_task_complexity` so the handler owns only logic.
- **`src/generator/manifest-curator.js`** — `collectManifestPaths` relocated from `scripts/generate.js` shell wrapper into the generator module.
- **`session-state-core.js`** — `withSessionState` / `readActiveSession` transaction helpers; the three mutation handlers in `session-state-tools.js` route through the helper (418 → 378 lines).
- **Isolated integration tests** — Codex workspace resolution contract, `validate_plan → create_session` round-trip, handoff validation and reconciliation flow, design-gate Plan Mode lifecycle (late-write success path, phantom-path failure path, archival).

### Changed

- **Codex MCP server invocation** — `plugins/maestro/.mcp.json` now spawns the server via `npx -y github:josstei/maestro-orchestrate maestro-mcp-server`, matching the convention used by every curated Codex plugin. The previous relative-path spawn (`./mcp/maestro-server.js`) resolved against the user's workspace cwd rather than the plugin directory, causing MCP handshake failures in any workspace outside the repo checkout. The new invocation is location-independent.
- **Codex installation path** — Primary install is now `codex marketplace add josstei/maestro-orchestrate` (uses the new root `.agents/plugins/marketplace.json`). `scripts/install-codex-plugin.js` remains as a legacy/offline fallback.
- **`initialize_workspace` requires explicit `workspace_path`** — Handler calls `requireExplicitWorkspaceRoot`, writes a workspace marker, and returns `workspace_path` in the result. Schema declares `workspace_path` as required. Back-compat preserved via a `cachedProjectRoot` fallback for callers that pass the third MCP arg but not the explicit param.
- **`create_session` enforces design-gate approval** — Auto-populates `state.design_document` from the approved gate when the param is omitted, and resolves `implementation_plan` paths through the same copy-into-plans contract. Extends the design-gate from a single-step approval signal to the owner of the full design-doc lifecycle through archival.
- **`create_session` preserves phase ID types** — `phase.id` and `blocked_by` preserved verbatim, so plans with string IDs round-trip consistently. Tool schemas for `completed_phase_id`, `next_phase_id`, `next_phase_ids`, and the `scan_phase_changes` / `reconcile_phase` `phase_id` now accept number or string.
- **`transition_phase` rejects handoffs with files but empty `downstream_context`** — Returns `HANDOFF_INCOMPLETE` with the shape description embedded.
- **`archive_session` blocks on `requires_reconciliation`** and removes the `state/<session_id>.design-gate.json` sidecar on success (previously lingered; a future session reusing the same id inherited a stale "already approved" gate).
- **`validate_plan` enforces the shared phase schema** — `file-overlap` and `agent-capability` checkers inspect `phase.files` in addition to runtime `files_created` / `files_modified` manifests. Previously a plan using `phase.files` bypassed both guards, letting parallel phases declare conflicting ownership and letting read-only agents be assigned to write phases. Both error early-return paths now include `parallelization_profile: null`, matching the success-path response shape.
- **`reconcile_phase` rejects empty payloads** — Returns `RECONCILIATION_EMPTY_PAYLOAD` when no files and no populated `downstream_context` are supplied; overwrites file arrays only when the caller explicitly supplies them (previously silently cleared `requires_reconciliation` without recording attribution).
- **`resolve_settings` tolerates null project root** — Falls back to env + extension settings when no workspace is available, matching the documented startup-phase contract. Fixes the parallel-race crash where Gemini's concurrent startup calls produced a raw Node path error.
- **`maestro-server.js` decomposed** — 398-line monolith split into three single-purpose core modules and a 115-line composer: `core/line-reader.js` (readline stdin → JSON dispatch), `core/protocol-dispatcher.js` (JSON-RPC 2.0 routing, result builders), `core/project-root-cache.js` (workspace env + `roots/list` caching). Public exports preserved.
- **`validate-plan.js` decomposed** — 341-line handler split into four orthogonal checkers plus a 65-line orchestrator: `validation/schema-checker.js`, `validation/agent-checker.js`, `validation/dag-checker.js`, `validation/file-overlap-checker.js`. Violation ordering and error codes preserved.
- **`rebuild-frontmatter.js` rewritten as table-driven** — Per-field emitter map plus per-runtime ordered field lists. Claude's block-scalar description and color emission, Gemini's `tools`-before-`turns` layout, and the default (codex/qwen) shape are now data rather than conditionals. Generator output byte-identical.
- **Content provider simplified** — Inlined the filesystem branch of `content/provider.js`; every runtime uses `primary=filesystem` so the fallback-chain was dead code. Public exports (`CONTENT_SOURCES`, `createContentProvider`, `createFilesystemProvider`, `normalizeContentPolicy`) preserved.
- **Entry-point expansion unified** — `expandEntryPoints` and `expandCoreCommands` share `runTemplateExpansion` with per-runtime config maps.
- **Recovery hints table-driven** — `recovery-hints.js` cascade replaced by `RECOVERY_TABLE` lookup.
- **Manifest-expander refactored** — `normalizeSrcRelPath` (skills/shared flatten + snake_case agent rename) composed with `buildRuntimeOutputPath`; removes three open-coded `runtime.outputDir + outPath` sites and the `{ ...runtime, outputDir: './' }` glob-fallback hack.
- **Skill-discovery-stub consolidated onto the canonical `parse()` API** — `agent-stub.js` keeps `extractValue`/`splitAtBoundary` because those are the right primitives for its permissive unclosed-frontmatter behavior.
- **13 unused feature flags pruned** from each runtime-config's `features` block. Only `exampleBlocks`, `claudeStateContract`, `scriptBasedStateContract`, and `codexStateContract` remain — the others were mutual-exclusion triples with no readers in `src/` or tests.
- **Renamed:** `geminiStateContract` → `scriptBasedStateContract` (the flag gates the contract shared by Gemini and Qwen, which is a Gemini fork using the same `read-active-session.js` script); `createAdapter` → `defineAdapter` (matches `defineToolPack`/`defineRuntime` pattern; the factory is a spec-assembler, not a registry-dispatch builder).
- **Payload builder separated concerns** — Allowlist and adapter filtering are now distinct pipeline steps.
- **Orchestration flow restructured for Gemini Plan Mode** — Step 7 pre-loads architecture plus every pre-execution skill (`design-dialogue`, `design-document`, `implementation-planning`, `implementation-plan`) in a single batch before any Plan Mode entry. Gemini Plan Mode deregisters MCP tools, so previously `get_skill_content` calls at steps 11/13/15 returned "tool not found" and stranded the orchestrator. Steps 11/13/15 now reference the already-loaded skills. Step 13/14 split so `record_design_approval` is called AFTER `exit_plan_mode`. Step 9a HARD-GATE pins the chosen `session_id` across every MCP call that accepts `session_id` to prevent orphan-gate drift.
- **MCP client request timeout** — Bumped to 5000ms.
- **Documentation refreshed to canonical state** — Agent count 22 → 39, MCP tools 12 → 17, transforms 10 → 6, runtimes 3 → 4 applied across every hand-maintained surface. New `docs/runtime-qwen.md` mirrors the `runtime-gemini.md` structure. `src/references/architecture.md` agent roster lists all 39 agents with focus areas. `docs/usage.md` replaced the non-existent `just release <version>` target with `just check-layers` and `just cleanup-branches` which do exist.
- **Qwen Code runtime documentation** — Added to Runtime Targets and installation sections across README and docs.

### Fixed

- **`downstream_context` contract mismatch across three layers** — `agent-base-protocol` documented string examples (`'or none'`), session-state stored arrays, `transition_phase` accepted arrays only. Agents emitting the documented string form were rejected with a misleading "no downstream context" error. The canonical contract now normalizes both forms.
- **Latent error-hierarchy bug** — `ValidationError`, `StateError`, `NotFoundError`, and `ConfigError` hard-coded their code and silently dropped caller-supplied subtype codes. `HANDOFF_INCOMPLETE`, `DESIGN_GATE_UNAPPROVED`, `RECONCILIATION_PENDING` were all collapsing to the base code.
- **Design-gate race under Gemini Plan Mode** — `write_file` and `record_design_approval` fire in the same turn; the approval handler's existence check raced the write. File materialization deferred from `record_design_approval` to `create_session` so the file has settled by the time the server reads it.
- **Design-gate `session_id` drift** — `create_session` rejects with `DESIGN_GATE_SESSION_MISMATCH` when an approved orphan gate exists and the current session has no gate of its own (belt-and-suspenders with the step 9a HARD-GATE).
- **Skill loading inside Plan Mode** — Addressed by the step 7 pre-load (see Changed).
- **Dispatcher drain on close** — Pending outbound client-request timeouts are now rejected when the server closes, letting Node exit promptly even with `roots/list` requests in flight.
- **Swallowed dispatcher errors** — `protocol-dispatcher` bare catch on `getProjectRoot()` now logs any error whose code is not `WORKSPACE_NOT_INITIALIZED` instead of silently resolving to null.
- **Codex public skill naming collisions (carry-through)** — Codex plugin MCP manifest no longer declares a misleading `cwd` key.
- **CI changelog version-header matching** — `awk` now uses a prefix match.

### Removed

- **`plugins/maestro/mcp/maestro-server.js`** — No longer referenced; Codex invokes the server via `npx` rather than a local wrapper file.
- **Centralized `ENTRY_POINT_NAME_OVERRIDES` map** — Replaced by per-entry `runtimeNames`.
- **Top-level `delegationPattern` field** in runtime-configs — Duplicated `delegation.pattern`; the consumer's fallback branch was dead code. `get-runtime-context` simplified to `resolvedRuntimeConfig.delegation || { pattern: '', constraints: {} }`.
- **Gemini `workspacePath` env key** — Non-functional (Gemini has no CLI-injected workspace env var); replaced with explicit `workspacePath: null` to make the asymmetry with `CLAUDE_PROJECT_DIR` / `MAESTRO_WORKSPACE_PATH` visible in the config.
- **Dead module exports** — `ACTIVE_SESSION_REL` (`session-state-core`), `PHASE_LIMITS` (`schema-checker`), `CREATION_SIGNAL_PATTERNS` (`agent-checker`), and the `parseSessionState` / `serializeSessionState` back-compat re-exports from `session-state-tools.js`.

### Security

- **`protocol-dispatcher` error visibility** — Unexpected workspace-resolution errors now log instead of silently coercing to null, surfacing future failure modes.
- **`yaml-emit` caller-safe-scalar contract documented** — JSDoc names the precondition (no escaping in the emitter) for future callers.
- **`withSessionState` contract documented** — JSDoc names the requirement that callers return an outcome object; the `|| {}` coalesce is preserved to avoid crashing on a genuine read-only mutator, but the footgun is now named.
- **Filename validation for design-doc / plan content variants** — Rejects path separators, `.`, `..`, and null bytes.

### Known limitations

- **Local Codex plugin development iterates through GitHub.** `plugins/maestro/.mcp.json` always points `npx` at `github:josstei/maestro-orchestrate`, so running `codex marketplace add /path/to/maestro-orchestrate` still fetches the server from the default branch rather than the working tree. For iterating on server code, push the branch and test there, or invoke `bin/maestro-mcp-server.js` directly and point Codex at it with a hand-authored `.mcp.json`.
- **`qwen-extension.json` version drift.** `scripts/update-versions.js` does not include it in `JSON_VERSION_FILES`, so it drifts behind the other three manifests on each release. Bumped manually to 1.6.3 during this release; future releases must bump it manually or the script should be extended.

## [1.6.2] - 2026-04-15

### Added

- **Qwen Code runtime support** (#26) — Fourth runtime target with hook adapter, extension manifest (`qwen-extension.json`), context file (`QWEN.md`), 22 agent stubs, and `hooks.json` for `SubagentStart`/`SubagentStop` lifecycle events
- **`getExitCode(result)` adapter contract** (#42) — Each hook adapter now owns its exit code semantics; shared `exit-codes.js` constants (`EXIT_SUCCESS`, `EXIT_BLOCK`) verified against Gemini CLI, Claude Code, and Codex CLI source
- **npm publishing workflows** — Nightly (cron), preview (PR label), RC (release PR), and stable release pipelines with `NPM_TOKEN` gating
- **Community standards** — Code of Conduct (Contributor Covenant v2.1), Contributing Guide, Security Policy, issue/PR templates
- **CI/CD pipeline documentation** (`docs/cicd.md`) — Mermaid workflow diagrams, job breakdowns, release pipeline chain, and cross-references from existing docs
- **`lib/` foundation layer** — 6 shared modules (`errors`, `io`, `naming`, `frontmatter`, `validation`, `discovery`) extracted from duplicated implementations across the codebase
- **Exhaustive test coverage** — 121 tests across 22 files wired into CI; previously only transforms and integration tests ran in CI
- **Build-time auto-discovered registries** — `agent-registry.json`, `resource-registry.json`, `hook-registry.json` scanned at generate time, replacing hardcoded allowlists

### Changed

- **Thin multi-runtime entrypoints** — Replaced generated `canonical-source.js`, MCP entrypoint, hook-runner, and adapter copies with hand-authored wrappers that default `MAESTRO_RUNTIME` per runtime and use bounded repo-first / bundled-fallback resolution for detached Claude and Codex installs
- **Generator architecture** (`src/manifest.js`, `scripts/generate.js`) — Simplified the manifest to 2 discovery rules, reduced the generation-time transform registry from 10 entries to 4, and added an explicit detached-payload pack step for `claude/src/` and `plugins/maestro/src/`
- **Generator decomposed** — 807-line monolith split into focused modules: `file-writer`, `manifest-expander`, `stale-pruner`, `payload-builder`, `registry-scanner`, `entry-point-expander`
- **Codex plugin packaging** — Removed unused `plugins/maestro/agents/` stubs; Codex now relies on skills, MCP tools, and `get_agent` for methodology instead of plugin-level agent files
- **Centralized policy rules** — Claude policy-enforcer imports from canonical `src/core/policy-rules.js` with bundled fallback; deduplicated `readBoundedStdin` into `core/stdin-reader.js`
- **Lazy-loaded runtime configs** — Runtime configs loaded on demand with per-runtime detached payload filtering
- **Minimum Node.js version** — Raised to 20 (Node 18 EOL); `engines` field declared in `package.json`
- **Package renamed** — From `@maestro-orchestrator/gemini-extension` to `@maestro-orchestrator/maestro`
- **Runtime documentation** — Updated Gemini, Claude, and Codex runtime docs to describe thin entrypoints plus detached payloads rather than generated helper copies
- **Documentation aligned** — All docs updated to match post-consolidation codebase state

### Fixed

- **Codex public skill naming collisions** — Renamed the public Codex skills to `$maestro:review-code`, `$maestro:debug-workflow`, and `$maestro:resume-session` so installing Maestro does not shadow or break Codex's built-in `/review`, `/debug`, and `/resume` commands
- **LLM string-to-integer coercion** — Phase IDs sent as strings by LLMs in `transition_phase` now parsed correctly before phase lookups

## [1.6.1] - 2026-04-10

### Added

- **Self-contained Claude runtime payload** (`src/manifest.js`) — Added `'claude'` to the self-contained runtime payload manifest rule (already used by Codex) so the full `src/` tree is bundled into `claude/src/`; canonical-source resolution now succeeds from plugin caches outside the repo tree
- **`withIsolatedClaudePlugin` test helper** (`tests/integration/helpers.js`) — Copies the generated `claude/` directory into an isolated temp directory for testing plugin behavior outside the repo tree; mirrors the existing `withIsolatedCodexPlugin` helper
- **Isolated Claude bundle integration tests** — Hook entrypoint boot test, MCP server startup test, MCP tool listing and content serving tests, all running against an isolated plugin bundle

### Fixed

- **Claude plugin canonical-source resolution from plugin cache** — `requireFromCanonicalSrc(__dirname)` in hook scripts (`session-start.js`, `before-agent.js`, `session-end.js`) and MCP entry-point walked up from `~/.claude/plugins/cache/` looking for `src/mcp/maestro-server.js` but never found it because the Claude runtime did not bundle `src/`; resolved by the self-contained payload rule above

## [1.6.0] - 2026-04-09

### Added

- **Codex runtime target** (`plugins/maestro/`) — Complete third runtime for OpenAI Codex with plugin manifest, 22 agent stubs, 19 skills, MCP entry-point, and runtime guide; agents use kebab-case names and `spawn_agent(...)` delegation
- **Canonical source architecture** — Single `src/` tree serves all three runtimes (Gemini, Claude, Codex) via `requireFromCanonicalSrc()` dynamic resolution, eliminating verbatim lib copies and runtime-specific source directories
- **`get_agent` MCP tool** — Returns agent methodology content by name, enabling runtime access to agent definitions without filesystem reads
- **`get_runtime_context` MCP tool** — Returns runtime-specific configuration (delegation patterns, tool mappings, environment variables) for the active platform
- **Entry-point generation system** (`src/entry-points/`) — Registry of 9 entry-point commands with 3 per-runtime templates (Gemini TOML, Claude SKILL.md, Codex SKILL.md); entry-point commands are now generated rather than hand-maintained
- **4 new transforms** — `agent-stub` (generates lightweight stubs that load methodology via MCP), `inline-runtime` (injects runtime-specific content blocks), `skill-discovery-stub` (generates skill stubs that load content via MCP), `copy` (verbatim file copy)
- **`canonical-source.js` utility** (`src/core/`) — `requireFromCanonicalSrc()` resolves the canonical `src/` directory from any runtime entry-point by walking parent directories; deployed as thin shims in each runtime's `mcp/` and `scripts/` directories
- **`project-root-resolver.js` rewrite** (`src/core/`) — Multi-strategy workspace resolution supporting all three runtimes: env vars (`MAESTRO_WORKSPACE_PATH`, `CLAUDE_PROJECT_DIR`), git root detection, and cwd fallback
- **Justfile** — Development commands: `just test`, `just check`, `just test-transforms`, `just test-integration`; replaces ad-hoc npm scripts
- **Documentation suite** (`docs/`) — 7 focused docs replacing old plans/specs: `overview.md`, `architecture.md`, `flow.md`, `usage.md`, `runtime-gemini.md`, `runtime-claude.md`, `runtime-codex.md`
- **27 new test files** — MCP handler tests (content provider, runtime context, kernel, session pack, workspace pack, content pack, pack composition), transform tests (copy, index, project-root-resolver), integration tests (entry-point templates, hook entry-points, glob manifest, source of truth, MCP server bundle behavior, MCP server entry-point, MCP stdio client helper)
- **CI release workflow** (`.github/workflows/release.yml`) — Automated GitHub releases from version tags using `CHANGELOG.md` content

### Changed

- **MCP server decomposed** — Monolithic ~38k-line bundles (`mcp/maestro-server.js`, `claude/mcp/maestro-server.js`) replaced by ~14-line entry-points delegating to modular `src/mcp/` tree: 8 handlers, 3 tool-packs (workspace, session, content), core modules (server creation, tool registry, recovery hints), and utilities (extension root resolution)
- **Generator rewrite** (`scripts/generate.js`) — Updated to support manifest expansion with glob patterns, transform pipeline across three runtimes, entry-point rendering from templates, platform file mapping, and stale file pruning
- **`src/manifest.js` expanded** — Glob patterns, per-runtime platform file mappings, entry-point generation rules, and self-contained Codex `src/` payload rules
- **Codex skill names** — Dropped `maestro-` prefix from all skill names; skills use plugin namespace directly (`$maestro:orchestrate` instead of `$maestro:maestro-orchestrate`)
- **Shared skills restructured** — All 7 methodology skills (delegation, design-dialogue, execution, implementation-planning, session-management, code-review, validation) updated to load protocols and references via `get_skill_content` MCP tool instead of filesystem reads
- **Agent methodologies** — All 22 agents updated with explicit tool access declarations in frontmatter; Claude and Codex runtimes serve methodology content via MCP at runtime rather than inlining full definitions
- **Hook entry-points** — All 10 hook scripts (5 Gemini, 5 Claude) now use `requireFromCanonicalSrc()` to resolve logic modules from canonical source instead of runtime-local `lib/` copies
- **CI generator check** (`.github/workflows/generator-check.yml`) — Updated for three-runtime architecture with Codex output verification
- **Shared skill content** — Delegation protocols, design-dialogue, execution, implementation-planning, and session-management skills updated with runtime-agnostic path references and MCP-first content loading patterns
- **`GEMINI.md`** — Updated pointers to canonical source locations
- **62 documentation audit findings resolved** — Cross-referenced all docs against codebase; corrected stale paths, outdated counts, missing entries, and inaccurate descriptions across 12 files

### Removed

- **`lib/` directory** (root) — `lib/core/`, `lib/hooks/` modules relocated to `src/core/`, `src/hooks/logic/`; root-level `lib/` eliminated
- **`src/lib/` directory** — All 14 modules (`config/`, `core/`, `hooks/`, `mcp/`, `state/`) relocated to canonical `src/` locations; entire directory removed
- **`claude/lib/` directory** — Runtime-specific `core/` and `hooks/` copies removed; Claude runtime delegates to canonical source via `requireFromCanonicalSrc()`
- **`src/runtime-only/` directory** — 9 Claude skill stubs and 9 Gemini command stubs replaced by entry-point generation system
- **Monolithic MCP bundles** — `mcp/maestro-server.js` and `claude/mcp/maestro-server.js` reduced from ~38k lines each to ~14-line entry-points; bundled source replaced by modular `src/mcp/` tree
- **Library drift detection** (`scripts/check-claude-lib-drift.sh`) — Superseded by the runtime generator; canonical source architecture makes drift impossible
- **Root-level utility scripts** — `scripts/ensure-workspace.js`, `scripts/read-active-session.js`, `scripts/read-setting.js`, `scripts/read-state.js` relocated to `src/scripts/`
- **`references/` directory** (root) — `architecture.md` and `orchestration-steps.md` moved to `src/references/`
- **`templates/` directory** (root) — `design-document.md`, `implementation-plan.md`, `session-state.md` moved to `src/templates/`
- **`claude/scripts/write-state.js`** — Consolidated into `src/scripts/write-state.js`
- **`claude/skills/delegation/protocols/`** — Protocol files removed from runtime output; loaded via MCP `get_skill_content` from canonical source
- **Old planning docs** — `docs/plans/2026-04-04-runtime-generator.md` and `docs/specs/2026-04-04-runtime-generator-design.md` replaced by focused documentation suite

## [1.5.0] - 2026-04-01

### Added

- **`get_skill_content` MCP tool** — Reads delegation protocols, templates, and reference documents by identifier via MCP, bypassing workspace sandbox restrictions. Used by the orchestrate command to load non-skill resources (methodology skills are loaded via `activate_skill`).
- **`references/orchestration-steps.md`** — Shared numbered-step sequence (40 steps with inline HARD-GATEs) loaded by both Gemini CLI and Claude Code orchestrate commands as the sole procedural authority.
- **`AGENT_CAPABILITIES` tier map** in `lib/core/agent-registry.js` — Classifies all 22 agents into `read_only`, `read_shell`, `read_write`, or `full` capability tiers. Exports `getAgentCapability()` and `canCreateFiles()`.
- **`agent_capability_mismatch` validation rule** in `validate_plan` — Server-side enforcement that read-only agents cannot be assigned to file-creating phases. Emits error violations for explicit file lists, warnings for creation-signal phase names.
- **Claude Code plugin** — Full dual-runtime support. Same 22 agents, 7 methodology skills (plus 12 command entry-point wrappers), 12 commands, lifecycle hooks, and MCP state management now available on Claude Code via the `claude/` subdirectory
- **Claude Code MCP auto-registration** (`claude/.mcp.json`) — MCP server discovered automatically when the plugin is loaded
- **MCP tool name mapping** — Orchestrator commands include mapping tables translating bare tool names (e.g., `initialize_workspace`) to Claude Code's prefixed names (`mcp__plugin_maestro_maestro__initialize_workspace`)
- **Agent name mapping** — Orchestrator commands include mapping for Claude Code's `maestro:` agent prefix (e.g., `maestro:coder`, `maestro:code-reviewer`)
- **Claude Code hook adapter** (`claude/scripts/hook-adapter.js`) — Normalizes Claude Code's PreToolUse/SessionStart/SessionEnd hook contract to Maestro's internal format
- **Policy enforcer** (`claude/scripts/policy-enforcer.js`) — Blocks destructive shell commands via Claude Code's PreToolUse hook on Bash tool calls

### Changed

- **Orchestrate command restructured to numbered-step backbone** — `commands/maestro/orchestrate.toml` is now a thin runtime preamble (~28 lines) that loads `orchestration-steps.md`. The previous 347-line inlined protocol with prose instruction sections has been replaced. Same change applied to `claude/commands/orchestrate.md` (~773 lines → ~214 lines).
- **Design-dialogue protocol moved** from inlined in orchestrate command to on-demand loading via `activate_skill` (Gemini) or `Read` tool (Claude).
- **Template and reference loading deferred to consumption points** — `design-document`, `implementation-plan`, and `session-state` templates are no longer loaded at classification time; each is loaded at the step where it's consumed (steps 13, 15, 20).
- **`GEMINI.md` inline workflow content removed** — Express Workflow, Standard Workflow Phase 1-4, Task Complexity Classification, and Workflow Mode Selection sections replaced by pointer to `orchestration-steps.md`.
- **Express Flow state persistence** — Added step 5 (`transition_phase`) between coder delegation and code review to persist file manifests and downstream context before the review runs. Previously, state was only updated after the review.
- **Express Flow delegation enforcement** — Added HARD-GATE blocks preventing the orchestrator from editing code directly after code review findings. Fixes must be re-delegated to the implementing agent.
- **Express Flow brief presentation** — Split into two explicit sub-steps (2a: output brief as text, 2b: short approval prompt) with HARD-GATE preventing brief content from being stuffed into AskUserQuestion/ask_user
- **`create_session` field name** — Express Flow instructions now explicitly require `agent` (singular string) in phase objects, not `agents` (plural array which was silently ignored by the MCP server)
- **Delegation headers** — Added `Batch: single` to Express Flow delegation headers to match the delegation skill's required header set
- **Environment variable fallbacks** — `lib/config/setting-resolver.js` checks `CLAUDE_PLUGIN_ROOT` as fallback for `MAESTRO_EXTENSION_PATH`; `lib/core/project-root-resolver.js` checks `CLAUDE_PROJECT_DIR` as fallback for `MAESTRO_WORKSPACE_PATH`. Harmless no-op under Gemini CLI.

### Security

- **`validateContainment()` in `session-state.js`** — Absolute `state_dir` paths must resolve within the project root; rejects paths outside the cwd boundary. Applied to both `resolveStateDirPath` and `ensureWorkspace`.
- **`ensureBaseDir()` in `hook-state.js`** — Validates hook state base directory is not a symlink before creating session subdirectories. Temp directory naming changed from predictable `/tmp/maestro-hooks` to per-user `maestro-hooks-${uid}`.
- **Policy enforcer full-command parsing** — `splitCommands()` and `extractSubshells()` in `policy-enforcer.js` decompose commands on `;`, `&&`, `||`, `|`, and `$()` boundaries before checking deny rules against each segment. Prefix matching trims leading whitespace. Error handler changed from fail-open to fail-closed.
- **MCP error message path stripping** — Error handler in both MCP bundles replaces absolute filesystem paths with `[path]` before returning to the client. `get-skill-content.js` returns `err.code` instead of `err.message`.
- **`readBoundedStdin()` in hook adapters** — 1MB `MAX_STDIN_BYTES` limit applied to all hook entry scripts (7 scripts across both runtimes), `stdin-reader.js`, and `policy-enforcer.js`.
- **`ensureWorkspace` create-then-verify ordering** — Directory is created first, then verified via `lstatSync` that it is not a symlink, replacing the previous check-then-create ordering.
- **Explicit file permissions in `atomicWriteSync`** — Directories created with mode `0o700`, files with mode `0o600`. Same modes applied in `ensureWorkspace` and `ensureSessionDir`.
- **Session state `.gitignore`** — `docs/maestro/state/` added to project `.gitignore`. `ensureWorkspace` auto-creates a `.gitignore` inside the state directory excluding `active-session.md` and `archive/`.

### Fixed

- **Skill files now accessible in all modes** (normal, Plan Mode, auto-edit) via `get_skill_content` MCP tool — replaces broken `read_file` → `run_shell_command cat` fallback chain that failed due to workspace sandbox + Plan Mode policy restrictions.
- **Agent dispatch enforcement** — Delegation rules now require calling agents by registered tool name, preventing fallback to the built-in `generalist` tool which ignores agent frontmatter (methodology, temperature, tool restrictions, turn limits).
- **Express workflow `transition_phase` enforcement** — HARD-GATE ensures session state records all delivered files after agent execution.

## [1.4.0] - 2026-03-19

### Added

- **10 new specialist agents** — `seo_specialist`, `copywriter`, `content_strategist`, `ux_designer`, `accessibility_specialist`, `product_manager`, `analytics_engineer`, `i18n_specialist`, `design_system_engineer`, `compliance_reviewer`; roster expanded from 12 to 22
- **MCP server** (`mcp/maestro-server.js`) — Bundled Model Context Protocol server registered via `mcpServers` in `gemini-extension.json` with 9 tools at launch: `initialize_workspace`, `assess_task_complexity`, `validate_plan`, `create_session`, `get_session_status`, `update_session`, `transition_phase`, `archive_session`, `resolve_settings` (10th tool `get_skill_content` added in v1.5.0)
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
