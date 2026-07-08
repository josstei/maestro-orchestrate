# Codebase Reduction Options

Date: 2026-07-07

## Decision Context

This report is a decision menu, not an implementation plan. It ranks options for
further reducing `maestro-orchestrate` through architecture-driven design:
decorators, dependency injection, interfaces, abstractions, normalization,
package topology changes, dependency adoption, and more aggressive public-surface
reshapes.

User-selected priorities:

1. Maintainability and architectural simplification are first priority.
2. Raw size reduction is second priority.
3. Breaking public contracts are allowed when runtime behavior, capability, and
   safety do not regress.
4. New dependencies, including heavier frameworks, are allowed when they make
   the architecture better and preserve or improve runtime behavior.
5. Scope includes everything around the repo: tracked source, tests, generated
   runtime surfaces, package/release content, docs, and ignored local artifacts.

## Evidence Snapshot

Observed in this checkout on branch `refactor/codebase_reduction` before the
TypeScript/dist terminal architecture was executed:

| Signal | Observed value |
| --- | ---: |
| Tracked files | 517 |
| Tracked lines | 55,301 |
| Tracked JavaScript lines | 38,134 |
| Tracked Markdown lines | 12,057 |
| Test lines | 22,783 |
| `src/` JavaScript lines | 13,086 |
| `src/mcp/` JavaScript lines | 7,194 |
| Canonical agent/skill/reference/template/entrypoint content lines | 7,735 |
| `scripts/` plus `bin/` JavaScript lines | 2,239 |
| Ignored local entries | 5,487 |
| Ignored `.superpowers`, `docs/superpowers`, `docs/maestro` lines | 88,895 |
| Ignored `.superpowers`, `docs/superpowers`, `docs/maestro` disk size | about 4.7 MB |
| `src/**/*.js` type-carrying JSDoc lines | 661 |
| Runtime MCP tool count | 40 |

Previous package verifier result before the dist-only package contract:

| Gate | Result |
| --- | --- |
| `npm run pack:verify` | Failed: 384 entries > 350, packed size 350,947 > 315,000, unpacked size 1,249,992 > 1,120,000 |

Current post-Option-1 package verifier result:

| Gate | Result |
| --- | --- |
| `npm run pack:verify` | Passed: 384 entries, packed size 353,805, unpacked size 1,272,739 |

Previous package dry-run top buckets before the dist-only package contract:

| Package bucket | Bytes |
| --- | ---: |
| `src/agents` | 288,160 |
| `src/mcp` | 243,450 |
| `docs` | 126,116 |
| `src/skills` | 108,863 |
| `claude` | 92,990 |
| `CHANGELOG.md` | 61,156 |
| `qwen` | 32,986 |
| `agents` | 31,481 |
| `src/lib` | 24,718 |
| `plugins` | 21,785 |
| `src/references` | 21,448 |
| `src/hooks` | 20,516 |
| `src/core` | 19,654 |

Validation commands run during the original options analysis:

| Command | Observed result |
| --- | --- |
| `npm test` | Passed: 1,603 tests, 312 suites, 0 failures |
| `node scripts/check-layer-boundaries.js` | Passed: 9 files scanned, 0 violations |
| `node scripts/check-esm-imports.js` | Passed |
| `npm run pack:verify` | Failed on package budgets as shown above |

Validation commands run after Option 1 execution:

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 1,616 tests, 314 suites, 0 failures |
| `npm run generate` | Passed: 0 written, 192 unchanged, 0 errors |
| `node dist/src/tooling/check-layer-boundaries.js` | Passed: 9 files scanned, 0 violations |
| `node dist/src/tooling/check-esm-imports.js` | Passed |
| `npm run pack:verify` | Passed: 384 entries, packed size 353,805, unpacked size 1,272,739 |
| `npm run release:artifacts` | Passed: created `dist/release/maestro-v1.6.4-extension.tar.gz` |
| `npm run release:verify-artifacts` | Passed |

