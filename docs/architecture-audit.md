# Architectural audit and remediation — 2026-10-23

## Scope and compatibility contract

Started from freshly fetched `origin/main` at `285aede` (#102), preserving the existing work on `codex/refactor/architecture-refinement`. The initial seven refinements passed 1,033 tests on Node 20 and 24. The expanded implementation covers every actionable finding below; no architectural option remains deferred.

The review covers canonical source, generation, detached payloads, MCP contracts and dispatch, settings, state and document persistence, hooks, runtime adapters, release/install tooling, and architecture enforcement. Generated mirrors are build outputs rather than independent implementations.

Preserved interfaces include public launcher paths, MCP input schemas and successful response shapes, session-file formats, runtime-specific behavior, and existing CLI invocations. Approved additions are recoverable state errors, automatic roll-forward of committed operations, and optional content-hash checking for whole-file writes. Installed fallback instructions are corrected to match the files shipped. Internal consumers use their owning modules directly; obsolete helper/re-export layers are removed.

## Finding dispositions

| ID | Finding | Implemented remediation | Acceptance evidence |
|----|---------|-------------------------|---------------------|
| A01 | Nine handwritten public launchers | Generate all nine from `runtime-entrypoints.js`, retaining paths, bootstrap bodies, repository-first/bundled fallback, and executable bin mode | Generator recreation/mode/preview tests; isolated MCP and hook entrypoint tests |
| A02 | Repeated phase-field declarations | Derive schema properties, required fields, and validation from the ordered descriptor table in `plan-schema.js` | Schema and validation-order tests; baseline differential comparison |
| A03 | Gate persistence in MCP handlers | `state/design-gate.js` owns persistence and creation preconditions; handlers call the store within one transaction | Gate lifecycle, create/approve race, session contract tests |
| A04 | Split document-materialization ownership | `session-documents.js` owns materialization and archival; remove obsolete wrapper and handler re-exports | Document collision, duplicate-path, missing-document, staging-abort, and archive tests |
| A05 | Incomplete dependency boundaries and regex import discovery | One Acorn/Acorn Walk graph resolves CommonJS, ESM, literal dynamic imports, JSON and directory indexes, and explicitly classified runtime loads; enforce layers, containment, runtime/build separation, external dependencies, and cycles | Graph/checker fixtures, canonical graph check, stale annotation and aliased-loader rejection |
| A06 | Repeated release scratch-directory cleanup | Shared synchronous `scripts/lib/temp-dir.js` owns allocation and `finally` cleanup | Success/error cleanup tests; npm-pack and release-archive verifiers |
| A07 | Sorting to select the highest stable version | Linear scan with the existing comparator and last-occurrence tie behavior | Publishing-helper tests and differential version comparisons |
| A08 | Repeated settings-file reads | Per-request lazy resolver reads each reached `.env` once; scalar resolution stays fresh; diagnostic capture replays every logical warning consultation | Resolver/parser tests: read counts, lazy precedence, duplicate requests, missing/unreadable files, live environment, warning order/multiplicity, next-request freshness; 750 differential cases match baseline |
| A09 | Uncoordinated cross-process state updates and partial archives | Physical-path coordinator, token ownership lock, durable staged transactions, optimistic reads, journal replay, explicit recovery errors | Multiprocess MCP tests; ownership-race tests; killed-worker recovery matrix; conflict and filesystem-fault injection |
| A10 | Legacy whole-file writes overwrite concurrent changes | Preserve raw CLI form; add digest reads and optional managed-root compare-and-swap writes; prohibit private metadata access | CLI raw-output/argument compatibility, missing/stale digest, invalid config, alias containment, two-process guarded-write race |
| A11 | Installed state-script fallback is incomplete or points at the workspace | Ship all five scripts in every detached payload; Claude uses `${CLAUDE_PLUGIN_ROOT}/src/scripts`; Codex derives the absolute installed root from the loaded skill | Detached script execution, fallback-instruction checks, Codex local MCP and direct-file fallback coverage |
| A12 | Broad prefix payload copying retains unreachable implementation files | Deterministic graph closure plus explicit public/content roots; preserve paths/bytes; validate all plans before writes/pruning; sorted inclusion reasons and preview additions/removals | Payload closure, no-write preview, missing-target/containment, isolated install, repeated-generation tests |

All three detached payloads remove unused discovery and YAML-emission build helpers. Codex additionally removes policy rules, the hook registry, five hook-logic modules, and the shared hook runner/policy enforcer. It retains its stdin reader, all five state scripts, and local MCP server. No canonical runtime module was proven dead merely from lack of a literal importer; orphan reports require review.

## State protocol and failure contract

Path resolution is isolated in `src/state/paths.js`. The coordinator canonicalizes the state directory, acquires ownership once per logical mutation, and passes an explicit transaction to stores. MCP reads, workspace initialization, managed-state CLIs, and before-agent session reads participate. Ephemeral hook tracking remains separate.

Private metadata is created lazily beneath `<state_dir>/state/.maestro/` with private permissions. A complete candidate directory contains a random owner token, PID, hostname, and protocol version before its atomic rename acquires ownership. Contention polls asynchronously every 50 ms for at most five seconds; the before-agent reader allows 250 ms and warns while omitting context when unavailable. Only a definitively absent same-host PID is reclaimable. Release/reclaim removes the observed token file and then uses nonrecursive directory removal, protecting replacement owners.

Transactions validate in the existing order and stage bytes before changing public files. A versioned intent records operation/session identity, captured data and timestamps in staged bytes, saved result, ordered effects, and before/after fingerprints. Publishing the current pointer commits the operation. Replay durably checkpoints progress, accepts expected prior or already-applied state, advances a revision marker, removes the pointer, and cleans staging. It does not depend on external temporary document sources. Archive ordering remains completed session contents → session archive move → document moves → gate removal.

Ordinary reads do not create directories or require write access. They compare revision/pointer state around their snapshot and retry on overlapping commits. Reads finish pending committed work before serving state. A mutation that discovers interrupted work completes it and returns `STATE_RECOVERED` without applying another mutation. `STATE_BUSY`, `STATE_RECOVERY_REQUIRED`, and `STATE_CONFLICT` use the existing error envelope with recovery guidance; pending journals remain available when replay cannot safely continue.

Raw `read-state.js`/`write-state.js` invocations retain whole-file behavior. `read-state.js <path> --with-digest` returns content and SHA-256 from the same bytes. `write-state.js <path> --expected-sha256 <64 hex digits>` checks bytes under ownership and rejects stale/missing targets. Guarded writes are supported only in configured managed state. Generic paths remain usable outside managed state, and repository-authored read/modify/write instructions prefer MCP or the guarded form.

Existing workspaces require no session migration. Initialization appends `.maestro/` to state ignore rules while preserving user entries and its public response. Cooperating updated processes participate in the lock protocol; direct editor writes and older versions are detected only where fingerprints permit. Files and directory metadata are flushed where supported. The guarantee covers process crashes; power-loss durability remains bounded by the OS/filesystem. Do not downgrade while a committed transaction remains.

## Dependency direction and build boundaries

| Layer | Allowed source dependencies |
|-------|-----------------------------|
| `lib` | `lib` |
| `core` | `lib`, `core`, `generated` |
| `config` | `lib`, `core`, `config` |
| `state` | `lib`, `core`, `config`, `state` |
| `hooks` | `lib`, `core`, `config`, `state`, `hooks` |

The graph ignores import-looking comments, strings, and generated templates; it rejects missing targets, escapes, unsupported loaders, unknown/stale annotations, and production cycles. Runtime configurations, hook adapters, and registry-listed hook implementations are explicit finite computed loads. Public roots include CLI and registry-driven entrypoints, avoiding deletion based solely on static import counts. Symlink imports fail explicitly because flattened copies cannot preserve their resolution semantics.

Acorn and Acorn Walk are explicit major-version-8 development dependencies, locked in `package-lock.json`. All six generation/check workflows install dependencies with `npm ci`; copied-repository fixtures resolve root development dependencies explicitly. Detached runtimes have no parser packages or runtime `node_modules` requirement. Payload preflight validates dependency plans before copying, cleaning, or pruning; it does not bundle, minify, or prune exports.

## Retained compatibility surfaces

| Surface | Preservation decision | Focused coverage |
|---------|-----------------------|------------------|
| Public launcher paths and repository-first/bundled resolution | Keep generated wrappers at their existing paths | Generator, hook-entrypoint, MCP-bundle tests |
| Legacy YAML summaries, raw Markdown, existing state CLI invocations | Preserve readers/output; distinguish coordinator failure from absence | Hook logic, state scripts, Markdown-state tests |
| Runtime-specific adapters, config fields, command templates | Preserve differences in tools, delegation, hooks, and native plan mode | Platform adapter/config/metadata, transform and entrypoint tests |
| Independently authored artifact expectations | Keep independent manifests so generator mistakes cannot validate themselves | npm-pack and release-artifact tests/verifiers |
| Local tooling and cache exclusions | Retain packaging and workspace exclusions | Install/packaging and cache-path tests |
| Separate DAG passes and diagnostic order | Preserve existing validation passes | Plan schema and validate-plan tests |
| Fresh agent/resource reads between requests | Keep filesystem reads without a process-wide content cache | Runtime-content and MCP content tests |

## Verification record

### Three additional audits — 2026-10-25

Three independent reviews covered dependency analysis and internal boundaries, state/CLI compatibility and recovery, and generated outputs/release artifacts. All 15 confirmed findings have implementations and focused regression coverage:

| Audit | Findings and resolutions |
|-------|--------------------------|
| Dependency graph (4) | Reject indirect `require.main` loaders; reject package-main directory resolution with explicit-file guidance; reject executable imports with unsupported suffixes while retaining `require.resolve` data assets; classify discovery, YAML emission, and Qwen policy generation as build-only. |
| State and CLI (4) | Recover archives after relative symlink moves by validating their parent and directory entry; preserve staged symlink existence and missing-document/collision results; preserve unrelated raw CLI access when the configured root has a proven symlink cycle while refusing ambiguous failures; avoid losing the release callback to cleanup of an already-moved lock candidate. |
| Generation and artifacts (7) | Reject nested development/cache/scratch paths; reject archive symlinks; validate file destinations before any generation writes or pruning; surface failed diff commands; independently require all public launchers and hook/app files as regular files; validate Qwen launch arguments; require the advertised npm Codex installer. |

Acceptance: 1,191 tests pass on both Node 20 and 24 with no failures or skips. The graph checks 96 modules without violations; npm-pack verification passes for 778 files; the release archive verifies; repeated generation reports zero writes and 588 unchanged outputs.

These changes add no runtime dependencies, migration, compatibility modules, or production fault-injection switches. Normal public outputs remain identical to the preceding PR head: 68 tool schemas, four runtime contexts, 56 resource results, and 156 agent results. Archive symlink and invalid-output fixtures fail before creating an archive or modifying generated files; valid payload paths and bytes remain governed by the existing closure.

### Cleanup follow-up — 2026-10-25

Reviewed the completed implementation for transitional interfaces, unused exports, debugging residue, and development-only files in runtime distributions. Removed coordinator pass-through exports, the agent-catalog alias, test-only helper exports, unused gate arguments/transaction return metadata, the unused encoding overload, the empty-context wrapper, duplicate context normalization, the redundant graph traversal, and unused Map compatibility coercion. Physical path resolution now lives in `state/paths.js`; document materialization belongs entirely to the state store. Temporary Windows test diagnostics and stale handwritten-launcher documentation are gone.

The extension release archive excludes 19 build modules and eight templates that none of its runtime entrypoints load. Independent artifact checks reject their reintroduction; extracted-archive checks exercise every runtime and all five state scripts. npm retains its documented generation/build/prepack and installer sources. Public launchers, root documentation redirects, legacy YAML/CLI behavior, saved journal results, and recovery metadata remain intentional compatibility surfaces. No tracked temporary files, development caches, or production debug/fault-injection switches were found.

The follow-up passes 1,160 tests on both Node 20 and 24 with zero failures or skips. Comparing the prior PR commit to the cleanup finds all 68 schemas, four runtime contexts, 56 served resource results, and 156 agent results identical.

### Initial remediation acceptance

Reproducible acceptance commands: `npm ci`, `npm test`, `node scripts/check-layer-boundaries.js`, `npm run pack:verify`, `npm run release:artifacts`, `npm run release:verify-artifacts`, and repeated `node scripts/generate.js` with zero drift. Full-suite runs use Node 20 and 24. The `state-portability` CI matrix runs focused concurrency, recovery, CLI, and hook contracts on Linux, macOS, and Windows with both Node majors.

The recorded pre-expansion baseline has 68 tool schemas, four runtime contexts, 56 served resource results, and 156 agent definitions across four runtimes. Final comparisons allow only approved fallback/recovery instruction changes, additive CLI options/errors, and private metadata. No npm publication, live host installation, or merge is part of this remediation.

Local acceptance completed:

- 1,156 tests pass on both Node 20.20.2 and Node 24.19.0, with no failures or skips.
- All 68 schemas, four runtime contexts, and 156 agent definitions match the recorded baseline exactly. The 48 unaffected resource results match; the eight changed results are the architecture and session-management instructions across four runtimes.
- Thirteen generic CLI cases match baseline exit status, stdout, and stderr; 36 launcher selection/invocation combinations match. Successful MCP lifecycle results match after normalizing timestamps and workspace paths.
- Eighteen killed-worker transaction boundaries, separate-process MCP races, and guarded CLI write races pass. Recovery preserves captured timestamps and document bytes after the external source is removed.
- Every detached runtime executes all 17 tools, 14 resources, 39 agents, and five state scripts without runtime `node_modules`; hooked runtimes also exercise every registry hook and policy outcomes.
- The canonical graph checks 96 JavaScript files with zero violations. npm-pack verification passes for 778 files; the release archive verifies successfully.
- Repeated generation reports zero writes, 588 unchanged outputs, zero errors, and zero removals. Detached closures contain 129 Antigravity, 129 Claude, and 118 Codex files.
- [Cross-platform CI run 39912304064](https://github.com/josstei/maestro-orchestrate/actions/runs/39912304064) passes all six Linux/macOS/Windows × Node 20/24 state jobs and the full source-of-truth/package/archive job. Windows verification also corrected absolute-path identity comparisons for case/short-path aliases and made reconciliation assertions honor unchanged native path output.
