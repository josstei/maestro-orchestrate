# Breaking Reduction Prototypes

Date: 2026-07-09

## Purpose

This document is the Phase 8 decision gate for extreme follow-up reductions.
It does not approve code execution. It defines four prototypes that are risky
enough to require separate implementation approval before they modify runtime
behavior, public MCP contracts, package names, or state storage.

## Current Evidence

Observed in this checkout after Phase 7:

| Signal | Observed value |
| --- | ---: |
| Public MCP tools | 40 |
| Workspace tools | 4 |
| Session tools | 12 |
| Content tools | 3 |
| Memory tools | 15 |
| History tools | 6 |
| Generated host-facing runtime files | 190 |
| Generated host-facing runtime bytes | 201,265 |
| `dist/src` local size | 1.8 MB |
| `docs/maestro` local state | 90 files, 29,839 lines, 1.4 MB |
| `.superpowers` local state | 3.0 MB |
| `docs/superpowers` local state | 1.5 MB |
| `node_modules/@modelcontextprotocol` local install size | 5.8 MB |
| Phase 7 npm package | 334 files, 299,140 packed bytes, 794,119 unpacked bytes |

## Decision Summary

| Prototype | Decision | Reason |
| --- | --- | --- |
| MCP action registry | Prototype next, do not execute yet | High public-surface simplification, but model/tool-selection quality must be dogfooded before deleting 40 named tools. |
| Runtime portfolio split | Defer until descriptor docs are generated | Per-consumer package size can improve, but package/release complexity will grow unless runtime descriptors own docs, manifests, and package projections. |
| Structured state backend | Prototype event log first, not SQLite first | Current state layout is fragmented and local state is large; an append-only event log can be dependency-free and reversible. |
| MCP SDK adapter/replacement | Isolate adapter only, do not replace SDK yet | SDK replacement has extreme compatibility risk; adapter isolation gives option value without protocol reimplementation. |

## Prototype A: MCP Action Registry

### Proposed Shape

Collapse 40 public tools into five typed action tools:

| Action tool | Owns current packs |
| --- | --- |
| `maestro_workspace` | initialize, settings, complexity, plan validation |
| `maestro_session` | session lifecycle, phase transition, design gate, reconciliation |
| `maestro_content` | skills, agents, runtime context |
| `maestro_memory` | project profile, ratings, recall, knowledge, memory import/export |
| `maestro_history` | lineage, checkpoints, blueprints, archive search, cost insights |

Each action tool would take `{ action, payload }`, where `action` is a generated
literal union and `payload` is validated by the existing command-table schemas.
The old tool names should be deleted only if the product decision is explicitly
"breaking with no compatibility shims."

### Migration Plan

1. Generate an action catalog from the existing command tables.
2. Add a read-only parity runner that invokes every current tool and its action
   equivalent with the same fixture inputs.
3. Dogfood action tools in one Maestro workflow while keeping existing tools.
4. Measure model selection quality and error rate versus current named tools.
5. If approved as breaking, delete old public registrations and generated docs
   for the 40 individual names.

### Parity Matrix

| Current pack | Required parity |
| --- | --- |
| Workspace | same success/error shape, same workspace cache side effects |
| Session | same file mutations, checkpoints, transitions, design gate behavior |
| Content | same runtime transforms, unknown id errors, agent tool-name mapping |
| Memory | same JSON/JSONL writes, same no-secret assumptions, same merge behavior |
| History | same archive/lineage/checkpoint/blueprint outputs |

### Validation Plan

- one generated parity test per current tool
- one full orchestration smoke using only action tools
- runtime docs rewrite review
- model-selection dogfood review comparing current and action-only traces
- packed MCP startup across Gemini, Claude, Codex, and Qwen

### Estimated Impact

Observed impact would be public-surface reduction from 40 tool names to 5. Source
line deletion is inferred as moderate because handlers remain, while registration
docs, schemas, and guide prose shrink. Package byte reduction is inferred low.

## Prototype B: Runtime Portfolio Split

### Proposed Shape

Split the single package into a core package plus runtime packages:

| Package | Carries |
| --- | --- |
| `@josstei/maestro-core` | MCP server, shared runtime content, shared contracts |
| `@josstei/maestro-gemini` | Gemini extension metadata, root Gemini command/runtime surfaces |
| `@josstei/maestro-claude` | Claude plugin metadata and `claude/` runtime |
| `@josstei/maestro-codex` | Codex plugin metadata and `plugins/maestro/` runtime |
| `@josstei/maestro-qwen` | Qwen metadata and `qwen/` runtime |

### Migration Plan

1. Generate package manifests from `src/platforms/runtime-declarations.ts`.
2. Generate runtime docs from descriptors before splitting package docs.
3. Add per-runtime `npm pack --dry-run --json` tasks with independent budgets.
4. Add per-runtime install/startup tests.
5. Publish split packages only after marketplace metadata can target the new
   package names without hand edits.