Already-completed or live-state facts:

- The archived prior report exists at
  `docs/maestro/plans/archive/CODEBASE_BLOAT_REDUCTION_OPPORTUNITIES.md`; the
  old root report is absent.
- The repo now uses the TypeScript/dist terminal topology. `src/platforms/runtime-payload-contract.ts`
  records `mode: typescript-dist-terminal`; public bins and runtime wrappers
  execute compiled `dist/src` output.
- Detached Claude and Codex source payloads have been retired. Runtime content
  is served from package-root `dist/src` with no fallback provider chain.
- The MCP surface is already down to 40 tools. Earlier list/search and
  rating-tool merges have landed.

## Ranking Rubric

Options are ranked by:

1. Architectural leverage: removes repeated decisions, drift-prone contracts, or
   hand-written boilerplate.
2. Runtime behavior: must preserve or improve capabilities, safety, startup, and
   user-facing behavior.
3. Size impact: source lines, test lines, package bytes, generated output, and
   local workspace mass.
4. Reversibility and validation: can be gated by tests and package/runtime probes.

## Recommended Stack

The highest-value path is not a micro-dedup pass. The repo has already harvested
many obvious MCP reductions. The next maintainability-first stack is:

1. Move to a strict TypeScript/dist terminal architecture and stop executing
   source directly.
2. Use that type layer to define homomorphic MCP command tables, typed handler
   contracts, and compile-time schema/handler alignment.
3. Normalize session, document, design-gate, memory, and artifact stores behind
   explicit repositories and decorators.
4. Replace prompt/content sprawl with facet-based generation and package a
   runtime content registry instead of raw authoring content where possible.
5. Only after those foundations, consider breaking MCP tool-surface consolidation
   or state-machine/framework adoption.

This order matters. Tool consolidation before typed contracts will save some
lines but preserve the same structural drift risks.

## Option 1: TypeScript/Dist Terminal Architecture

**Rank:** 1
**Risk:** High
**Primary win:** Maintainability
**Secondary win:** Source and package size
**Breaking surface:** Package layout, script paths, and runtime launch internals

Replace the live JS/source-first topology with strict TypeScript compiled to
`dist/`, and make every executable surface run compiled output:

- `src/**/*.ts` as the only implementation source.
- `dist/` as the npm/runtime executable artifact.
- `scripts/` folded into `src/tooling/`.
- `bin/` folded into `src/bin/`.
- tests type-check against and execute `dist/`.
- npm ships runtime-only `dist` subtrees, not raw `src`.

Observed support:

- Current source has 661 type-carrying JSDoc lines in `src/**/*.js`.
- `npm run pack:verify` currently fails package budgets.
- Package top buckets are dominated by raw runtime content and source:
  `src/agents`, `src/mcp`, `src/skills`, and docs.
- Current live contract explicitly says this topology has not landed.

Architectural payoff:

- Real interfaces for `HandlerContext`, `ToolContract`, `SessionState`,
  `DesignGate`, `MemoryLedger`, `RuntimeConfig`, and package inventories.
- Compile-time checks can replace some doc drift tests, duplicated registry
  checks, and type-carrying JSDoc.
- Package layout becomes explicit: shipped runtime artifact vs source-checkout
  tooling.
- A dist artifact makes boot-from-package behavior testable without relying on
  source-tree conventions.

Raw reduction potential:

- Direct source reduction: hundreds of type-only JSDoc lines.
- Package reduction: high if `src/`, private tooling, declarations, maps, and
  `dist/tooling` are excluded from npm.
- Test reduction: moderate after typed helper APIs replace shape assertion
  duplication.

Main risks:

- Build graph and runtime path mistakes can break all four runtimes.
- Source asset copying must be exact; content-serving depends on agents, skills,
  templates, and generated registries.
- Package size can increase if `dist/`, declarations, source maps, and raw assets
  are shipped indiscriminately.
