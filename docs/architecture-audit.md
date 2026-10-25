# Architectural audit and remediation — 2026-10-23

## Scope and compatibility contract

Started from freshly fetched `origin/main` at `285aede` (#102), preserving the existing work on `codex/refactor/architecture-refinement`. The initial seven refinements passed 1,033 tests on Node 20 and 24. The expanded implementation covers every actionable finding below; no architectural option remains deferred.

The review covers canonical source, generation, detached payloads, MCP contracts and dispatch, settings, state and document persistence, hooks, runtime adapters, release/install tooling, and architecture enforcement. Generated mirrors are build outputs rather than independent implementations.

Preserved interfaces include public launcher paths, MCP input schemas and successful response shapes, session-file formats, runtime-specific behavior, and existing CLI invocations. Approved additions are recoverable state errors, automatic roll-forward of committed operations, and optional content-hash checking for whole-file writes. Installed fallback instructions are corrected to match the files shipped. Internal consumers use their owning modules directly; obsolete helper/re-export layers are removed.

## Finding dispositions

| ID | Finding | Implemented remediation | Acceptance evidence |
|----|---------|-------------------------|---------------------|
| A01 | Nine handwritten public launchers | Generate all nine from `runtime-entrypoints.js`, retaining paths, bootstrap bodies, repository-first/bundled fallback, and executable bin mode | Generator recreation/mode/preview tests; repository-launcher MCP and hook entrypoint tests; detached-payload tests for the bundled fallback |
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

## State protocol and dependency boundaries

[State Coordination and Recovery](architecture.md#state-coordination-and-recovery) describes the coordination, transaction, and recovery protocol, and [state usage](usage.md#concurrent-updates-and-recovery) the digest-guarded CLI form. The [Generator Pipeline](architecture.md#generator-pipeline) describes the dependency graph, and [Content Serving and Path Resolution](architecture.md#content-serving-and-path-resolution) the layer rules it enforces.

## Retained compatibility surfaces

The retained surfaces and their coverage are in [Design decisions](architecture.md#design-decisions-retained-compatibility-surfaces).

## Verification record

### Current head

The dated sections below record each stage as it was measured; this table is the state of the final head.

| Measure | Value |
|---------|-------|
| Tests | 1,158 pass with no failures or skips; the CI state matrix runs 170 of them on Linux, macOS, and Windows with Node 20 and 24 |
| Dependency graph | 90 modules, zero violations |
| Generated outputs | 580, unchanged on repeated generation; detached closures hold 126 Antigravity, 126 Claude, and 116 Codex files |
| npm package | 730 files: runtime code plus the Codex installer and the modules it loads |
| Release archive | Excludes 17 build modules and 10 templates |
| MCP baseline | 68 tool schemas, four runtime contexts, 56 resource results, and 156 agent results; three resource results changed by approval (Further reduction) |

### Further reduction — 2026-10-25

A second review covered seven areas (runtime platform layer, runtime content, generator and release tooling, state, MCP, docs, and tests); every finding was adversarially verified before implementation, and each change landed as its own commit.

- **Shared runtime structure.** Runtime differences are runtime-config data: `launchers` drive all nine generated public launchers and the detached payload roots, `entrySurface`, `entryAgentRefs`, `skillStubFrontmatter`, and `servedSkillFrontmatter` drive entry-point, stub, and served-skill rendering, and generator stages take runtime configs. No generator or `src/mcp` code branches on a runtime name. The two per-runtime policy enforcers are gone: each hook adapter exports `shellPolicy`, and the shared enforcer's `main(runtime)` runs it.
- **Reduction.** `src/mcp/utils/extension-root.js`, `src/lib/framework-detection.js`, `src/entry-points/preamble-builders.js`, `writeIfChanged`, the lenient feature-block mode, and 78 `@feature exampleBlocks` marker lines are gone. One `defineTool` helper builds all 17 MCP tools. The generator classifies each output once, and `generate.js --check` replaces eight copied drift checks in CI, the pre-push hook, and `just check`. State stores take the read view or transaction first, and the state lock, journal, and transaction share their busy, recovery, private-JSON, and directory helpers.
- **Approved behavior fixes.** Qwen's `workspace_suggestion` reads `MAESTRO_WORKSPACE_PATH`; Qwen's served implementation-planning skill names snake_case agents; Claude's served state contract and the Codex fallback resolve `<state_dir>` instead of a fixed `docs/maestro`; Claude entry skills load their declared skills and Claude and Codex entry skills carry the request guard (and Codex its constraints); a dangling `STATE_DIR` symlink is rejected with the documented error; lazily created state directories are private. The changed MCP results are Qwen implementation-planning, Claude architecture, and Codex architecture.
- **Packaging.** npm ships only runtime code and the Codex installer closure; `pack:verify` allowlists `scripts/` and rejects the build-only trees. The unused `claude/mcp-config.example.json` is removed.
- **Tests and docs.** Shared process, MCP-client, hermetic-environment, session, and state-fault helpers replace per-file copies; overlapping session, installed-bundle, and artifact-invariant tests each have one owner, with every removed test mapped to its surviving coverage. Runtime Definitions is the one per-runtime fact table, CONTRIBUTING owns the command table, and CI documentation has one shared core.

The 36 commits before this record remove a net 1,476 lines, including 392 doc lines, 387 test lines, 533 payload-mirror lines, and 84 CI, hook, and justfile lines. Handwritten `src/` and `scripts/` JavaScript stays about level (9,967 to 9,964): the removed modules and boilerplate offset the new runtime-config tables, `--check` mode, and focused guards. Each zero-drift commit was checked against a differential harness covering the repository and payload servers for every runtime (tool schemas, runtime context, all resources and agents, and a full session lifecycle), plus npm and archive file lists.

### Handwritten code reduction (a1ac1de, d9ff0e7) — 2026-10-25

Replaced the two-rule manifest and transform dispatcher with direct agent/shared-skill stub collection, removing three internal modules and their obsolete API tests. Discovery now returns matching paths without identity/metadata callbacks or unnecessary resource-content reads. Entry-point paths use runtime configuration; agent frontmatter keeps its ordered configuration with direct field values instead of a separate callback context.

Session tools share their common schema fields, and plan validation has two explicit schema stages while retaining the separate DAG passes and diagnostic order. Orphan-gate validation collects only the session IDs it needs. Claude agent tools derive from canonical lists and one runtime policy: 34 redundant overrides are removed, with five intentional exceptions retained.

These changes remove 428 handwritten JavaScript lines under `src/` and `scripts/` (10,395 → 9,967), excluding generated mirrors and tests. Four test files separately shrink by 180 lines while preserving all 131 named scenarios and independent expectations. Documentation catalogs with editorial differences, runtime adapters/configuration fields, and independent artifact expectations remain explicit.

Differential checks preserve all 68 ordered schemas, four runtime contexts, 56 served resource results, 156 served agent results, 117 agent stubs, and 3,010 plan-validation outcomes/errors. New direct-collector tests cover stub paths/order, disappearing sources, renderer failures, registry collision precedence, and file-read counts; existing generation preflight and preview tests remain.

Acceptance: all 1,160 current tests pass on Node 20 and 24, without failures or skips. The lower test count reflects the deleted internal manifest API. A deterministic contention regression also verifies acquisition when the previous owner disappears between a failed rename and inspection; only acquisition is retried within the existing deadline. Isolating the generator changes against `f023f61` preserves all 588 generated paths, bytes, modes, and output ordering. The graph checks 94 modules; npm-pack verifies 776 files; release-archive verification and zero-drift generation pass.

### Three additional audits (f023f61) — 2026-10-25

Three independent reviews covered dependency analysis and internal boundaries, state/CLI compatibility and recovery, and generated outputs/release artifacts. All 15 confirmed findings have implementations and focused regression coverage:

| Audit | Findings and resolutions |
|-------|--------------------------|
| Dependency graph (4) | Reject indirect `require.main` loaders; reject package-main directory resolution with explicit-file guidance; reject executable imports with unsupported suffixes while retaining `require.resolve` data assets; classify discovery, YAML emission, and Qwen policy generation as build-only. |
| State and CLI (4) | Recover archives after relative symlink moves by validating their parent and directory entry; preserve staged symlink existence and missing-document/collision results; preserve unrelated raw CLI access when the configured root has a proven symlink cycle while refusing ambiguous failures; avoid losing the release callback to cleanup of an already-moved lock candidate. |
| Generation and artifacts (7) | Reject nested development/cache/scratch paths; reject archive symlinks; validate file destinations before any generation writes or pruning; surface failed diff commands; independently require all public launchers and hook/app files as regular files; validate Qwen launch arguments; require the advertised npm Codex installer. |

Acceptance: 1,191 tests pass on both Node 20 and 24 with no failures or skips. The graph checks 96 modules without violations; npm-pack verification passes for 778 files; the release archive verifies; repeated generation reports zero writes and 588 unchanged outputs.

These changes add no runtime dependencies, migration, compatibility modules, or production fault-injection switches. Normal public outputs remain identical to the preceding PR head: 68 tool schemas, four runtime contexts, 56 resource results, and 156 agent results. Archive symlink and invalid-output fixtures fail before creating an archive or modifying generated files; valid payload paths and bytes remain governed by the existing closure.

### Cleanup follow-up (a4820c4) — 2026-10-25

Reviewed the completed implementation for transitional interfaces, unused exports, debugging residue, and development-only files in runtime distributions. Removed coordinator pass-through exports, the agent-catalog alias, test-only helper exports, unused gate arguments/transaction return metadata, the unused encoding overload, the empty-context wrapper, duplicate context normalization, the redundant graph traversal, and unused Map compatibility coercion. Physical path resolution now lives in `state/paths.js`; document materialization belongs entirely to the state store. Temporary Windows test diagnostics and stale handwritten-launcher documentation are gone.

The extension release archive excludes 19 build modules and eight templates that none of its runtime entrypoints load. Independent artifact checks reject their reintroduction; extracted-archive checks exercise every runtime and all five state scripts. npm then retained its generation/build/prepack and installer sources; Further reduction narrowed it to runtime code and the installer. Public launchers, root documentation redirects, legacy YAML/CLI behavior, saved journal results, and recovery metadata remain intentional compatibility surfaces. No tracked temporary files, development caches, or production debug/fault-injection switches were found.

The follow-up passes 1,160 tests on both Node 20 and 24 with zero failures or skips. Comparing the prior PR commit to the cleanup finds all 68 schemas, four runtime contexts, 56 served resource results, and 156 agent results identical.

### Initial remediation acceptance (06abca7, b105142, 0305bea)

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