6. Remove bundled all-runtime package surfaces only after consumers have a
   documented migration path.

### Parity Matrix

| Runtime | Required parity |
| --- | --- |
| Gemini | same extension manifest, command files, MCP startup, runtime content |
| Claude | same plugin manifest, `.mcp.json`, hooks, skills, MCP startup |
| Codex | same plugin install flow, `.mcp.json`, skills, references, MCP startup |
| Qwen | same context file, hook events, generated agents, MCP startup |

### Validation Plan

- per-runtime package dry run with bucket report
- per-runtime install/startup test
- marketplace metadata validation for each package
- release workflow dry run with version skew checks
- migration guide review

### Estimated Impact

Per-consumer package reduction is inferred as medium to high because one runtime
would stop receiving the other runtime roots. Source size may increase unless the
current all-runtime package is deleted after migration. Release complexity is
observed to increase because there would be five manifests and five package
budgets instead of one.

## Prototype C: Structured State Backend Or Event Log

### Proposed Shape

Introduce a dependency-free append-only event log behind the session and memory
repositories before considering SQLite. The first storage target should be a
single JSONL event stream plus materialized views for current session reads.

### Migration Plan

1. Define event types for session creation, design approval, phase transition,
   checkpoints, ratings, memory writes, archive, and knowledge notes.
2. Add repository adapters that can read current Markdown/JSON/JSONL state and
   emit equivalent events.
3. Add export back to the current file layout for audit and rollback.
4. Run dual-write in tests only.
5. If approved, migrate active workspace state with a dry-run diff and explicit
   backup.

### Parity Matrix

| Current state family | Required parity |
| --- | --- |
| Active session Markdown | same status, phase state, task report, downstream context |
| Plans/design docs | same archive movement and path resolution |
| Checkpoints | same restore semantics and future-phase reset |
| Project profile | same learned command merge behavior |
| Ratings/performance/plan accuracy | same aggregate outputs |
| Knowledge and memory notes | same append/query behavior |

### Validation Plan

- import/export round trips against real fixture state
- corruption recovery tests
- recall/search/cost-insight parity tests
- active-session backup and dry-run migration report
- no native dependency check unless SQLite is separately approved

### Estimated Impact

Local state reduction is inferred high because current ignored state is larger
than the tracked source by byte count in this checkout. Source size is likely to
increase in the first slice because adapters and migration tests are required.
The payoff is architectural: transactions, retention, and queries become owned
by repositories instead of spread across handlers and file conventions.

## Prototype D: MCP SDK Adapter Or Replacement

### Proposed Shape

First isolate `@modelcontextprotocol/sdk` behind a narrow first-party adapter.
Do not replace the SDK until adapter parity proves the boundary.

### Migration Plan

1. Define a `MaestroMcpTransport`/`MaestroMcpServer` adapter with only the
   operations this codebase uses: server creation, tool registration, stdio
   transport connection, and elicitation support.
2. Move direct SDK imports into the adapter module.
3. Add wire-level stdio fixture tests around initialize, listTools, callTool,
   tool errors, and elicitation.
4. Run all runtime startup tests through the adapter.
5. Only after parity, prototype a minimal first-party stdio MCP implementation
   behind the same adapter.

### Parity Matrix

| SDK behavior | Required parity |
| --- | --- |
| Tool registration | same name, description, schema, callback behavior |
| Zod validation | same invalid-input errors at the public boundary |
| Stdio transport | same initialize/listTools/callTool lifecycle |
| Elicitation | same schema and client-response behavior |
| Error normalization | same tool result shape and recovery hints |

### Validation Plan

- protocol fixture tests independent of the SDK implementation
- all existing MCP stdio integration tests
- packed runtime startup across all four runtimes
- dependency install-size report before and after any replacement
- external client smoke before SDK removal

### Estimated Impact

Adapter isolation has low direct reduction but high option value. SDK removal
could reduce installed dependency footprint, but package tarball reduction is
inferred low because npm dependencies are not bundled into the package tarball.
Replacement risk is extreme because protocol drift would affect every runtime.

## Next Approval Menu

The next breaking implementation should be selected explicitly:

| Choice | Recommended if the goal is |
| --- | --- |
| A. MCP action registry prototype | Public tool-list simplification and generated schema/doc reduction |
| B. Runtime portfolio split prototype | Smaller per-runtime packages and cleaner install surfaces |
| C. Structured event-log prototype | Local state compaction, queryability, and transactional lifecycle operations |
| D. MCP SDK adapter prototype | Protocol ownership and future SDK replacement optionality |

Default recommendation: C first if local state and architectural consistency are
the priority; A first if public MCP surface size is the priority. B and D should
wait until descriptor-generated docs and adapter parity are stronger.