- Requires new dev dependencies, at minimum TypeScript and Node types.

Behavior-preservation gates:

- `npm test`.
- `node scripts/check-layer-boundaries.js`.
- `node scripts/check-esm-imports.js`, retained for SDK export/subpath hygiene.
- `npm run pack:verify`, with budgets re-baselined only after package intent is
  explicit.
- boot from npm tarball without `src/`.
- generated runtime output zero-diff.
- all four runtime MCP startup/content tests.

Recommendation:

Do this before another broad JS refactor. It creates the interface layer needed
for safer deeper reductions.

## Option 2: Typed MCP Command Tables and Handler Contracts

**Rank:** 2
**Risk:** Medium
**Primary win:** Maintainability
**Secondary win:** Modest source/test reduction
**Breaking surface:** None required, but pairs well with breaking tool reshapes

**Status:** Source migration in progress in the typed MCP command-table slice;
final generated runtime output and release verification are still owned by that
slice's Phase 7. The current source keeps the 40-tool public surface while each
pack declares a `zodSchemas`-keyed command table with explicit context
projection and workspace metadata.

Convert every MCP tool pack into a name-keyed command table:

```text
tool name -> zod raw shape -> typed args -> handler -> context projection -> metadata
```

In TypeScript, the table should be homomorphic over each pack's schema object so
missing, extra, or mismatched handlers fail at compile time. In live JS, a
transitional `defineCommand` can still reduce branching and make metadata
central.

Observed support:

- Tool packs already use arrays/tables in places, but schema files and handler
  registration remain separate.
- `session/index.js` has a context-shape exception for `record_design_approval`.
- Tool metadata, zod schemas, tests, generated goldens, and docs all need to move
  together.
- `src/mcp/tool-packs/*/zod-schemas.js` is only 291 lines, so schema generation
  alone is not the win.

Architectural payoff:

- One command declaration owns schema, description, context projection,
  workspace requirement, post-call behavior, and handler.
- The decorator pipeline can stay small: workspace gate, arg validation boundary,
  error normalization, post-call hooks.
- Cross-pack uniqueness and workspace requirements become declared contracts
  rather than tests plus registry side effects.

Raw reduction potential:

- Low to moderate source line deletion.
- Moderate test simplification by generating or snapshotting tool catalog
  expectations.
- Larger future payoff: fewer places to update per new tool.

Risks:

- A too-clever table can hide the domain-specific differences that still matter.
- Cross-field validation may still belong in handlers to preserve rich domain
  error envelopes.

Validation gates:

- MCP tool schema golden tests.
- pack composition tests.
- direct handler tests for domain errors.
- full MCP in-memory tool-call tests.

Recommendation:

Do this as part of, or immediately after, TypeScript/dist. As a standalone JS
change, keep it narrow and avoid replacing readable handlers with flag-heavy
generic dispatch.

## Option 3: Session, Document, and Gate Repository Normalization

**Rank:** 3
**Risk:** Medium
**Primary win:** Maintainability
**Secondary win:** Small to moderate source reduction

Split session lifecycle responsibilities into explicit repositories/services:

- `SessionRepository`: active/archive/checkpoint read-write, migrations,
  optimistic transaction helper.
- `DocumentRepository`: design/plan materialization, content-vs-path inputs,
  plans directory safety.
- `DesignGateRepository`: gate state only, not generic plan document ownership.
- `PhaseTransitionService`: phase completion, next-phase start, reconciliation
  requirements, cost attribution.
- decorators for workspace, session-id match, checkpoint capture, ledger capture,
  and document materialization.

Observed support:

- `src/mcp/handlers/session-state-tools.js` is 560 lines.
- `src/mcp/handlers/design-gate.js` is 423 lines.
- Implementation-plan document materialization currently reuses design-gate
  helpers by name.
- `withSessionState` and `withValidatedSession` already prove the mutator-helper
  pattern is useful.

Architectural payoff:

- Removes the current conceptual leak where design-gate code owns generic plan
  document functions.
- Makes archiving, checkpointing, plan accuracy, and architecture memory
  recording first-class lifecycle effects.
- Makes behavior-preserving tests easier to target by service boundary.

Raw reduction potential:

- Initial LOC may be neutral or slightly positive.
- Later reductions come from deleting repeated path, session-id, and
  materialization logic.

Risks:

- This is a security and persistence boundary; a bad abstraction can obscure
  when files move or when state is written.
- Must not weaken `HANDOFF_INCOMPLETE`, design approval, reconciliation, or
  session-id invariants.

Validation gates:

- design document lifecycle tests.
- session-state tests.
- reconciliation flow tests.
- archive, checkpoint, and lineage tests.
- explicit file-move tests for plan/design archive behavior.

Recommendation:

Worth doing after typed contracts. This is one of the best maintainability wins
even if raw LOC does not drop immediately.

## Option 4: Memory and Knowledge Store Split

**Rank:** 4
**Risk:** Medium
**Primary win:** Maintainability
**Secondary win:** Small source/test reduction

Replace the broad `MemoryStore` facade with smaller repositories:

- `ProjectProfileRepository`
- `AgentPerformanceLedger`
- `PlanAccuracyLedger`
- `ArchitectureMemoryGraphRepository`
- `RatingsLedger`
- `AgentMemoryRepository`

Observed support:

- `src/mcp/memory/memory-store.js` is 444 lines and owns multiple unrelated
  storage formats.
- Several handlers instantiate `new MemoryStore(projectRoot)` directly instead
  of using `ctx.services.memoryStore`.
- The code already has a lazy service facade in `handler-context.js`, but DI is
  only partially applied.

Architectural payoff:

- Each handler depends on the one store it needs.
- Tests can create tiny fake ledgers instead of broad filesystem stores.
- Future storage changes, including SQLite or a packed memory archive, become
  localized.

Raw reduction potential:

- Low initially.
- Moderate in tests if fake repositories replace repeated filesystem fixtures.

Risks:

- Splitting without typed interfaces can add ceremony.
- Ledger formats are user state; migrations must remain lenient and tested.

Validation gates:

- project profile, ratings, plan accuracy, architecture memory, memory-pack,
  agent memory, and archive-compaction tests.
- import/export round trips.

Recommendation:

Good second-wave work after the command/DI layer is real.

## Option 5: Runtime Content Registry Instead of Raw Package Source

**Rank:** 5
**Risk:** High
**Primary win:** Package size and drift reduction
**Secondary win:** Maintainability

Generate a runtime content registry for agents, skills, references, templates,
and resource metadata, then serve MCP content from that registry in npm/runtime
packages instead of shipping raw authoring paths under `src/`.

Observed support:

- `src/agents` is the largest package bucket at 288,160 bytes.
- `src/skills` contributes 108,863 bytes.
- `src/references` contributes 21,448 bytes.
- `src/generated` is already packaged.
- Prior architecture intentionally removed detached runtime source mirrors, and
  Option 1 moved the package runtime content root to `dist/src`.

Architectural payoff:

- Clear distinction between authoring source and runtime content.
- Smaller package entry count and lower content-size pressure if implemented
  carefully.
- One materialization pipeline can serve filesystem source in dev and packed
  registry content in npm.

Raw reduction potential:

- High for package bytes and entry count.
- Low for tracked source unless raw authoring content is moved out of the shipped
  package only.

Risks:

- Earlier work deliberately avoided a detached content payload. A registry must
  not reintroduce a second hand-maintained source of truth.
- Debuggability may worsen if runtime errors refer only to registry keys.
- Content transforms must remain runtime-correct for Gemini, Claude, Codex, and
  Qwen.

Behavior-preserving shape:

- Source checkout: serve from filesystem `src`.
- Packed npm/release artifact: serve generated registry from `dist` or
  `src/generated`.
- Registry generated from authoring source on build/prepack.
- Content parity tests prove byte-identical `get_agent` and `get_skill_content`
  outputs.

Validation gates:

- all content handler tests.
- MCP bundle behavior tests for every runtime.
- package verifier with entry/size budgets.
- boot-from-tarball test.

Recommendation:

This is the strongest package-budget option, but it should come after the
TypeScript/dist build graph or be done with extreme restraint in JS mode.

## Option 6: Prompt and Agent Facet Generation

**Rank:** 6
**Risk:** High
**Primary win:** Maintainability of methodology content
**Secondary win:** Package/source size

Replace 39 hand-authored agent methodologies and shared skill prose with
generated compositions from smaller facets:

- role identity.
- capability/tool tier.
- domain checklist.
- quality bar.
- handoff contract.
- collaboration expectations.
- risk/anti-pattern snippets.

Observed support:

- canonical agent/skill/reference/template/entrypoint content is 7,735 lines.
- `src/agents` alone is 4,622 source lines and the largest npm package bucket.
- The previous handoff-template normalization already proved shared prompt
  protocol extraction can work.

Architectural payoff:

- A new agent becomes data plus selected facets, not a full prose file.
- Common behavior stays centralized without copying.
- Tool/capability changes can be rendered across every agent.

Raw reduction potential:

- Moderate in source.
- High in package if paired with a runtime content registry.

Risks:

- Prompt behavior can regress even when tests pass.
- Over-normalization may erase domain-specific guidance that improves agent
  quality.
- Requires a prompt-quality review gate, not just code tests.

Validation gates:

- generated agent diff review.
- tool mapping tests.
- protocol invariant tests.
- selected dogfood sessions for high-use agents: coder, refactor, architect,
  code-reviewer, tester.

Recommendation:

Do not start with all 39 agents. Pilot on one family of highly similar agents,
measure generated output and dogfood quality, then expand.

## Option 7: Policy Enforcer Parser and Policy Provider

**Rank:** 7
**Risk:** Medium to high
**Primary win:** Safety and maintainability
**Secondary win:** Small source reduction

Split `src/hooks/policy/policy-enforcer.js` into a command parser, policy
provider, evaluator, and hook adapter. Consider either an internal parser
contract or an external shell-parser dependency if equivalence is proven.

Observed support:

- `src/hooks/policy/policy-enforcer.js` is 370 lines.
- It combines shell splitting, subshell extraction, wrapper normalization, file
  write jail checks, policy matching, stdin parsing, and hook output shaping.
- It is a security boundary.

Architectural payoff:

- Parser behavior can be tested independently.
- Policy source can become a provider interface, eventually generated from
  `policies/maestro.toml` if desired.
- Hook adapter becomes small and fail-closed.

Raw reduction potential:

- Low if implemented internally.
- Medium only if a dependency safely replaces the custom shell parsing.

Dependency candidates:

- a shell parser library for command structure.
- a CLI/policy DSL library only if it preserves current deny/ask behavior.

Risks:

- Shell parsing is security-sensitive. A third-party parser that misses a
  current evasion case is a behavior regression.
- Current parser is intentionally conservative in places; a generic parser may
  normalize differently.

Validation gates:

- existing policy integration tests.
- a larger evasion matrix before the refactor.
- fail-closed loader tests.
- write-jail boundary tests.

Recommendation:

Do the internal split first. Adopt an external parser only after a matrix proves
it is at least as strict as current behavior.

## Option 8: State Machine or Workflow Engine

**Rank:** 8
**Risk:** Very high
**Primary win:** Architectural clarity
**Secondary win:** Possible handler/test reduction

Model Maestro sessions as a formal state machine rather than scattered lifecycle
handlers. This could use an internal statechart DSL or a dependency such as
XState.

Observed support:

- Session lifecycle spans create, design gate, plan approval, execution mode,
  phase transition, reconciliation, checkpointing, archive, lineage, ratings,
  and memory recording.
- The current state is readable but distributed across multiple handlers and
  skills.

Architectural payoff:

- Legal transitions become explicit.
- The orchestration reference, session validation, and handler behavior can be
  generated from one graph.
- Recovery paths become first-class states instead of prose-only instructions.

Raw reduction potential:

- Unclear. Initial implementation likely adds lines.
- Long-term reduction comes from deleting duplicated transition checks and
  prose/tool drift.

Risks:

- A framework may be larger than the code it replaces.
- Persisted session files must remain migratable.
- Model-facing workflow prose still has to be generated and readable.

Validation gates:

- migration tests for old session files.
- every current lifecycle integration test.
- generated orchestration-step parity tests.
- recovery/reconciliation tests.

Recommendation:

Include as a serious high-risk option, but only after repository interfaces are
typed. Doing this in current JS would likely be too expensive.

## Option 9: Breaking MCP Tool-Surface Consolidation

**Rank:** 9
**Risk:** Very high
**Primary win:** Public surface simplicity
**Secondary win:** Source/docs/test reduction

Collapse the 40 MCP tools into fewer domain tools with explicit action fields,
for example:

- `maestro_workspace`
- `maestro_session`
- `maestro_content`
- `maestro_memory`
- `maestro_history`

or a smaller query/mutation split:

- `maestro_query`
- `maestro_mutate`
- `maestro_content`

Observed support:

- The surface is currently 40 tools across 5 packs.
- Earlier safe merges have already landed, so remaining merges are more
  semantic and risky.

Architectural payoff:

- Model tool selection becomes simpler.
- Docs and generated catalog surfaces shrink.
- Domain dispatch can be internal and typed.

Raw reduction potential:

- Moderate source deletion in tool-pack registration, schemas, goldens, docs, and
  tests.
- Potentially large prompt/tool-list simplification.

Risks:

- Per-tool zod schemas and descriptions currently help models call tools
  correctly.
- A generic action tool can push validation back into handwritten guards.
- Breaking every existing MCP caller is acceptable only if capability and
  behavior improve.

Behavior-preserving shape:

- Keep old tool names for one release as generated shims only if compatibility is
  temporarily desired.
- If no compatibility is required, provide a migration table and strict tests
  proving action parity.

Validation gates:

- one parity test per old tool action.
- docs generated from action registry.
- model-facing runtime guide updated.
- current orchestration skills updated and dogfooded.

Recommendation:

Do not rank this above typed contracts. It is attractive, but without a typed
action registry it risks turning explicit public tools into a generic handler
switch.

## Option 10: Test Harness and Fixture Normalization

**Rank:** 10
**Risk:** Medium
**Primary win:** Maintenance cost
**Secondary win:** Test line reduction

Normalize tests around fewer fixture builders, table-driven cases, and generated
tool-schema expectations.

Observed support:

- tests are 22,783 lines.
- largest tests include `lib-discovery`, `inject-frontmatter`, `design-gate`,
  `design-document-lifecycle`, `mcp-content-handlers`, `validate-plan`, and
  several package/release tests.
- `tests/support/mcp.js` already provides a strong in-memory MCP harness.

Architectural payoff:

- More tests exercise production paths through the SDK/zod boundary.
- Domain-specific fixtures become reusable.
- Generated schema/catalog tests reduce hard-coded name lists.

Raw reduction potential:

- Moderate, especially in repeated table-like assertion files.
- Direct-call tests should not be blindly rerouted; some catch domain logic that
  SDK validation cannot.

Risks:

- Over-consolidated fixtures can hide important behavior details.
- Full handler reroute may add lines and slow tests if done indiscriminately.

Validation gates:

- test count and coverage unchanged or improved.
- mutation of one schema/tool name fails exactly one generated expectation.
- package/release tests remain integration-level.

Recommendation:

Opportunistic but valuable. Pair with command-table work so schema/catalog tests
are generated from the same source.

## Option 11: Package and Documentation Surface Pruning

**Rank:** 11
**Risk:** Medium
**Primary win:** Package budget recovery
**Secondary win:** Install footprint reduction

Reduce docs and generated runtime content shipped in npm/release artifacts.

Observed support:

- `npm run pack:verify` currently fails budgets.
- `docs` contributes 126,116 bytes to the package.
- `CHANGELOG.md` contributes 61,156 bytes.
- generated runtime docs and root runtime guides also ship.

Possible moves:

- Ship fewer docs in npm, keeping canonical docs in git/release site.
- Generate compact runtime quick references instead of full docs inside package.
- Move historical changelog detail out of npm or split recent vs archive.
- Make package verifier classify docs by explicit user-facing need.

Risks:

- Install-time/offline usability can regress if docs disappear.
- Marketplace plugin metadata may expect specific README/docs files.

Validation gates:

- package verifier.
- release artifact verifier.
- local plugin install tests.
- marketplace metadata tests.

Recommendation:

This is the fastest way to fix package budgets if runtime content registry work
is deferred.

## Option 12: Local Artifact Retention and Compaction

**Rank:** 12 for product architecture, rank 1 for local workspace cleanup
**Risk:** Low to medium
**Primary win:** Raw local size and cognitive noise
**Secondary win:** Faster local scans

Compact or archive ignored local planning artifacts under `.superpowers`,
`docs/superpowers`, and `docs/maestro`.

Observed support:

- ignored local Maestro/Superpowers artifacts are about 88,895 lines.
- those directories occupy about 4.7 MB.
- all ignored local entries total 5,487.
- tracked repo lines are about 55,301, so ignored planning artifacts exceed the
  tracked line count.

Possible moves:

- Keep only active plans locally; archive older plans to compressed artifacts.
- Add a retention command for `.superpowers/sdd` review diffs.
- Export durable summaries into a small tracked root report when needed, then
  prune verbose local scratch.
- Add a local cleanup script that preserves active session state and deletes
  stale ignored artifacts.

Risks:

- These artifacts may be useful for audit trails.
- Some current workflows may assume old plans are locally searchable.

Validation gates:

- dry-run cleanup report.
- active Maestro session detection.
- explicit exclude rules for current active plans.

Recommendation:

Do this separately from product refactors. It is high raw payoff, low product
risk, and should not be confused with shipped-code reduction.

## Option 13: Runtime Portfolio Externalization

**Rank:** 13
**Risk:** High
**Primary win:** Package and repo organization
**Secondary win:** Generated surface simplification

Keep all runtime behavior, but move runtime-specific adapters into separate
generated packages or release artifacts:

- `@josstei/maestro-core`
- `@josstei/maestro-gemini`
- `@josstei/maestro-claude`
- `@josstei/maestro-codex`
- `@josstei/maestro-qwen`

Observed support:

- current package serves four runtimes.
- generated runtime roots still exist for host-facing manifests and stubs.
- runtime behavior must not regress, so dropping a runtime is not allowed under
  the current instruction.

Architectural payoff:

- Runtime-specific package budgets become smaller and clearer.
- Release workflows can validate each runtime artifact independently.
- Core package can focus on MCP server and shared content.

Raw reduction potential:

- Npm package size per consumer can drop.
- Monorepo source may grow unless old bundled surfaces are removed from the
  primary package.

Risks:

- Release complexity increases.
- Cross-runtime docs and marketplace metadata become harder to keep aligned.
- Multi-package versioning is a new failure mode.

Validation gates:

- per-runtime package install tests.
- marketplace tests.
- all current runtime startup/content tests.
- release workflow dry run.

Recommendation:

Only consider after TypeScript/dist and package inventory are stable. It is a
distribution architecture change, not a cleanup.

## Option 14: CLI and Release Tooling Framework

**Rank:** 14
**Risk:** Medium
**Primary win:** Maintainability of scripts
**Secondary win:** Small source reduction

Adopt a CLI framework or internal command registry for root scripts:

- `generate`
- `verify-npm-pack`
- `release-artifact-manifest`
- `package-release-artifacts`
- `publish-dist-branch`
- `npm-publish-idempotent`

Observed support:

- root `scripts/` plus `bin/` are 2,239 lines.
- current scripts are excluded from npm package content.

Dependency candidates:

- `commander`, `cac`, or `yargs` for CLI parsing.
- internal `defineCliCommand` registry if avoiding runtime dependencies.

Architectural payoff:

- consistent help, argument parsing, exit codes, JSON output, and root
  resolution.
- fewer one-off `process.argv` parsers.

Raw reduction potential:

- Low. The scripts are not the main source of bloat.

Risks:

- A runtime dependency for source-checkout tooling may not be worth it.
- Release scripts are high-stakes and must stay predictable.

Recommendation:

Low priority. Fold into TypeScript/tooling relocation if that path is chosen.

## Option 15: SQLite or Structured State Backend

**Rank:** 15
**Risk:** Very high
**Primary win:** State/query architecture
**Secondary win:** Possible file-count reduction

Replace Markdown/JSON/JSONL state files with a structured local database or
single packed state store.

Observed support:

- Session state, design gates, checkpoints, project profile, ratings,
  architecture memory, plan accuracy, agent performance, and org knowledge all
  have separate storage conventions.

Architectural payoff:

- Transactions and queries become easier.
- Archive/search/cost insights could become cheaper and cleaner.
- Compaction and retention become first-class.

Raw reduction potential:

- Unclear for source.
- Potentially high for local file count.

Risks:

- Runtime dependency and native/package friction if using SQLite bindings.
- Current human-readable state is useful for recovery and audit.
- Migration burden is large.

Behavior-preserving shape:

- Keep import/export to the existing file format.
- Preserve Markdown archive readability, or generate it as an export.

Recommendation:

Interesting but not near-term. It solves a different class of problem than the
package topology and content-size problems tracked in this report.

## Options Considered Lower ROI

These are not banned, but they should not lead:

| Idea | Reason |
| --- | --- |
| Zod schema generation alone | Current zod schema files are only 291 lines. The real issue is schema/handler/metadata drift, not schema LOC. |
| More tiny MCP guard sweeps | Earlier MCP reduction work has already harvested the easy wins. Current surface is 40 tools and tests are green. |
| Deleting generated runtime output from the working tree | Generated host surfaces are ignored/untracked and about 4,798 lines. Useful for cleanliness, not the biggest product lever. |
| Generic dependency swaps for frontmatter or BM25 | Existing behavior is custom and test-pinned. Dependencies are allowed, but behavior must improve, not merely become conventional. |
| Runtime pruning | Dropping Gemini, Claude, Codex, or Qwen would be a capability regression under the current instruction. Externalizing runtimes is the safe version. |

## Immediate Decisions To Make

1. Choose whether typed MCP command tables and handler contracts should be the
   next source-level architecture slice.
2. Choose whether runtime content registry and prompt/agent facet generation
   should be the next package/content reduction slice.
3. Choose whether repository/store normalization should be the next
   state-management slice.
4. Choose whether local artifact retention should be handled as a quick cleanup
   separate from product architecture.
5. Choose whether runtime portfolio externalization or breaking MCP tool
   consolidation is desirable after typed contracts exist.

## Suggested Next Slice

Recommended next slice:

**Typed MCP command tables and handler contracts.**

Why:

- TypeScript/dist is now the active foundation.
- It reduces schema/handler/metadata drift without changing runtime capability.
- It creates a safer base for later MCP tool-surface consolidation.
- It should simplify tests that currently prove alignment across several files.

Fallback slice if typed MCP contracts are too broad right now:

**Runtime content registry plus facet-generation feasibility proof.**

This should target package/content size and prompt duplication while preserving
all runtime content behavior.
