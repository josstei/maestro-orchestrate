<!--
Source of truth:
- Approved design: docs/maestro/plans/2026-07-11-fresh-architecture-reduction-rescan-design.md
- Approved plan: docs/maestro/plans/2026-07-11-fresh-architecture-reduction-rescan-impl-plan.md
- Frozen repository: refactor/codebase_normalization_reduction at
  69e82069e63b1920a7e4b93e12b6b021090f0557.
- Representative evidence: package.json; src/platforms/runtime-declarations.ts;
  src/generator/types.ts; src/tooling/artifact-policy.ts;
  src/mcp/tool-packs/command-table.ts; src/mcp/server/tool-pipeline.ts;
  src/mcp/content/provider.ts; src/mcp/session/session-store.ts.
Review this atlas when a listed source, public contract, runtime, package
surface, verification owner, or delivery journey changes.
-->

# Architecture Reduction Option Atlas

This is a technology-neutral and Node/TypeScript decision atlas for reducing
Maestro. It deliberately includes safe, breaking, externalized, replacement,
and product-deletion choices. It is not an implementation plan: no option is
selected and no approval to change code, behavior, compatibility, packaging,
distribution, persistence, hosting, or product scope is implied.

This task is documentation-only. It makes no production, test, generated,
compiled, workflow, dependency, runtime, or package-policy change and performs
no prototype, stage, commit, push, publish, or release.

## Executive outcome

The most credible retained-product direction is still plain functions,
responsibility-aligned modules, explicit context, normalized snapshots, pure
transitions, and independently verified artifact/content authority. The scan
does not support decorators, a dependency-injection container, interface
layers around single implementations, reflection, an effect framework, CQRS,
event sourcing, or a broad DSL as code-reduction mechanisms.

The largest repository-local deletions come from retiring hosts, delivery
journeys, state features, MCP, or the executable product. Hosted, upstream,
client-owned, split-package, and on-demand options can reduce a checkout or
install while increasing another owner’s source, support, security, spend, or
operations. They are transfers until the whole system is measured.

| Decision posture | Recommended starting point | Principal gate |
|---|---|---|
| Retain exact public behavior | `TN-N01`, `TN-N02`, narrow `NT-MCP-01`, `STATE-WORKSPACE-001`, `STATE-SNAPSHOT-001`, then `STATE-REDUCER-001` | Keep independent wire, package, security, migration, host, CLI, and generator oracles |
| Normalize Node/TypeScript authority | `NT-ART-01`, `NT-GEN-01`, `NT-GEN-02`, `NT-RUNTIME-01`, `NT-VAL-01`, `NT-CLI-01` | A measured implementation diff must be negative; current output and journeys remain authoritative |
| Break compatibility but retain capability | Choose one persistence authority, package topology, delivery authority, protocol, or upstream substitute | Explicit migration, rollback, adoption, privacy, offline, and support-lifetime decisions |
| Maximize local or install reduction | Host subsets, on-demand payloads, thin client, daemon, edge, container, or hosted service | Count client and remote owners; local deletion is not total-system deletion |
| Maximize total-system reduction | `STATE-SUBFEATURE-DEL`, `STATE-SESSION-DEL`, `STATE-MCP-DEL`, `NT-PRODUCT-01`, `TN-P05`, or `TN-DOC-PACK-001` | Product owner explicitly accepts journey loss |

No host recommendation is made because the scan contains no adoption
telemetry. No portfolio other than status quo has a defensible net total.

## Evidence, accounting, and decision language

### Quantitative classes

| Class | Meaning | Arithmetic rule |
|---|---|---|
| `EO` | Exact current observation | Baseline or factual inventory only |
| `GI` | Exact gross inventory or ceiling before additions, dependency closure, or replacement | Evidence annotation only; never a net |
| `DP` | Exact visible-path or direct-owner projection without dependency closure | Record-local evidence only |
| `ISE` | Inherited bounded scan estimate | Record-local scenario only; never compose |
| `U` | Unquantified | Unknown, not zero |

Signed net change would be additions minus deletions, with negative meaning
reduction, but no new net is asserted in this atlas. Surfaces remain separate:
`P` authored production, `T` tests/support/goldens/fixtures, `W` workflow and
configuration, `G` generated, `N` npm entries/bytes, `I` per-install, and `X`
external/backend/operations. Combined `T+W` inventories stay outside vector
columns. Gross, direct, and inherited values never enter portfolio or
dominance arithmetic.

Compatibility and journey loss are independent:

| Axis | Value | Meaning |
|---|---|---|
| Compatibility | `C0` | Exact public, wire, data, package, and host compatibility |
| Compatibility | `C1` | Compatible or additive migration |
| Compatibility | `C2` | Breaking cutover |
| Journey | `J0` | No user journey lost |
| Journey | `J1` | Delivery, offline, operational, or access mode lost or degraded |
| Journey | `J2` | Named capability or host journey removed |
| Journey | `J3` | Executable product replaced or eliminated |

Every live option also records: Tracks (`TN` technology-neutral, `NT`
Node/TypeScript, or `TN+NT`), accountable Owner, migration `M0..M4`, operations
`O0..O4`, spend `S0..S3` or `?`, and support lifetime `L0..L3`. `?` is used
when the frozen evidence does not justify a category.

### Frozen exact observations

| Surface | `EO` |
|---|---:|
| Tracked repository | 516 files; 62,883 lines; 2,446,699 B |
| Canonical `src` | 218 files; 26,818 lines |
| Canonical TypeScript | 188 files; 19,100 lines |
| Full test partition | 239 files; 28,201 lines |
| Executable tests | 185 files; 25,869 lines |
| Support helpers | 9 files; 1,033 lines |
| Goldens | 44 files; 1,007 lines |
| Type fixture | 1 file; 292 lines |
| Tool-schema fixtures | 40 files; 913 lines; 19,544 B |
| Generated outputs | 192 files; 6,825 lines; 282,556 B; 3 tracked and 189 ignored |
| Compiled `dist/src` | 199 files; 749,468 B |
| Public tools / agents | 40 / 39 |
| npm monolith | 337 entries; 304,298 packed B; 818,490 unpacked B |

### Reproduction commands

These are the frozen quantitative reviewer’s reproduction commands:

```text
git ls-files | wc -l
git ls-files -z | xargs -0 wc -l | tail -n 1
git ls-files -z | xargs -0 wc -c | tail -n 1
rg --files src | wc -l
rg --files src -0 | xargs -0 wc -l | tail -n 1
rg --files src -g '*.ts' | wc -l
rg --files src -g '*.ts' -0 | xargs -0 wc -l | tail -n 1
rg --files tests | wc -l
rg --files tests -0 | xargs -0 wc -l | tail -n 1
rg --files tests -g '*.test.js' | wc -l
rg --files tests -g '*.test.js' -0 | xargs -0 wc -l | tail -n 1
node dist/src/tooling/generate.js --list-outputs
find dist/src -type f | wc -l
find dist/src -type f -exec wc -c {} + | tail -n 1
find tests/unit/golden/tool-packs -name '*.json' | wc -l
rg -n '^A\|' src/agent-profiles/agents.profile | wc -l
npm pack --dry-run --json --ignore-scripts --cache /tmp/maestro-acct-12-npm-cache
node dist/src/tooling/verify-npm-pack.js --ignore-scripts
```

### Range-key ledger

Only these keys and values are authorized. Every other candidate delta is `U`.

| Key | Class and value | Boundary |
|---|---|---|
| `OBS-REPO` | `EO` repository baseline above | Git-tracked counts |
| `OBS-SRC` | `EO` source and TypeScript baseline above | `rg` and `wc` |
| `OBS-TEST` | `EO` physical test inventory above | No semantic ownership claim |
| `OBS-GEN` | `EO` 192 files; 6,825 lines; 282,556 B | Generator output list |
| `OBS-DIST` | `EO` 199 files; 749,468 B | Compiled tree, not npm |
| `OBS-NPM` | `EO` 337 entries; 304,298 packed B; 818,490 unpacked B | Raw npm/verifier monolith |
| `DP-HOST-*` | `DP` fifteen host-set rows below | Common payload and dependency closure excluded |
| `DP-CODEX-P` | `DP` 381 TypeScript lines and 674 content lines removed | Removed-host visible paths; shared excluded |
| `DP-CODEX-G` | `DP` at least 165 files and 243,065 B removed | Registry rewrites excluded |
| `DP-CODEX-N` | `DP` at least 177 entries and 235,244 B removed; at most 160 entries and 583,246 B retained | Packed allocation and shared pruning excluded |
| `GI-HOSTED-DIST` | `GI` 137 entries; 543,375 B | Whole-dist ceiling; client/backend additions excluded |
| `GI-STABLE-W` | `GI` 29 W + 41 W + 21 W + 125 W = 216 W | Replacement workflow excluded |
| `GI-DIST-RELEASE` | `GI` 193 P; 116 combined T+W | Combined value outside vectors |
| `GI-DIST-TARBALL` | `GI` 276 P; 208 combined T+W | Combined value outside vectors |
| `GI-REL-NOIDEM` | `GI` 349 P + 349 T | Retry/replacement behavior excluded |
| `GI-ONDEMAND` | `GI` 196 owned files; 275,896 B | Overlaps package and host inventories |
| `GI-SCHEMA` | `GI` 40 files; 913 lines; 19,544 B | Gross static fixture inventory, not net |
| `GI-POLICY-PARSER` | `GI` 254 P lines | Adapter, dependency, tests, package, and operations excluded |
| `ISE-G01` | `ISE` +4,443 P ownership-transfer scenario from 6,825 authored output lines minus 2,382 generator lines | Individual scenario only |
| `ISE-P01-ONE` | `ISE` gross P +500..+1,500 | One-host alternative |
| `ISE-P01-FOUR` | `ISE` gross P +2,000..+6,000 | Four-host alternative |
| `ISE-STATE-GIT` | `ISE` P -600..+500 | Alternative authority |
| `ISE-STATE-ACTION` | `ISE` P -500..-80 | Overlaps MCP and state |
| `ISE-STATE-RESOURCE` | `ISE` P -110..+200 | Protocol, not persistence |
| `ISE-NATIVE-BUILD` | `ISE` +100..+500 combined build/release burden | Outside `P` and `W` vectors and dominance |
| `ISE-TEST-OWNER` | `ISE` ownership category assessment below | Display only; no composition |

## Maximal technology-neutral recommendation list

The order is preference for investigation, not implementation approval.

| Band | Exact semantic IDs | Technology-neutral assessment |
|---:|---|---|
| 1 | `TN-N01`, `TN-N02`, `TN-R01`, `STATE-WORKSPACE-001`, `STATE-SNAPSHOT-001`, `STATE-REDUCER-001`, `NT-ART-01` | Prefer plain functions, cohesive ownership, explicit context, simple snapshots, pure transitions, and independent artifact authority |
| 2 | `NT-MCP-01`, `NT-MCP-03`, `NT-CONTENT-01`, `NT-CONTENT-02`, `NT-CONTENT-03`, `NT-GEN-01`, `NT-GEN-02`, `NT-RUNTIME-01`, `NT-CLI-01`, `NT-VAL-01`, `NT-DOC-01` | Apply only as measured, capability-preserving contractions; rendered-content packing is currently rejected as an assumed size win |
| 3 | `PLAT-HOST-SINGLETON-001`, `PLAT-HOST-SUBSET-001`, `PLAT-PKG-ONDEMAND`, `PLAT-PKG-OPTIONAL`, `PLAT-PKG-WORKSPACE`, `PLAT-PKG-EXPORTS`, `PLAT-SPLIT-001`, `PLAT-GEN-FIRST-RUN-001`, `PLAT-STABLE-001`, `PLAT-DIST-001`, `PLAT-TAR-001`, `PLAT-NPM-001`, `PLAT-REGISTRY-001`, `PLAT-DIST-RELEASE`, `PLAT-DIST-TARBALL`, `PLAT-REL-NOIDEM` | Package and delivery choices are product/distribution decisions; no topology itself proves repository reduction and non-idempotent publication is rejected |
| 4 | `TN-G01`, `PLAT-GEN-SINGLE`, `TN-P01`, `TN-PROTOCOL-CLI-001`, `TN-PROTOCOL-JSONRPC-001`, `PLAT-EXT-UPSTREAM`, `NT-AGENTS-SDK-001`, `STATE-ACTION-001`, `STATE-RESOURCE-001` | Protocol, host-native, generated-output, and upstream substitutions require parity and owner-transfer accounting; custom JSON-RPC and generic action collapse are rejected as default size assumptions |
| 5 | `STATE-EVENTLOG-001`, `STATE-SQLITE-001`, `STATE-CLIENT-001`, `STATE-HOSTED-001`, `STATE-EPHEMERAL-001`, `STATE-GIT-001` | Choose exactly one persistence authority; size alone cannot choose durability, consistency, privacy, recovery, or ownership |
| 6 | `PLAT-HOSTED-MCP-001`, `PLAT-HOSTED-CONTENT-001`, `PLAT-HOSTED-COMPUTE-001`, `PLAT-HOSTED-FULL-001`, `PLAT-EXT-EDGE`, `PLAT-EXT-DAEMON`, `PLAT-EXT-THIN` | Local/install reductions transfer authentication, lifecycle, deployment, observability, incident, and support ownership |
| 7 | `STATE-SUBFEATURE-DEL`, `STATE-SESSION-DEL`, `STATE-MCP-DEL`, `NT-GENERIC-TOOLS-001`, `NT-PRODUCT-01`, `TN-P05`, `TN-DOC-PACK-001` | True deletion frontier; select only after explicit capability and journey-loss approval |
| 8 | `TN-REWRITE-GO`, `TN-REWRITE-RUST`, `TN-REWRITE-PYTHON`, `TN-REWRITE-DENO`, `TN-REWRITE-WASM`, `TN-P03` | Rewrites and compiled binaries are measured replacement programs, not assumed reductions |
| 9 | `TN-DECORATORS-001`, `TN-DI-001`, `TN-PORTS-001`, `TN-REFLECTION-001`, `TN-EFFECTS-001`, `TN-CQRS-ES-001`, `TN-DSL-001`, `NT-AUX-ABSTRACTIONS-001` | Reject as size strategies absent a net-negative full-lifecycle spike |

## Node and TypeScript-only recommendation list

| Band | Exact semantic IDs | Node/TypeScript assessment |
|---:|---|---|
| 1 | `NT-DOC-01`, `NT-ART-01`, `NT-MCP-01`, `NT-MCP-03`, `NT-GEN-01`, `NT-GEN-02`, `NT-RUNTIME-01`, `NT-CLI-01`, `NT-VAL-01` | Best current-stack candidates; keep pack boundaries, pipeline ordering, SDK calls, static fixtures, raw package artifacts, and generator drift independent |
| 2 | `STATE-WORKSPACE-001`, `STATE-SNAPSHOT-001`, `STATE-REDUCER-001`, `STATE-EXPORTS-001`, `NT-CONTENT-01`, `NT-CONTENT-03` | Normalize state/content in sequence; exports and filesystem fallback require breaking-change gates |
| 3 | `PLAT-PKG-EXPORTS`, `PLAT-SPLIT-001`, `PLAT-PKG-WORKSPACE`, `PLAT-PKG-ONDEMAND`, `PLAT-PKG-OPTIONAL`, `PLAT-GEN-FIRST-RUN-001`, `PLAT-REGISTRY-001` | Node package-topology options; interface, install, scripts-disabled, offline, signing, and version-skew costs dominate the decision |
| 4 | `PLAT-STABLE-001`, `PLAT-DIST-001`, `PLAT-TAR-001`, `PLAT-NPM-001`, `PLAT-DIST-RELEASE`, `PLAT-DIST-TARBALL`, `PLAT-REL-NOIDEM`, `PLAT-HOST-SINGLETON-001`, `PLAT-HOST-SUBSET-001` | Delivery/host options require real install replacements and telemetry; non-idempotent publication remains rejected |
| 5 | `STATE-EVENTLOG-001`, `STATE-SQLITE-001`, `STATE-CLIENT-001`, `STATE-HOSTED-001`, `STATE-EPHEMERAL-001`, `STATE-GIT-001`, `STATE-ACTION-001`, `STATE-RESOURCE-001` | Mutually exclusive storage authorities plus distinct protocol options; resources are not persistence |
| 6 | `PLAT-HOSTED-MCP-001`, `PLAT-HOSTED-CONTENT-001`, `PLAT-HOSTED-COMPUTE-001`, `PLAT-HOSTED-FULL-001`, `PLAT-EXT-EDGE`, `PLAT-EXT-DAEMON`, `PLAT-EXT-THIN`, `PLAT-EXT-UPSTREAM`, `NT-AGENTS-SDK-001` | Externalized/upstream Node options; count remote and dependency owners and preserve an exit path |
| 7 | `TN-G01`, `PLAT-GEN-SINGLE`, `TN-P01`, `TN-PROTOCOL-CLI-001`, `TN-PROTOCOL-JSONRPC-001`, `NT-GENERIC-TOOLS-001` | Alternative generation/protocol surface; accept only with named client, discovery, authorization, and parity ceilings |
| 8 | `STATE-SUBFEATURE-DEL`, `STATE-SESSION-DEL`, `STATE-MCP-DEL`, `NT-PRODUCT-01`, `TN-P05`, `TN-DOC-PACK-001` | Breaking product-deletion choices, largest true reductions |
| 9 | `TN-REWRITE-GO`, `TN-REWRITE-RUST`, `TN-REWRITE-PYTHON`, `TN-REWRITE-DENO`, `TN-REWRITE-WASM`, `TN-P03` | Replacement frontier; all require full Node-product parity and measured total-system benefit |
| 10 | `NT-CONTENT-02`, `PLAT-REL-NOIDEM`, `STATE-ACTION-001`, `STATE-RESOURCE-001`, `TN-PROTOCOL-JSONRPC-001`, `TN-DECORATORS-001`, `TN-DI-001`, `TN-PORTS-001`, `TN-REFLECTION-001`, `TN-EFFECTS-001`, `TN-CQRS-ES-001`, `TN-DSL-001`, `NT-AUX-ABSTRACTIONS-001` | Current-stack and abstraction rejections; reconsider only for a named constraint and measured lifecycle reversal |
| 11 | `HIST-NODE-FLOOR-001`, `HIST-POLICY-PARSER-001` | Late-provenance options; engine adoption and policy differential gates dominate |
| 12 | `TEST-FIXTURE`, `TEST-MATRIX`, `TEST-MCP-CONTRACT`, `TEST-VALIDATION`, `TEST-SHIM`, `TEST-SCHEMA`, `TEST-PACKAGE`, `TEST-GENERATOR`, `TEST-STATE`, `TEST-SECURITY`, `TEST-CLI`, `TEST-EXEC`, `TEST-COVERAGE`, `TEST-PROPERTY`, `TEST-RADICAL`, `TEST-BEHAVIOR-DEL` | Parent-bound overlays; all nets U, radical deletion rejected, future semantic owner manifest mandatory |

## Canonical 23-family alias map

| Canonical family | Live members and preserved aliases | Rule |
|---|---|---|
| `F-NORM` | `TN-N01`, `TN-N02`, `TN-R01`, `NT-DOC-01` | Plain functions and cohesive modules before metamodels |
| `F-ARTIFACT-POLICY` | `NT-ART-01`; aliases `PLAT-POLICY-N` and `PLAT-POLICY-B` | One normalized specification plus independent raw-artifact oracle |
| `F-MCP-CATALOG` | `NT-MCP-01`, `NT-MCP-03` | Preserve pack-local ownership and pipeline ordering |
| `F-CONTENT-AUTHORITY` | `NT-CONTENT-01`, `NT-CONTENT-02`, `NT-CONTENT-03` | Authority and representation variants are not additive |
| `F-GENERATION-GRAPH` | `NT-GEN-01`, `NT-GEN-02`, `NT-RUNTIME-01`, `TN-G01`, `PLAT-GEN-SINGLE` | Generated and directly authored ownership are alternatives |
| `F-STATE-SNAPSHOT` | `STATE-SNAPSHOT-001`; alias `NT-STATE-02` | One persisted snapshot contract |
| `F-WORKSPACE-CONTEXT` | `STATE-WORKSPACE-001`; overlap `NT-MCP-03` | One explicit workspace seam |
| `F-EXPORT-SHIM` | `STATE-EXPORTS-001`; alias `NT-STATE-01` | Deep-import migration precedes removal |
| `F-STATE-REDUCER` | `STATE-REDUCER-001`; alias `NT-STATE-03` | Pure transition core, not an effect framework |
| `F-CLI-RUNTIME` | `NT-CLI-01`, `HIST-NODE-FLOOR-001` | CLI cleanup and engine-floor break are distinct |
| `F-VALIDATION` | `NT-VAL-01`, `TEST-VALIDATION` | Production removal owns dependent test change |
| `F-SHELL-POLICY` | `HIST-POLICY-PARSER-001` | Policy-parser replacement is a dependency transfer |
| `F-HOST-SURFACE` | `PLAT-HOST-SINGLETON-001`, `PLAT-HOST-SUBSET-001`; legacy aliases `PLAT-HOST-CODEX` and `PLAT-HOST-RETIRE` | Exact host-set mini-contracts; no telemetry, no recommendation |
| `F-PACKAGE-TOPOLOGY` | `PLAT-PKG-ONDEMAND`, `PLAT-PKG-OPTIONAL`, `PLAT-PKG-WORKSPACE`, `PLAT-PKG-EXPORTS`, `PLAT-SPLIT-001`, `PLAT-GEN-FIRST-RUN-001`; aliases `PLAT-PKG-SPLIT`, `PLAT-PKG-RUNTIME`, `TN-P02` | Topology changes ownership and install shape; organization alone deletes nothing |
| `F-DELIVERY-CHANNEL` | `PLAT-STABLE-001`, `PLAT-DIST-001`, `PLAT-TAR-001`, `PLAT-NPM-001`, `PLAT-REGISTRY-001`, `PLAT-DIST-RELEASE`, `PLAT-DIST-TARBALL`, `PLAT-REL-NOIDEM`; alias `PLAT-GEN-REG` | Channel retirement requires a replacement journey |
| `F-PROTOCOL-SURFACE` | `TN-P01`, `TN-PROTOCOL-CLI-001`, `TN-PROTOCOL-JSONRPC-001`, `STATE-ACTION-001`, `STATE-RESOURCE-001` | Protocol choices own discovery, framing, schemas, permissions, errors, and clients |
| `F-UPSTREAM-SUBSTITUTION` | `PLAT-EXT-UPSTREAM`, `NT-AGENTS-SDK-001` | Externalization is not total-system deletion |
| `F-PERSISTENCE` | `STATE-EVENTLOG-001`, `STATE-SQLITE-001`, `STATE-CLIENT-001`, `STATE-HOSTED-001`, `STATE-EPHEMERAL-001`, `STATE-GIT-001`; alias `PLAT-NATIVE-SQL` | Select one authority; `STATE-PERSIST-GENERIC-RESOURCE` is only a rejected mini-contract |
| `F-HOSTED-TRANSFER` | `PLAT-HOSTED-MCP-001`, `PLAT-HOSTED-CONTENT-001`, `PLAT-HOSTED-COMPUTE-001`, `PLAT-HOSTED-FULL-001`, `PLAT-EXT-EDGE`, `PLAT-EXT-DAEMON`, `PLAT-EXT-THIN`; alias `PLAT-EXT-CONTAINER` maps only to `PLAT-HOSTED-COMPUTE-001` | Separate local client from remote owner and operations |
| `F-CAPABILITY-DELETE` | `STATE-SUBFEATURE-DEL`, `STATE-SESSION-DEL`, `STATE-MCP-DEL`, `NT-GENERIC-TOOLS-001`, `NT-PRODUCT-01`, `TN-P05`, `TN-DOC-PACK-001`; alias `TN-SERVERLESS-CONTENT-001` maps to `TN-P05` | Larger deletion supersedes internal refactors and dependent tests |
| `F-REWRITE` | `TN-REWRITE-GO`, `TN-REWRITE-RUST`, `TN-REWRITE-PYTHON`, `TN-REWRITE-DENO`, `TN-REWRITE-WASM`, `TN-P03`; alias `PLAT-NATIVE-BIN` maps to `TN-P03` | Alternatives are mutually exclusive replacement programs |
| `F-TEST-ORACLE` | `TEST-FIXTURE`, `TEST-MATRIX`, `TEST-MCP-CONTRACT`, `TEST-VALIDATION`, `TEST-SHIM`, `TEST-SCHEMA`, `TEST-PACKAGE`, `TEST-GENERATOR`, `TEST-STATE`, `TEST-SECURITY`, `TEST-CLI`, `TEST-EXEC`, `TEST-COVERAGE`, `TEST-PROPERTY`, `TEST-RADICAL`, `TEST-BEHAVIOR-DEL` | Test effects are parent-bound and all nets are `U` |
| `F-ABSTRACTION` | `TN-DECORATORS-001`, `TN-DI-001`, `TN-PORTS-001`, `TN-REFLECTION-001`, `TN-EFFECTS-001`, `TN-CQRS-ES-001`, `TN-DSL-001`, `NT-AUX-ABSTRACTIONS-001` | Reject as size mechanisms without a net-negative measured lifecycle |

## Dependency and exclusion graph

| Edge | Exact semantic IDs | Consequence |
|---|---|---|
| requires | `NT-ART-01` before delivery retirement; `PLAT-EXT-THIN` requires `PLAT-HOSTED-MCP-001` plus auth/version/fallback; `STATE-EXPORTS-001` requires a deep-import gate | Do not evaluate child removal first |
| enables | `STATE-WORKSPACE-001` → `STATE-SNAPSHOT-001` → `STATE-REDUCER-001` → `STATE-EXPORTS-001`; `NT-CONTENT-01` → `NT-CONTENT-03` | Sequence migrations |
| conditional-on | `PLAT-GEN-FIRST-RUN-001` on package authority; `PLAT-GEN-SINGLE` on an approved `PLAT-HOST-SINGLETON-001`; `TN-G01` on authored-output ownership | No unconditional net |
| alternatives | `PLAT-PKG-ONDEMAND`, `PLAT-PKG-OPTIONAL`, `PLAT-PKG-WORKSPACE`, `PLAT-SPLIT-001`; delivery records; persistence records; rewrite records | Select one posture per decision |
| protocol alternatives | `TN-P01`, `TN-PROTOCOL-CLI-001`, `TN-PROTOCOL-JSONRPC-001`, `PLAT-EXT-UPSTREAM`, `NT-AGENTS-SDK-001` versus retained MCP | Preserve named parity or disclose loss |
| hosted alternatives | `PLAT-EXT-EDGE`, `PLAT-EXT-DAEMON`, `PLAT-HOSTED-COMPUTE-001`, `PLAT-HOSTED-FULL-001` | Do not sum local or remote effects |
| overlaps | `STATE-ACTION-001` and `STATE-RESOURCE-001` overlap tool catalog/deletion; generator records overlap; state primitives overlap | Keep union `U` |
| supersedes | `STATE-SESSION-DEL` supersedes state subfeatures; `STATE-MCP-DEL` supersedes MCP/state work; `TN-DOC-PACK-001` supersedes executable work | Count only chosen parent |
| transfers-cost-to | Package split → release/version owners; hosted → auth/operations; upstream → provider/dependency; client state → host integration | Repository-local is not total-system |
| invalidates | Host retirement invalidates unique-host work; state deletion invalidates state refactors; Claude journey retirement invalidates policy-parser work | Remove invalidated children |
| test-overlay-of | Every `TEST` record belongs to a named production or deletion parent | Never compose TEST inventory |
| preserves-floor | Static wire, SDK, raw package/tar, security, persistence, generator, host, and CLI oracles | Implementation tests may shrink only after ownership proof |

## Normalized option ledger

Semantic IDs are authoritative. Numeric positions are display-only. The ledger
contains exactly 96 live records: 78 architecture/product records, 16 `TEST`
overlays, and 2 late `HIST` records. The two retired IDs are outside this
count.

Each row exposes: mechanism/evidence, disposition, Tracks, compatibility,
journey loss, quantitative class/key, retained/lost journey, pros, cons,
security/operations, relationships, migration/rollback, Owner, `M/O/S/L`,
confidence, validation, and disconfirming evidence.

### Architecture and product records, positions 1–40

| Pos | Semantic ID / family / Tracks | Mechanism, evidence, disposition, C/J, delta | Retained/lost journey, pros, cons, security/operations | Relationships and migration/rollback | Owner, M/O/S/L, Conf/V/! |
|---:|---|---|---|---|---|
| 1 | `TN-N01`; `F-NORM`; `TN` | **Mech/Ev:** replace one-use wrappers/classes with named functions; `EV-MCP`, `EV-CTX`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** all behavior / internal indirection. **Pro:** smallest seam. **Con:** may flatten a real boundary. **Sec/Ops:** preserve centralized authorization and errors. | **Rel:** base for `TN-N02`; overlaps targeted contractions. **Mig/RB:** bounded slices / revert slice. | **Owner:** maintainers. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** high / owner tests and source/release gates / growth or duplicated policy. |
| 2 | `TN-N02`; `F-NORM`; `TN` | **Mech/Ev:** merge pass-through modules by cohesive responsibility; `EV-MCP`, `EV-GEN`, `EV-STATE`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** behavior / glue. **Pro:** clearer ownership. **Con:** oversized modules. **Sec/Ops:** retain layer and containment boundaries. | **Rel:** overlaps `TN-N01` and domain families. **Mig/RB:** one responsibility / revert move. | **Owner:** maintainers. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** medium-high / import, behavior, package gates / new cross-layer dependency. |
| 3 | `TN-R01`; `F-NORM`; `TN` | **Mech/Ev:** narrow code-native metamodel only for facts projected repeatedly; `EV-RUNTIME`. **Disp:** conditional. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** behavior / duplicated facts. **Pro:** drift reduction. **Con:** schema/render/debug burden. **Sec/Ops:** one bad fact fans out. | **Rel:** alternative to `TN-REFLECTION-001` and `TN-DSL-001`. **Mig/RB:** spike one projection / retain old renderer. | **Owner:** architecture. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium / byte-identical independent outputs / nonnegative measured diff. |
| 4 | `NT-DOC-01`; `F-NORM`; `NT` | **Mech/Ev:** remove type-duplicating JSDoc and narration; `EV-VALIDATION`, `EV-GEN`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** rationale/security/failure contracts / redundant prose. **Pro:** less drift. **Con:** accidental rationale loss. **Sec/Ops:** security comments are a floor. | **Rel:** overlaps later file deletion. **Mig/RB:** category review / restore text. | **Owner:** maintainers. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** high / human and doc-drift review / removed unique information. |
| 5 | `NT-ART-01`; `F-ARTIFACT-POLICY`; `NT` | **Mech/Ev:** one normalized artifact specification with raw independent oracles; `EV-ARTIFACT`, `EV-PACK`. **Disp:** frontier. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** all package/delivery journeys / duplicate model logic. **Pro:** one authority. **Con:** shared blast radius. **Sec/Ops:** denied paths, raw pack/tar/install/startup stay independent. | **Rel:** prerequisite for delivery retirement; aliases `PLAT-POLICY-N` and `PLAT-POLICY-B`. **Mig/RB:** dual-compare manifests / revert authority. | **Owner:** package/release. **M/O/S/L:** M2/O1/S0/L1. **Conf/V/!:** high / raw artifacts and gates / oracle derives from production model. |
| 6 | `NT-MCP-01`; `F-MCP-CATALOG`; `NT` | **Mech/Ev:** pack-local co-location of schema, description, workspace policy, handler projection, and post-call metadata; `EV-MCP`, `EV-TOOLS`. **Disp:** conditional spike. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** five packs, `registerCommandTable`, pipeline order, registry metadata, real SDK, static fixtures / pack-local duplication only. **Pro:** locality. **Con:** co-location may not shrink. **Sec/Ops:** auth/workspace/post-call order explicit. | **Rel:** no global catalog by default; overlaps `NT-MCP-03`. **Mig/RB:** one pack parity spike / revert pack. | **Owner:** MCP. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** medium / wire, SDK, pipeline, fixtures / boundary loss or nonnegative diff. |
| 7 | `NT-MCP-03`; `F-MCP-CATALOG`; `NT` | **Mech/Ev:** explicit narrow workspace value; remove proven-dead ambient services; `EV-CTX`, `EV-STATE`. **Disp:** conditional frontier. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** workspace behavior / ambient coupling. **Pro:** explicit flow. **Con:** parameter churn. **Sec/Ops:** never restore cwd/env fallback. | **Rel:** overlaps `STATE-WORKSPACE-001`. **Mig/RB:** adapt packs inward / boundary adapter. | **Owner:** MCP/state. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium / isolation and no-fallback tests / service is live or context widens. |
| 8 | `STATE-ACTION-001`; `F-PROTOCOL-SURFACE`; `TN+NT` | **Mech/Ev:** generic action dispatch; `EV-MCP`, `EXT-MCP`. **Disp:** rejected absent a strict tool ceiling. **C/J:** C2/J1. **Delta:** `ISE-STATE-ACTION`, record-local only. | **Keep/Lose:** mutations / named discovery, schema, permission and consent granularity. **Pro:** fewer named handlers. **Con:** client and auth complexity. **Sec/Ops:** action-level policy becomes critical. | **Rel:** alternative to named tools; overlaps `STATE-MCP-DEL`. **Mig/RB:** dual expose / restore names. | **Owner:** product/MCP/security. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** low / client discovery and authorization parity / strict ceiling absent. |
| 9 | `STATE-RESOURCE-001`; `F-PROTOCOL-SURFACE`; `TN+NT` | **Mech/Ev:** expose eligible reads as MCP resources/prompts while mutations remain tools; `EV-MCP`, `EXT-MCP`. **Disp:** rejected as reduction alone. **C/J:** C1 or C2/J1. **Delta:** `ISE-STATE-RESOURCE`, record-local only. | **Keep/Lose:** selected reads and mutations / unsupported-client access mode. **Pro:** protocol-native reads. **Con:** cross-client variance. **Sec/Ops:** resource authorization/cache semantics. | **Rel:** protocol option, not `STATE-PERSIST-GENERIC-RESOURCE`. **Mig/RB:** dual surface / restore tools. | **Owner:** MCP/product. **M/O/S/L:** M2/O1/S0/L2. **Conf/V/!:** low / resource-capable client matrix / no cross-client parity or net gain. |
| 10 | `NT-CONTENT-01`; `F-CONTENT-AUTHORITY`; `NT` | **Mech/Ev:** generated registry becomes sole content authority; `EV-CONTENT`, `EV-RUNTIME`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** packaged content / source-checkout filesystem mode. **Pro:** deterministic authority. **Con:** editable workflow loss. **Sec/Ops:** less filesystem reach, greater registry blast radius. | **Rel:** enables `NT-CONTENT-03`. **Mig/RB:** dual-read parity / provider fallback release. | **Owner:** runtime/content. **M/O/S/L:** M2/O1/S0/L2. **Conf/V/!:** medium / detached and source startup / supported install needs filesystem. |
| 11 | `NT-CONTENT-02`; `F-CONTENT-AUTHORITY`; `NT` | **Mech/Ev:** pack fully rendered agent content; `EV-GEN`, `EV-RUNTIME`. **Disp:** rejected as assumed reduction. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** content / compact representation. **Pro:** less runtime materialization. **Con:** unproved package benefit. **Sec/Ops:** larger embedded audit surface possible. | **Rel:** alternative representation. **Mig/RB:** isolated format experiment / compact profile. | **Owner:** content/package. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** medium / package and startup comparison / measured total benefit. |
| 12 | `NT-CONTENT-03`; `F-CONTENT-AUTHORITY`; `NT` | **Mech/Ev:** immutable startup content snapshot; `EV-CONTENT`. **Disp:** conditional, not standalone size claim. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** content/wire / repeated parsing. **Pro:** predictable reads. **Con:** invalidation and memory. **Sec/Ops:** immutable integrity boundary. | **Rel:** requires `NT-CONTENT-01`. **Mig/RB:** shadow provider / old provider. | **Owner:** runtime/content. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** medium / behavior and benchmark / registry-only does not land. |
| 13 | `NT-GEN-01`; `F-GENERATION-GRAPH`; `NT` | **Mech/Ev:** plan all outputs then reconcile writes/stale deletion; `EV-GEN`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** generated paths/bytes/failures / scattered write logic. **Pro:** one collision model. **Con:** memory and central blast radius. **Sec/Ops:** validate destinations before writes. | **Rel:** overlaps `NT-GEN-02` and `NT-RUNTIME-01`. **Mig/RB:** compare plans / old writer. | **Owner:** generator. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium-high / independent byte/path/drift corpus / output or failure difference. |
| 14 | `NT-GEN-02`; `F-GENERATION-GRAPH`; `NT` | **Mech/Ev:** explicit compile-visible transform/resource/hook maps; `EV-GEN`, `EV-RUNTIME`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** outputs / dynamic discovery. **Pro:** searchable graph. **Con:** catalog maintenance. **Sec/Ops:** smaller dynamic-load surface. | **Rel:** overlaps other generation records. **Mig/RB:** parallel maps / discovery. | **Owner:** generator. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium / drift and orphan tests / explicit map exceeds removed discovery. |
| 15 | `NT-RUNTIME-01`; `F-GENERATION-GRAPH`; `NT` | **Mech/Ev:** one code-native runtime metamodel with independent package oracle; `EV-RUNTIME`, `EV-ARTIFACT`. **Disp:** frontier. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** four host outputs / repeated host facts. **Pro:** less drift. **Con:** descriptor can become a god object. **Sec/Ops:** shared-fact blast radius. | **Rel:** extends current declarations; overlaps generation. **Mig/RB:** fact family at a time / old fields. | **Owner:** platform/generator. **M/O/S/L:** M2/O1/S0/L1. **Conf/V/!:** high seam / runtime/package parity / facts are consumer-specific. |
| 16 | `TN-G01`; `F-GENERATION-GRAPH`; `TN` | **Mech/Ev:** directly author four-host outputs and delete generator ownership; `EV-GEN`. **Disp:** rejected under four hosts. **C/J:** C0/J0. **Delta:** `ISE-G01` only. | **Keep/Lose:** outputs / automated projection. **Pro:** no generator runtime. **Con:** manual parity and drift burden. **Sec/Ops:** duplicated policy fixes. | **Rel:** alternative to generation; may change after host contraction. **Mig/RB:** dual compare / restore generator. | **Owner:** every host maintainer. **M/O/S/L:** M3/O2/S0/L2. **Conf/V/!:** medium / independent outputs and drift / ownership scenario does not hold. |
| 17 | `PLAT-GEN-SINGLE`; `F-GENERATION-GRAPH`; `TN+NT` | **Mech/Ev:** directly author one approved host surface; `EV-GEN`, `EV-RUNTIME`. **Disp:** conditional after host decision. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** retained host / generator for that host. **Pro:** simpler single-owner surface. **Con:** manual drift. **Sec/Ops:** retain package and policy oracle. | **Rel:** requires `PLAT-HOST-SINGLETON-001`. **Mig/RB:** byte-parity dual run / generator. | **Owner:** retained-host platform. **M/O/S/L:** M2/O1/S0/L1. **Conf/V/!:** low / host package/startup/drift / more than one host remains. |
| 18 | `STATE-SNAPSHOT-001`; `F-STATE-SNAPSHOT`; `TN+NT` | **Mech/Ev:** flatten persisted snapshot/conversion layers; `EV-STATE`, `EV-STATE-TEST`. **Disp:** frontier. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** persistence, migration, checkpoints, recovery / intermediate shapes. **Pro:** simpler model. **Con:** migration burden. **Sec/Ops:** reject future/corrupt data. | **Rel:** follows `STATE-WORKSPACE-001`; enables `STATE-REDUCER-001`. **Mig/RB:** dual parser/corpus / compatible reader. | **Owner:** state. **M/O/S/L:** M2/O1/S0/L2. **Conf/V/!:** medium / raw corpus and recovery / adapters exceed simplification. |
| 19 | `STATE-WORKSPACE-001`; `F-WORKSPACE-CONTEXT`; `TN+NT` | **Mech/Ev:** narrow explicit workspace value at state boundaries; `EV-CTX`, `EV-STATE`. **Disp:** frontier. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** state location/isolation / untyped root plumbing. **Pro:** explicit ownership. **Con:** adapters may add code. **Sec/Ops:** approved-root containment. | **Rel:** overlaps `NT-MCP-03`; precedes snapshot. **Mig/RB:** adapt inward / aliases. | **Owner:** MCP/state. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium-high / multi-workspace containment / broad context bag. |
| 20 | `STATE-EXPORTS-001`; `F-EXPORT-SHIM`; `NT` | **Mech/Ev:** retire compatibility export/deep-import shims after consumer migration; `EV-ARTIFACT`, `EV-STATE-TEST`, `EXT-NODE-PACKAGES`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** supported public API / legacy deep imports. **Pro:** smaller public surface. **Con:** unknown consumers. **Sec/Ops:** fewer reachable internals. | **Rel:** owns `TEST-SHIM`; state/MCP deletion supersedes. **Mig/RB:** exports/deprecation then major / restore shim. | **Owner:** package/state. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** medium-low / installed deep-import audit / supported consumer exists. |
| 21 | `STATE-REDUCER-001`; `F-STATE-REDUCER`; `TN+NT` | **Mech/Ev:** pure transition returns next state/effects; `EV-TRANSITION`, `EV-STATE`. **Disp:** frontier after invariants. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** state behavior / scattered mutation. **Pro:** deterministic invariants. **Con:** effect descriptions can add ceremony. **Sec/Ops:** centralize legality, not general effects. | **Rel:** follows workspace/snapshot. **Mig/RB:** shadow transitions / old dispatch. | **Owner:** state. **M/O/S/L:** M2/O1/S0/L1. **Conf/V/!:** medium / idempotence and fault tests / net growth or missing invariant. |
| 22 | `STATE-EVENTLOG-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** append-only log plus projections; `EV-STATE`. **Disp:** rejected as default reduction. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** durable capability / snapshot authority. **Pro:** audit/replay. **Con:** projections, compaction, erasure. **Sec/Ops:** immutable history conflicts with privacy deletion. | **Rel:** alternative persistence; not `TN-CQRS-ES-001`. **Mig/RB:** dual write/read / snapshot release. | **Owner:** state/security. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** low / replay, recovery, erasure / no audit requirement. |
| 23 | `STATE-SQLITE-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** transactional SQLite state authority; `EV-STATE`, `EXT-NODE-SQLITE`. **Disp:** conditional. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** durable local state / text-file inspectability. **Pro:** transactions/locking. **Con:** schema, backup, platform support. **Sec/Ops:** permissions, corruption, migration. | **Rel:** alias `PLAT-NATIVE-SQL`; alternative persistence; current engine contract gates native module. **Mig/RB:** dual store/corpus / export old snapshots. | **Owner:** state/platform. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** medium / crash/concurrency/migration / platform floor or complexity fails. |
| 24 | `STATE-CLIENT-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** move durable state to host/client; `EV-STATE`. **Disp:** conditional transfer. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** state if host supports it / uniform local/offline behavior. **Pro:** smaller server. **Con:** every client re-owns semantics. **Sec/Ops:** host isolation, version and erasure. | **Rel:** alternative persistence; cost moves to clients. **Mig/RB:** dual synchronize / local store. | **Owner:** host integrations. **M/O/S/L:** M3/O2/S1/L3. **Conf/V/!:** low / cross-host durability parity / host API gap. |
| 25 | `STATE-HOSTED-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** remote state service; `EV-STATE`, `EXT-MCP`. **Disp:** conditional transfer. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** connected persistence/sync / offline/local-only. **Pro:** shared concurrency. **Con:** backend/auth/tenancy. **Sec/Ops:** privacy, residency, SLO, incident response. | **Rel:** alternative persistence; may pair with `PLAT-EXT-THIN`. **Mig/RB:** dual sync/export / local release. | **Owner:** state/operations/security. **M/O/S/L:** M4/O4/S3/L2. **Conf/V/!:** low / end-to-end sync, auth, erasure / remote total exceeds value. |
| 26 | `STATE-EPHEMERAL-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** in-memory/session-lifetime state only; `EV-STATE`. **Disp:** product option. **C/J:** C2/J2. **Delta:** U. | **Keep/Lose:** live-session behavior / durability, recovery, lineage. **Pro:** no durable store. **Con:** data loss. **Sec/Ops:** smaller stored-data surface, explicit loss UX. | **Rel:** alternative persistence; capability deletion boundary. **Mig/RB:** export warning and cutover / durable release. | **Owner:** product/state. **M/O/S/L:** M3/O0/S0/L1. **Conf/V/!:** high mechanism / journey acceptance / durability required. |
| 27 | `STATE-GIT-001`; `F-PERSISTENCE`; `TN+NT` | **Mech/Ev:** Git-backed persistence; `EV-STATE`. **Disp:** rejected as default, conditional niche. **C/J:** C2/J0. **Delta:** `ISE-STATE-GIT` only. | **Keep/Lose:** durable inspectable state / simple transactions. **Pro:** history/merge. **Con:** conflicts, repo growth, secrets. **Sec/Ops:** identity, recovery, privacy erasure. | **Rel:** alternative persistence. **Mig/RB:** dual read/write / snapshot store. | **Owner:** state/repository. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** low / conflict, crash, erasure corpus / transaction or privacy failure. |
| 28 | `NT-CLI-01`; `F-CLI-RUNTIME`; `NT` | **Mech/Ev:** consolidate parsing, main guards, summaries, errors with small helpers; `EV-CLI`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** flags, output, dry-run, exit / bespoke glue. **Pro:** simpler bins. **Con:** hidden command differences. **Sec/Ops:** path and dry-run explicit. | **Rel:** independent of Node-floor option. **Mig/RB:** one entrypoint / revert helper. | **Owner:** CLI. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** high / installed-bin oracle / stdout, stderr, path, or exit changes. |
| 29 | `NT-VAL-01`; `F-VALIDATION`; `NT` | **Mech/Ev:** compress repeated stage/rule glue while retaining explicit order; `EV-VALIDATION`. **Disp:** frontier. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** violations/profile / implementation layer. **Pro:** smaller pipeline. **Con:** metaprogramming may hide order. **Sec/Ops:** fail-fast/schema floors. | **Rel:** parent of `TEST-VALIDATION`. **Mig/RB:** compare corpus / old stage. | **Owner:** validation. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** high / order/context corpus / observable violation changes. |
| 30 | `PLAT-HOST-SINGLETON-001`; `F-HOST-SURFACE`; `TN+NT` | **Mech/Ev:** retain exactly one host; `EV-RUNTIME`, `EV-PACK`, `EXT-CLAUDE`, `EXT-CODEX`. **Disp:** conditional, no recommendation. **C/J:** C2/J2. **Delta:** `DP-HOST-*`; Codex mini-contract also `DP-CODEX-P`, `DP-CODEX-G`, `DP-CODEX-N`. | **Keep/Lose:** selected host / three host journeys. **Pro:** smaller visible surface. **Con:** ecosystem abandonment. **Sec/Ops:** deprecation/support and replacement. | **Rel:** four mini-contracts below; Codex alias `PLAT-HOST-CODEX`. **Mig/RB:** telemetry, deprecate, major / last multi-host release. | **Owner:** product/platform. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** high path, unknown adoption / real host installs/startup / material removed-host usage. |
| 31 | `PLAT-HOST-SUBSET-001`; `F-HOST-SURFACE`; `TN+NT` | **Mech/Ev:** retain an exact pair or triple of hosts; `EV-RUNTIME`, `EV-PACK`, `EXT-CLAUDE`, `EXT-CODEX`. **Disp:** conditional, no recommendation. **C/J:** C2/J2. **Delta:** `DP-HOST-*`. | **Keep/Lose:** selected hosts / excluded host journeys. **Pro:** bounded support. **Con:** shared dependency closure unknown. **Sec/Ops:** replacement and deprecation. | **Rel:** six pair and four triple mini-contracts below; legacy alias `PLAT-HOST-RETIRE`. **Mig/RB:** telemetry, deprecate / prior release. | **Owner:** product/platform. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** high visible paths, unknown adoption / installs/startup / usage or closure reverses value. |
| 32 | `PLAT-PKG-ONDEMAND`; `F-PACKAGE-TOPOLOGY`; `TN+NT` | **Mech/Ev:** download signed host payload on demand with cache/offline rules; `EV-PACK`. **Disp:** conditional install optimization. **C/J:** C2/J1. **Delta:** `GI-ONDEMAND` only; net U. | **Keep/Lose:** connected selected payload / universal immediate/offline install. **Pro:** smaller initial install. **Con:** downloader/cache/storage. **Sec/Ops:** signing, pinning, availability. | **Rel:** alternative topology; overlaps host package inventory. **Mig/RB:** opt-in dual package / universal package. | **Owner:** package/operations. **M/O/S/L:** M3/O2/S2/L2. **Conf/V/!:** medium gross, low net / signed offline install / network or cache unacceptable. |
| 33 | `PLAT-PKG-OPTIONAL`; `F-PACKAGE-TOPOLOGY`; `TN+NT` | **Mech/Ev:** optional host payload or tool-pack dependency. **Disp:** repository reduction rejected; conditional install shape. **C/J:** C2/J1 host or C2/J2 tool pack. **Delta:** U. | **Keep/Lose:** selected optional feature / absent host or capability. **Pro:** selectable install. **Con:** optional dependencies alone remove no first-party monolith bytes. **Sec/Ops:** supply-chain and missing-feature handling. | **Rel:** alternative topology. **Mig/RB:** publish dual shape / monolith. | **Owner:** package/product. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** high rule / clean optional installs / monolith still carries bytes. |
| 34 | `PLAT-PKG-WORKSPACE`; `F-PACKAGE-TOPOLOGY`; `TN+NT` | **Mech/Ev:** internal workspace or independently versioned packages. **Disp:** organizational only unless product gate. **C/J:** internal C1/J0; independent C2/J0. **Delta:** U. | **Keep/Lose:** capability / monolithic versioning simplicity. **Pro:** ownership boundaries. **Con:** manifests, releases, skew. **Sec/Ops:** more package units. | **Rel:** alternative to `PLAT-SPLIT-001`; organization alone deletes nothing. **Mig/RB:** workspace first / monolith. | **Owner:** package/release. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** high topology / publish/install matrix / no owner or measured benefit. |
| 35 | `PLAT-PKG-EXPORTS`; `F-PACKAGE-TOPOLOGY`; `NT` | **Mech/Ev:** additive subpath exports or deep-import narrowing; `EV-PACK`, `EXT-NODE-PACKAGES`. **Disp:** interface option, not byte deletion. **C/J:** additive C1/J0; narrowing C2/J1. **Delta:** U. | **Keep/Lose:** supported entrypoints / undeclared deep imports if narrowed. **Pro:** explicit interface. **Con:** breakage without size change. **Sec/Ops:** limits internal reach. | **Rel:** prerequisite to `STATE-EXPORTS-001`; complements `PLAT-SPLIT-001`. **Mig/RB:** additive exports, audit, major / restore paths. | **Owner:** package. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** high / installed imports / active deep consumer. |
| 36 | `PLAT-SPLIT-001`; `F-PACKAGE-TOPOLOGY`; `TN+NT` | **Mech/Ev:** shared core plus per-host packages; `EV-RUNTIME`, `EV-PACK`, `EXT-NODE-PACKAGES`. **Disp:** conditional install optimization. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** hosts via separate packages / one universal package journey. **Pro:** selected install. **Con:** manifests, versions, workflows, aggregate duplication. **Sec/Ops:** more supply-chain units. | **Rel:** aliases `PLAT-PKG-SPLIT`, `PLAT-PKG-RUNTIME`, `TN-P02`. **Mig/RB:** publish beside monolith / universal package. | **Owner:** package/release. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** medium / all package/install paths / aggregate cost exceeds goal. |
| 37 | `PLAT-GEN-FIRST-RUN-001`; `F-PACKAGE-TOPOLOGY`; `TN+NT` | **Mech/Ev:** install-hook or first-run generation. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** generated capability when scripts/runtime available / immutable, scripts-disabled, offline journey. **Pro:** smaller prebuilt payload possible. **Con:** reproducibility/startup failures. **Sec/Ops:** install execution and cache integrity. | **Rel:** conditional on package authority; alternative to prebuilt payload. **Mig/RB:** opt-in and cache / prebuilt universal. | **Owner:** package/runtime/security. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** low / clean scripts-disabled/offline installs / supported environment cannot generate. |
| 38 | `PLAT-STABLE-001`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** stable-only publishing; `EV-WORKFLOW`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** `GI-STABLE-W` only; net U. | **Keep/Lose:** stable / preview, RC, nightly, prerelease journeys. **Pro:** fewer workflows/credentials. **Con:** less staged validation. **Sec/Ops:** stable blast radius. | **Rel:** alternative release posture. **Mig/RB:** bridge release / restore workflows. | **Owner:** release/product. **M/O/S/L:** M3/O1/S1/L1. **Conf/V/!:** high gross / real release dry-run / prerelease safety required. |
| 39 | `PLAT-DIST-001`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** retire dist-branch authority after marketplace replacements; `EV-WORKFLOW`, `EXT-CLAUDE`, `EXT-CODEX`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** replacement marketplaces / dist install. **Pro:** fewer authorities. **Con:** marketplace migration/support. **Sec/Ops:** provenance and rollback. | **Rel:** requires `NT-ART-01` and replacements. **Mig/RB:** dual publish / restore dist. | **Owner:** release/platform. **M/O/S/L:** M3/O1/S1/L2. **Conf/V/!:** medium / real installs / marketplace gap. |
| 40 | `PLAT-TAR-001`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** retire current tar/archive journey after replacement; `EV-PACK`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** retained channels / archive and offline path. **Pro:** less packaging. **Con:** removes portable artifact. **Sec/Ops:** remaining channel signing/provenance. | **Rel:** alternative delivery; `PLAT-DIST-TARBALL` is a different authority option. **Mig/RB:** replacement installer / restore archive. | **Owner:** release/product. **M/O/S/L:** M3/O1/S1/L2. **Conf/V/!:** medium / raw archive oracle / offline journey required. |

### Architecture and product records, positions 41–78

| Pos | Semantic ID / family / Tracks | Mechanism, evidence, disposition, C/J, delta | Retained/lost journey, pros, cons, security/operations | Relationships and migration/rollback | Owner, M/O/S/L, Conf/V/! |
|---:|---|---|---|---|---|
| 41 | `PLAT-NPM-001`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** retire npm after a complete replacement path; `EV-PACK`, `EXT-CLAUDE`, `EXT-CODEX`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** replacement installer/marketplaces / npm discovery/install/update. **Pro:** one less channel. **Con:** ecosystem loss. **Sec/Ops:** replacement provenance, updates, support. | **Rel:** alternative delivery; requires artifact authority and adoption evidence. **Mig/RB:** dual publish / npm release. | **Owner:** release/product. **M/O/S/L:** M3/O1/S1/L2. **Conf/V/!:** low / replacement install matrix / npm remains required. |
| 42 | `PLAT-REGISTRY-001`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** normalize registry/generation delivery authority; `EV-RUNTIME`, `EV-PACK`. **Disp:** conditional. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** host payloads / duplicate registry facts. **Pro:** one authority. **Con:** registry blast radius. **Sec/Ops:** signing/provenance and fallback. | **Rel:** alias `PLAT-GEN-REG`; overlaps package and generation records. **Mig/RB:** dual compare / old registry. | **Owner:** platform/package. **M/O/S/L:** M2/O1/S1/L1. **Conf/V/!:** medium / real package/runtime parity / authority does not cover every host. |
| 43 | `PLAT-DIST-RELEASE`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** GitHub Release-only authority; `EV-WORKFLOW`, `EXT-CLAUDE`, `EXT-CODEX`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** `GI-DIST-RELEASE` only; net U. | **Keep/Lose:** signed release artifact / npm and dist journeys absent replacement installer. **Pro:** concentrated release authority. **Con:** mirror/installer/support. **Sec/Ops:** signing, provenance, availability. | **Rel:** alternative to `PLAT-DIST-TARBALL` and `PLAT-NPM-001`. **Mig/RB:** dual channels / prior channels. | **Owner:** release/operations. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** medium gross, low net / real release install / replacement incomplete. |
| 44 | `PLAT-DIST-TARBALL`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** non-registry tarball becomes authority; `EV-PACK`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** `GI-DIST-TARBALL` only; net U. | **Keep/Lose:** tar installer/offline artifact / registry-native discovery/update. **Pro:** portable authority. **Con:** installer, mirror, support. **Sec/Ops:** signing and corrupt/missing/extra checks. | **Rel:** alternative to `PLAT-DIST-RELEASE` and npm-only delivery. **Mig/RB:** dual publish / registry artifact. | **Owner:** release/operations. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** medium gross / real tar install / update or mirror journey fails. |
| 45 | `PLAT-REL-NOIDEM`; `F-DELIVERY-CHANNEL`; `TN+NT` | **Mech/Ev:** remove publisher idempotence and latest-repair behavior; `EV-WORKFLOW`. **Disp:** rejected. **C/J:** C0/J1. **Delta:** `GI-REL-NOIDEM` only; net U. | **Keep/Lose:** happy-path publish / safe retry and repair. **Pro:** gross code removal. **Con:** partial-release recovery loss. **Sec/Ops:** higher operator and credential risk during failures. | **Rel:** not additive with channel retirement. **Mig/RB:** no recommended migration / restore idempotent publisher. | **Owner:** release. **M/O/S/L:** M0/O1/S0/L0. **Conf/V/!:** high rejection / failure injection / reliable replacement exists. |
| 46 | `TN-P01`; `F-PROTOCOL-SURFACE`; `TN` | **Mech/Ev:** host-native or in-process replacement for MCP; `EV-MCP`. **Disp:** conditional replacement. **C/J:** C2/J1. **Delta:** `ISE-P01-ONE` or alternative `ISE-P01-FOUR` as gross record-local scenarios; net U. | **Keep/Lose:** chosen host-native capability / shared MCP and native clients depending variant. **Pro:** direct integration. **Con:** per-host adapters and parity. **Sec/Ops:** each host re-owns permissions/errors. | **Rel:** alternative to retained MCP and protocol records. **Mig/RB:** parity dual-run / MCP release. | **Owner:** host platform/product. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / forty-tool/session/gate parity / adapter burden or client loss. |
| 47 | `TN-PROTOCOL-CLI-001`; `F-PROTOCOL-SURFACE`; `TN` | **Mech/Ev:** replace MCP with CLI and JSON output; `EV-CLI`, `EV-MCP`, `EXT-MCP`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** scripted invocation / MCP discovery and native integration. **Pro:** ubiquitous process boundary. **Con:** framing, errors, auth, client migration. **Sec/Ops:** subprocess permissions and escaping. | **Rel:** alternative to `TN-PROTOCOL-JSONRPC-001` and retained MCP. **Mig/RB:** dual endpoint / MCP server. | **Owner:** CLI/product/security. **M/O/S/L:** M4/O2/S0/L2. **Conf/V/!:** low / all clients and error semantics / discovery or auth loss unacceptable. |
| 48 | `TN-PROTOCOL-JSONRPC-001`; `F-PROTOCOL-SURFACE`; `TN` | **Mech/Ev:** custom JSON-RPC protocol; `EV-MCP`, `EXT-MCP`. **Disp:** rejected as size assumption absent a strict ceiling. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** remote calls / MCP ecosystem and discovery. **Pro:** tailored surface. **Con:** re-own framing, schemas, errors, auth, clients. **Sec/Ops:** protocol hardening and versioning. | **Rel:** alternative to MCP/CLI/host-native. **Mig/RB:** dual server / MCP. | **Owner:** protocol/product/security. **M/O/S/L:** M4/O3/S2/L3. **Conf/V/!:** low / interoperability and adversarial protocol corpus / lifecycle exceeds MCP. |
| 49 | `PLAT-EXT-UPSTREAM`; `F-UPSTREAM-SUBSTITUTION`; `TN+NT` | **Mech/Ev:** transfer maintained workflow/platform behavior upstream; `EV-MCP`, `EV-RUNTIME`. **Disp:** conditional transfer. **C/J:** C2/J0, or J1 if local/offline lost. **Delta:** U. | **Keep/Lose:** capability through provider / local control or offline mode. **Pro:** less local ownership. **Con:** dependency/provider lock-in. **Sec/Ops:** external policy, incidents, exit plan. | **Rel:** alternative to local implementation; not total-system deletion. **Mig/RB:** dual-run and export / local provider. | **Owner:** platform/provider management. **M/O/S/L:** M4/O2/S2/L3. **Conf/V/!:** low / parity, package, offline, exit exercise / provider gap or cost. |
| 50 | `NT-AGENTS-SDK-001`; `F-UPSTREAM-SUBSTITUTION`; `NT` | **Mech/Ev:** use Agents SDK as adapter or product replacement; `EXT-AGENTS-SDK`, `EV-TOOLS`. **Disp:** conditional. **C/J:** adapter C0/J0; replacement C2/J2. **Delta:** U. | **Keep/Lose:** adapter can retain product; replacement may lose session/gate semantics. **Pro:** maintained primitives. **Con:** dependency/platform coupling. **Sec/Ops:** package, offline, hosted/sandbox policy. | **Rel:** upstream alternative. **Mig/RB:** forty-tool/session/gate parity dual-run / current stack. | **Owner:** platform/product/security. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / parity and package comparison / missing local/offline behavior. |
| 51 | `PLAT-HOSTED-MCP-001`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** remote MCP server with thin local client; `EV-MCP`, `EXT-MCP`. **Disp:** conditional local/install optimization. **C/J:** C2/J1. **Delta:** `GI-HOSTED-DIST` is gross ceiling only; N/I/X U. | **Keep/Lose:** connected MCP / local-only and offline server. **Pro:** smaller local distribution ceiling. **Con:** auth, tenancy, availability. **Sec/Ops:** OAuth resource server, abuse, incident response. | **Rel:** `PLAT-EXT-THIN` prerequisite/client; remote alternatives below. **Mig/RB:** local fallback and export / local server. | **Owner:** operations/security/MCP. **M/O/S/L:** M4/O4/S3/L2. **Conf/V/!:** high GI, low net / end-to-end auth/client parity / remote system outweighs local goal. |
| 52 | `PLAT-HOSTED-CONTENT-001`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** serve content remotely with pinned cache; `EV-CONTENT`. **Disp:** conditional transfer. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** connected content / embedded/offline content. **Pro:** smaller payload potential. **Con:** service, cache, versioning. **Sec/Ops:** signatures, availability, content provenance. | **Rel:** alternative to registry/filesystem content. **Mig/RB:** dual source/cache / bundled content. | **Owner:** content/operations/security. **M/O/S/L:** M4/O3/S2/L2. **Conf/V/!:** low / reproducible pinned content / offline or integrity failure. |
| 53 | `PLAT-HOSTED-COMPUTE-001`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** container-only remote compute; `EV-MCP`. **Disp:** conditional transfer. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** connected compute / local execution/offline. **Pro:** centralized runtime. **Con:** deploy, latency, tenancy. **Sec/Ops:** sandbox, secrets, quotas, SLO. | **Rel:** alias `PLAT-EXT-CONTAINER`; alternative to edge/daemon/full. **Mig/RB:** dual execution / local runtime. | **Owner:** operations/security. **M/O/S/L:** M4/O4/S3/L2. **Conf/V/!:** low / isolation, parity, load, rollback / local semantics required. |
| 54 | `PLAT-HOSTED-FULL-001`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** host MCP, state, content, and compute; `EXT-MCP`. **Disp:** conditional hosted-product replacement. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** connected product / local/offline ownership. **Pro:** smallest potential local client. **Con:** largest remote system. **Sec/Ops:** multi-tenant auth, privacy, compliance, SLO. | **Rel:** supersedes narrower hosted records when selected. **Mig/RB:** staged dual service/export / last local release. | **Owner:** operations/security/product. **M/O/S/L:** M4/O4/S3/L3. **Conf/V/!:** low / full-system acceptance and exit / total-system grows or offline required. |
| 55 | `PLAT-EXT-EDGE`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** edge/serverless remote execution; `EV-MCP`, `EXT-MCP`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** connected calls / Node filesystem/process semantics and offline. **Pro:** elastic placement. **Con:** runtime mismatch. **Sec/Ops:** auth, tenancy, observability. | **Rel:** alternative to container, daemon, full hosted. **Mig/RB:** compatibility dual-run / local server. | **Owner:** operations/platform. **M/O/S/L:** M4/O4/S3/L2. **Conf/V/!:** low / runtime parity and load / required filesystem/process behavior. |
| 56 | `PLAT-EXT-DAEMON`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** local daemon shared by thin host adapters; `EV-MCP`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** local capability / per-host standalone lifecycle. **Pro:** one local process. **Con:** IPC, upgrades, diagnostics. **Sec/Ops:** socket permissions and privilege boundary. | **Rel:** alternative to remote/container; pairs with thin adapters. **Mig/RB:** side-by-side daemon / embedded server. | **Owner:** platform/support/security. **M/O/S/L:** M3/O2/S0/L2. **Conf/V/!:** low / install, lifecycle, IPC failure / support burden dominates. |
| 57 | `PLAT-EXT-THIN`; `F-HOSTED-TRANSFER`; `TN+NT` | **Mech/Ev:** bins, transport, OAuth client, endpoint config, adapters, bootstrap/versioning and diagnostics only; `EXT-MCP`. **Disp:** prerequisite, not independent saving. **C/J:** fallback C1/J0; remote-only C2/J1. **Delta:** U. | **Keep/Lose:** connected/fallback client / local server when remote-only. **Pro:** small local boundary. **Con:** version/fallback/diagnostic complexity. **Sec/Ops:** token storage and endpoint trust. | **Rel:** requires `PLAT-HOSTED-MCP-001` plus auth/version/fallback. **Mig/RB:** fallback first / full local package. | **Owner:** client/platform/security. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** medium boundary, low net / endpoint/auth/fallback matrix / client boundary expands. |
| 58 | `STATE-SUBFEATURE-DEL`; `F-CAPABILITY-DELETE`; `TN+NT` | **Mech/Ev:** delete selected memory, history, or design-gate capability; `EV-MEMORY`, `EV-HISTORY`, `EV-DESIGN`. **Disp:** product frontier. **C/J:** C2/J2. **Delta:** U. | **Keep/Lose:** remaining session/content core / selected learning, lineage, recovery or approval journey. **Pro:** true deletion. **Con:** product value loss. **Sec/Ops:** erasure/migration of derived artifacts. | **Rel:** `STATE-SESSION-DEL` supersedes; variants not composable without a file manifest. **Mig/RB:** export/deprecate / last full release. | **Owner:** product/state. **M/O/S/L:** M3/O1/S0/L1. **Conf/V/!:** high boundary / retained-product acceptance / deleted journey remains required. |
| 59 | `STATE-SESSION-DEL`; `F-CAPABILITY-DELETE`; `TN+NT` | **Mech/Ev:** remove durable orchestration/session system; `EV-STATE`, `EV-TRANSITION`. **Disp:** aggressive product frontier. **C/J:** C2/J2. **Delta:** U. | **Keep/Lose:** content or stateless tools / sessions, gates, checkpoints, memory/history. **Pro:** true subsystem deletion. **Con:** core orchestration loss. **Sec/Ops:** data export/erasure and migration. | **Rel:** supersedes state and subfeature records. **Mig/RB:** export, major cutover / last session release. | **Owner:** product. **M/O/S/L:** M4/O1/S0/L2. **Conf/V/!:** high boundary / replacement-product acceptance / orchestration required. |
| 60 | `STATE-MCP-DEL`; `F-CAPABILITY-DELETE`; `TN+NT` | **Mech/Ev:** remove MCP server/tools and dependent state; `EV-MCP`, `EV-TOOLS`. **Disp:** maximum subsystem deletion. **C/J:** C2/J2. **Delta:** U. | **Keep/Lose:** non-MCP content/docs / all tool discovery/invocation. **Pro:** very broad true deletion. **Con:** executable integration disappears. **Sec/Ops:** migration and credential cleanup. | **Rel:** supersedes MCP, state, protocol and TEST work. **Mig/RB:** replacement product / last MCP release. | **Owner:** product. **M/O/S/L:** M4/O1/S0/L2. **Conf/V/!:** high boundary / replacement acceptance / MCP is product requirement. |
| 61 | `NT-GENERIC-TOOLS-001`; `F-CAPABILITY-DELETE`; `NT` | **Mech/Ev:** collapse named tools into generic operations; `EV-TOOLS`, `EXT-MCP`. **Disp:** rejected absent strict ceiling. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** generic operation / named discovery, permissions, consent, client ergonomics. **Pro:** fewer registrations. **Con:** weaker contracts. **Sec/Ops:** broader authority per tool. | **Rel:** overlaps `STATE-ACTION-001`; alternative to named tools. **Mig/RB:** dual expose / names. | **Owner:** product/MCP/security. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** low / client/auth parity / granularity required. |
| 62 | `NT-PRODUCT-01`; `F-CAPABILITY-DELETE`; `NT` | **Mech/Ev:** content-only MCP product; `EV-CONTENT`, `EV-MCP`. **Disp:** product frontier. **C/J:** C2/J2. **Delta:** U. | **Keep/Lose:** content delivery / orchestration, state, workspace mutation. **Pro:** true focused product. **Con:** most executable value removed. **Sec/Ops:** smaller mutation surface. | **Rel:** supersedes state/tool refactors. **Mig/RB:** new major/product identity / last full release. | **Owner:** product. **M/O/S/L:** M4/O1/S0/L2. **Conf/V/!:** high boundary / content-only acceptance / orchestration required. |
| 63 | `TN-P05`; `F-CAPABILITY-DELETE`; `TN` | **Mech/Ev:** serverless content-only product; `EV-CONTENT`. **Disp:** radical product option. **C/J:** C2/J2 plus J1 if offline content is lost. **Delta:** U. | **Keep/Lose:** remote content / state, session, workspace mutation, possibly offline content. **Pro:** narrow service. **Con:** remote ownership and product loss. **Sec/Ops:** content auth/provenance/availability. | **Rel:** alias `TN-SERVERLESS-CONTENT-001`; alternative to `NT-PRODUCT-01`. **Mig/RB:** parallel product / local full release. | **Owner:** product/operations. **M/O/S/L:** M4/O3/S2/L2. **Conf/V/!:** low net, high boundary / product and offline acceptance / remote system exceeds goal. |
| 64 | `TN-DOC-PACK-001`; `F-CAPABILITY-DELETE`; `TN` | **Mech/Ev:** replace executable with documentation/prompts. **Disp:** maximum total-system deletion. **C/J:** C2/J3. **Delta:** U. | **Keep/Lose:** human-readable guidance / executable behavior. **Pro:** true maximum deletion. **Con:** no automation, enforcement, state or integration. **Sec/Ops:** minimal runtime; manual process risk. | **Rel:** supersedes every executable option and dependent test. **Mig/RB:** separate product/archive / last executable release. | **Owner:** product. **M/O/S/L:** M4/O0/S0/L1. **Conf/V/!:** high deletion, product decision / user acceptance / executable requirement remains. |
| 65 | `TN-REWRITE-GO`; `F-REWRITE`; `TN` | **Mech/Ev:** full Go replacement. **Disp:** measured spike only. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** intended parity / Node implementation and ecosystem. **Pro:** possible single binary/simple runtime. **Con:** full parity migration. **Sec/Ops:** new dependency/CVE/build surface. | **Rel:** mutually exclusive rewrite; `TN-P03` is compiled-delivery variant. **Mig/RB:** parallel implementation / Node release. | **Owner:** platform/product. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / complete parity, packages, hosts, migrations / total system not smaller. |
| 66 | `TN-REWRITE-RUST`; `F-REWRITE`; `TN` | **Mech/Ev:** full Rust replacement. **Disp:** measured spike only. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** intended parity / Node ecosystem. **Pro:** compact native core potential. **Con:** FFI/build/contributor cost. **Sec/Ops:** unsafe/dependency/build audit. | **Rel:** mutually exclusive rewrite. **Mig/RB:** parallel / Node release. | **Owner:** platform/product. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / parity and cross-platform builds / lifecycle growth. |
| 67 | `TN-REWRITE-PYTHON`; `F-REWRITE`; `TN` | **Mech/Ev:** full Python replacement. **Disp:** measured spike only. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** intended parity / Node package/runtime. **Pro:** concise source potential. **Con:** distribution/runtime/dependency size. **Sec/Ops:** interpreter and supply chain. | **Rel:** mutually exclusive rewrite. **Mig/RB:** parallel / Node release. | **Owner:** platform/product. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / parity and isolated installs / distribution total grows. |
| 68 | `TN-REWRITE-DENO`; `F-REWRITE`; `TN` | **Mech/Ev:** Deno replacement/bundle. **Disp:** rejected absent non-size constraint. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** intended parity / current Node distribution. **Pro:** integrated tooling. **Con:** migration and binary/package burden. **Sec/Ops:** permissions and runtime support. | **Rel:** mutually exclusive rewrite. **Mig/RB:** spike / Node. | **Owner:** platform. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / parity and artifact comparison / no total benefit. |
| 69 | `TN-REWRITE-WASM`; `F-REWRITE`; `TN` | **Mech/Ev:** WASM core or replacement. **Disp:** rejected for this filesystem/process product. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** intended portable logic / direct host capabilities. **Pro:** sandbox portability. **Con:** adapters and capability mismatch. **Sec/Ops:** host-call boundary and sandbox policy. | **Rel:** mutually exclusive rewrite; may only fit a pure kernel. **Mig/RB:** isolated kernel spike / Node. | **Owner:** platform/security. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** high rejection / end-to-end parity / host adapter dominates. |
| 70 | `TN-P03`; `F-REWRITE`; `TN` | **Mech/Ev:** compiled Go or Rust binary delivery; `EV-WORKFLOW`. **Disp:** conditional product/distribution choice. **C/J:** C2/J0. **Delta:** `ISE-NATIVE-BUILD` combined burden only; binary bytes and net U. | **Keep/Lose:** intended capability / current runtime/install path. **Pro:** self-contained artifact. **Con:** multi-platform build/signing/CVE/support. **Sec/Ops:** provenance and patch cadence. | **Rel:** alias `PLAT-NATIVE-BIN`; requires a chosen rewrite. **Mig/RB:** parallel binaries / Node package. | **Owner:** platform/release/security. **M/O/S/L:** M4/O2/S1/L2. **Conf/V/!:** low / cross-platform release and parity / build burden or artifact size fails. |
| 71 | `TN-DECORATORS-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** annotation-driven cross-cutting registration. **Disp:** rejected as reduction mechanism. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** intended behavior / explicit ordering locality. **Pro:** compact annotations. **Con:** hidden metadata and tooling. **Sec/Ops:** auth/order harder to audit. | **Rel:** current explicit catalog/pipeline is preferred. **Mig/RB:** no broad migration / explicit functions. | **Owner:** architecture. **M/O/S/L:** M0/O0/S0/L0. **Conf/V/!:** high rejection / net-negative spike / repeated annotation removes more lifecycle code. |
| 72 | `TN-DI-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** dependency-injection container. **Disp:** rejected as size strategy. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** services / explicit construction. **Pro:** lifetimes/substitution. **Con:** mostly single implementations and implicit authority. **Sec/Ops:** hidden capability graph. | **Rel:** direct parameters/factories preferred. **Mig/RB:** no broad migration / explicit wiring. | **Owner:** architecture. **M/O/S/L:** M0/O0/S0/L0. **Conf/V/!:** high rejection / measured repeated-provider seam / real substitutions dominate. |
| 73 | `TN-PORTS-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** interfaces/adapters around broad internals. **Disp:** rejected broadly; retain real external/multi-provider seams. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** behavior / direct types. **Pro:** substitution boundary. **Con:** parallel types/adapters. **Sec/Ops:** can obscure concrete reach. | **Rel:** use only at storage/content/host providers with alternatives. **Mig/RB:** seam-by-seam / concrete type. | **Owner:** architecture. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** high / implementation-count inventory / single implementation remains. |
| 74 | `TN-REFLECTION-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** runtime reflection derives schemas/registration. **Disp:** rejected. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** intended behavior / compile-visible declarations. **Pro:** fewer declarations. **Con:** runtime failure/debugging. **Sec/Ops:** hidden authorization/schema derivation. | **Rel:** `TN-R01` is narrow safer alternative. **Mig/RB:** one-fact prototype / explicit declarations. | **Owner:** architecture/security. **M/O/S/L:** M1/O0/S0/L1. **Conf/V/!:** high rejection / compiler-visible independent prototype / audit or type safety weakens. |
| 75 | `TN-EFFECTS-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** general effect framework. **Disp:** rejected. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** behavior / direct async/services. **Pro:** typed composition. **Con:** vocabulary/adapters. **Sec/Ops:** may hide actual filesystem/network authority. | **Rel:** `STATE-REDUCER-001` captures the useful narrow property. **Mig/RB:** pure functions only / direct effects. | **Owner:** architecture. **M/O/S/L:** M0/O0/S0/L0. **Conf/V/!:** high rejection / net-negative spike / repeated effects dominate. |
| 76 | `TN-CQRS-ES-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** CQRS or full event-sourced system of record. **Disp:** rejected for reduction. **C/J:** C2/J0. **Delta:** U. | **Keep/Lose:** capability plus replay / simple model. **Pro:** audit/read models. **Con:** duplicate models/projections/consistency. **Sec/Ops:** immutable history and erasure conflict. | **Rel:** distinct from `STATE-EVENTLOG-001`. **Mig/RB:** only for mandatory audit / snapshot authority. | **Owner:** architecture/state/security. **M/O/S/L:** M4/O3/S2/L3. **Conf/V/!:** high rejection / audit requirement and full lifecycle / size remains goal. |
| 77 | `TN-DSL-001`; `F-ABSTRACTION`; `TN` | **Mech/Ev:** broad new DSL for tools/agents/runtimes/workflows. **Disp:** rejected broad form. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** generated behavior / native language tooling. **Pro:** compact declarations. **Con:** parser, schema, diagnostics, migration, editor. **Sec/Ops:** injection and validation surface. | **Rel:** `TN-R01` is narrow code-native alternative. **Mig/RB:** TypeScript data prototype / native declarations. | **Owner:** architecture/tooling. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** high rejection / full lifecycle and diagnostics / net-negative proof. |
| 78 | `NT-AUX-ABSTRACTIONS-001`; `F-ABSTRACTION`; `NT` | **Mech/Ev:** additional type helpers, caches, or packing layers; `EV-GEN`, `EV-CONTENT`. **Disp:** rejected absent a measured constraint. **C/J:** C1/J0. **Delta:** U. | **Keep/Lose:** behavior / simplicity. **Pro:** potential reuse/performance. **Con:** invalidation, formats, tests. **Sec/Ops:** stale or sensitive cache. | **Rel:** reconsider only for a named bottleneck. **Mig/RB:** isolated experiment / delete layer. | **Owner:** tooling/runtime. **M/O/S/L:** M1/O1/S0/L1. **Conf/V/!:** medium-high / benchmark/package diff / no net total benefit. |

### Verification overlays, positions 79–94

All sixteen records are quarantined overlays. Every net is `U`, no overlay is
independently composable, and no current executable test file was proven
wholly redundant. A future 239-file semantic owner manifest is required before
any test deletion claim.

| Pos | Semantic ID / family / Tracks | Mechanism, evidence, disposition, C/J, delta | Retained/lost journey, pros, cons, security/operations | Relationships and migration/rollback | Owner, M/O/S/L, Conf/V/! |
|---:|---|---|---|---|---|
| 79 | `TEST-FIXTURE`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** consolidate repeated setup into narrow helpers; `EV-TEST-OWNERS`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** assertions/scenarios / repeated setup. **Pro:** less duplication. **Con:** helper indirection. **Sec/Ops:** containment setup stays visible. | **Rel:** parent-bound; overlaps `TEST-MATRIX`. **Mig/RB:** one family / inline fixtures. | **Owner:** verification. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** low without manifest / same named cases / helper branches or hides security context. |
| 80 | `TEST-MATRIX`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** table-drive genuinely repeated cases; `EV-TEST-OWNERS`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** cases/failure identity / repeated harness. **Pro:** compact coverage. **Con:** dense matrices hide intent. **Sec/Ops:** denial cases explicit. | **Rel:** parent-bound; overlaps fixtures. **Mig/RB:** one suite / named tests. | **Owner:** verification. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** low / same cases and diagnostics / helper branching or lost identity. |
| 81 | `TEST-MCP-CONTRACT`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** remove only implementation-derived duplication; `EV-MCP-TEST`, `EV-SCHEMA-TEST`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** wire, SDK, type, errors, workspace / internal duplicates. **Pro:** fewer tautological checks. **Con:** black-box oracle can be lost. **Sec/Ops:** auth/workspace errors stay independent. | **Rel:** parent `NT-MCP-01`, `NT-MCP-03`, or tool deletion. **Mig/RB:** owner map / restore test. | **Owner:** MCP verification. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** low / real SDK and static wire / expectation still unique. |
| 82 | `TEST-VALIDATION`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** delete tests only for a removed validation layer; `EV-VALIDATION-TEST`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** observable violations/order / layer-specific checks. **Pro:** follows production simplification. **Con:** edge cases valuable. **Sec/Ops:** fail-fast/schema cases remain. | **Rel:** only parent `NT-VAL-01`. **Mig/RB:** semantic corpus / restore tests. | **Owner:** validation verification. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** low / full behavior corpus / production layer remains or case has no owner. |
| 83 | `TEST-SHIM`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** delete compatibility tests only with shim/API retirement; `EV-STATE-TEST`, `EXT-NODE-PACKAGES`. **Disp:** conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** supported imports / retired deep imports. **Pro:** exact dependent cleanup. **Con:** accidental break concealment. **Sec/Ops:** smaller import surface. | **Rel:** requires `STATE-EXPORTS-001`. **Mig/RB:** migrate consumers / restore shim/tests. | **Owner:** package/state verification. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** medium dependency, unknown adoption / installed imports / supported consumer exists. |
| 84 | `TEST-SCHEMA`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** retain static wire-drift fixtures plus selected independent field/enum assertions; full deletion only with wire removal; `EV-SCHEMA-TEST`. **Disp:** narrow conditional; full parent-bound. **C/J:** narrow C0/J0; full C2/J2. **Delta:** net U; `GI-SCHEMA` gross only. | **Keep/Lose:** retained wire / deleted wire only in full variant. **Pro:** less tautology. **Con:** drift escape. **Sec/Ops:** input and consent constraints remain semantic. | **Rel:** parent MCP/tool change. **Mig/RB:** add semantic assertions before fixture pruning / restore fixtures. | **Owner:** wire verification. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** medium / static fixtures and selected semantics / no independent wire owner. |
| 85 | `TEST-PACKAGE`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** consolidate model tests while retaining raw npm, installed package, bins, startup, tar and modes; `EV-PACK-TEST`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** every retained delivery journey / implementation tests. **Pro:** less model duplication. **Con:** packed-only bugs. **Sec/Ops:** denied paths/provenance/modes remain. | **Rel:** parent artifact, package, or delivery record. **Mig/RB:** real artifacts first / restore unit tests. | **Owner:** package/release verification. **M/O/S/L:** M2/O1/S1/L1. **Conf/V/!:** low / raw install and tar oracles / removed test is sole independent owner. |
| 86 | `TEST-GENERATOR`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** remove implementation tests after one output authority exists; `EV-GEN-TEST`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** paths, bytes, collision, stale, failure, drift / old-layer tests. **Pro:** focused oracle. **Con:** broad drift blast radius. **Sec/Ops:** path containment stays. | **Rel:** parent `NT-GEN-01`, `NT-GEN-02`, `PLAT-GEN-SINGLE`, or host deletion. **Mig/RB:** independent oracle first / restore tests. | **Owner:** generator verification. **M/O/S/L:** M2/O0/S0/L1. **Conf/V/!:** low / independent manifests and failures / oracle shares production model. |
| 87 | `TEST-STATE`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** remove deleted-layer tests while adding invariant/crash/concurrency/migration owners; `EV-STATE-TEST`. **Disp:** conditional overlay. **C/J:** parent-bound/J0. **Delta:** U. | **Keep/Lose:** selected store contract / removed implementation layers. **Pro:** behavior focus. **Con:** correctness floor may grow. **Sec/Ops:** containment, auth, erasure, future/corrupt data mandatory. | **Rel:** parent any persistence/state option. **Mig/RB:** new-store corpus before pruning / dual reader. | **Owner:** state/security verification. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** low savings / fault and recovery corpus / any floor gap. |
| 88 | `TEST-SECURITY`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** deduplicate harness only; `EV-SECURITY-TEST`, `EV-DOC-PATH`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** exploit/denial scenarios / repeated harness. **Pro:** less setup. **Con:** small or negative benefit. **Sec/Ops:** this is the floor. | **Rel:** parent state, MCP, hosted, package changes. **Mig/RB:** consolidate harness / restore scenario. | **Owner:** security verification. **M/O/S/L:** M1/O1/S0/L0. **Conf/V/!:** low / adversarial cases / unique exploit class removed. |
| 89 | `TEST-CLI`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** table-drive CLI and remove tests for deleted helpers; `EV-CLI-TEST`. **Disp:** conditional overlay. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** flags, dry-run, stdout, stderr, path, exit / helper detail. **Pro:** compact contract. **Con:** process/platform nuance loss. **Sec/Ops:** path and dry-run denials. | **Rel:** parent `NT-CLI-01` or bin deletion. **Mig/RB:** black-box bin first / restore unit tests. | **Owner:** CLI verification. **M/O/S/L:** M1/O0/S0/L0. **Conf/V/!:** medium / installed-bin process oracle / output or exit difference. |
| 90 | `TEST-EXEC`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** simplify invocation/workflow duplication, not test semantics; `EV-WORKFLOW`. **Disp:** conditional operational cleanup. **C/J:** C0/J1 if diagnostics degrade. **Delta:** U. | **Keep/Lose:** suites / only redundant invocation; diagnostic loss is disallowed without gate. **Pro:** simpler CI. **Con:** platform visibility may weaken. **Sec/Ops:** preserve isolation/secrets. | **Rel:** no production saving; old estimate retired. **Mig/RB:** compare job matrix/logs / workflow. | **Owner:** CI/verification. **M/O/S/L:** M1/O1/S1/L1. **Conf/V/!:** low / equivalent CI / coverage or failure visibility changes. |
| 91 | `TEST-COVERAGE`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** simplify coverage reporting/configuration; `EV-WORKFLOW`. **Disp:** conditional diagnostic choice. **C/J:** C0/J1. **Delta:** U. | **Keep/Lose:** tests / some gap diagnostics/history. **Pro:** simpler reporting. **Con:** weaker ratchet. **Sec/Ops:** hidden security gaps. | **Rel:** not implementation reduction. **Mig/RB:** preserve baseline/simple report / restore config. | **Owner:** verification. **M/O/S/L:** M1/O1/S0/L1. **Conf/V/!:** medium / compare diagnostics / release control depends on coverage. |
| 92 | `TEST-PROPERTY`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** replace selected examples with deterministic property/model tests; `EV-STATE-TEST`, `EV-VALIDATION-TEST`. **Disp:** quality option, not deletion claim. **C/J:** C0/J0. **Delta:** U. | **Keep/Lose:** invariants / only proven duplicate examples. **Pro:** broad input exploration. **Con:** generators/shrinking/readability. **Sec/Ops:** never sole security oracle. | **Rel:** parent state/validation; no composition. **Mig/RB:** run beside examples / restore examples. | **Owner:** verification. **M/O/S/L:** M2/O1/S0/L1. **Conf/V/!:** low / deterministic seeds and mutation review / opaque failures or dependency growth. |
| 93 | `TEST-RADICAL`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** delete unit tests for a smaller integration floor. **Disp:** rejected for retained product. **C/J:** C0/J1 verification loss. **Delta:** U. | **Keep/Lose:** product runtime / fast diagnostics and edge-case depth. **Pro:** gross test deletion. **Con:** slow localization and escapes. **Sec/Ops:** unacceptable containment/migration loss. | **Rel:** only reconsider after fundamental product replacement. **Mig/RB:** not recommended / restore tests. | **Owner:** product/verification/security. **M/O/S/L:** M0/O1/S0/L0. **Conf/V/!:** high rejection / mutation and defect-escape analysis / replacement architecture proves equivalent floor. |
| 94 | `TEST-BEHAVIOR-DEL`; `F-TEST-ORACLE`; `NT` | **Mech/Ev:** delete verification only with the behavior it verifies; `EV-TEST-OWNERS`. **Disp:** valid dependent rule. **C/J:** parent C2/J2 or J3. **Delta:** U. | **Keep/Lose:** only surviving journeys / deleted behavior and its tests. **Pro:** true obsolete-code cleanup. **Con:** invalid if any retained path reaches behavior. **Sec/Ops:** retained surfaces retain floors. | **Rel:** child of capability/product deletion. **Mig/RB:** archive behavior/tests together / prior release. | **Owner:** product/verification. **M/O/S/L:** M3/O1/S0/L1. **Conf/V/!:** high rule, no manifest / surviving-product acceptance / retained reachability. |

### Late historical records, positions 95–96

These are the only surviving historical options. They remain separated from
the fresh-scan taxonomy by provenance, not by decision priority.

| Pos | Semantic ID / family / Tracks | Mechanism, evidence, disposition, C/J, delta | Retained/lost journey, pros, cons, security/operations | Relationships and migration/rollback | Owner, M/O/S/L, Conf/V/! |
|---:|---|---|---|---|---|
| 95 | `HIST-NODE-FLOOR-001`; `F-CLI-RUNTIME`; `NT` | **Mech/Ev:** raise the Node floor and use newer native ESM/filesystem APIs; `EV-NODE`, `EXT-NODE-ESM`, `EXT-NODE-FS`. **Disp:** marginal conditional. **C/J:** C2/J1. **Delta:** U. | **Keep/Lose:** behavior on retained runtime / older installed-runtime journey. **Pro:** fewer compatibility helpers. **Con:** broad support break for uncertain benefit. **Sec/Ops:** runtime upgrade/support. | **Rel:** may enable `STATE-SQLITE-001` native variant. **Mig/RB:** telemetry, warning, major / compatible release. | **Owner:** platform/product. **M/O/S/L:** M3/O1/S0/L2. **Conf/V/!:** high mechanism, unknown adoption / oldest-supported runtime matrix / older users or no measured reduction. |
| 96 | `HIST-POLICY-PARSER-001`; `F-SHELL-POLICY`; `NT` | **Mech/Ev:** replace custom shell parser with vetted AST dependency; `EV-POLICY`. **Disp:** conditional dependency transfer. **C/J:** C2/J0. **Delta:** `GI-POLICY-PARSER` only; net U. | **Keep/Lose:** intended policy semantics / custom parser ownership. **Pro:** upstream grammar maintenance. **Con:** adapter, dependency, package, supply chain. **Sec/Ops:** semantic mismatch can bypass policy. | **Rel:** Claude policy/host deletion supersedes. **Mig/RB:** differential/fuzz dual parser / custom parser. | **Owner:** security/platform. **M/O/S/L:** M3/O2/S1/L2. **Conf/V/!:** low net / adversarial corpus and dependency audit / bypass, syntax gap, or package burden. |

## Retired and false-positive IDs outside the live count

Exactly two IDs are outside the 96-record ledger:

| Retired ID | Disposition | Authoritative treatment |
|---|---|---|
| `NT-MCP-02` | Phantom; no defined mechanism or evidence-backed option | No replacement ID. The narrow, real candidates are `NT-MCP-01` and `NT-MCP-03`. |
| `HIST-PARSER-001` | False positive; remove every value and portfolio contribution | The real compatibility concern belongs to `STATE-EXPORTS-001` plus `TEST-SHIM`. |

`STATE-PERSIST-GENERIC-RESOURCE` is not a live or retired record. It is a
rejected/deferred mini-contract because no provider, identity, transaction,
consistency, migration, or erasure contract exists. It must not be confused
with protocol record `STATE-RESOURCE-001`.

## Portfolio templates

Portfolios are comparison templates, not live option records and not approval.
`GI`, `DP`, and `ISE` annotations remain record-local and are never summed.
All non-status-quo effects are `U`.

### Technology-neutral portfolios

| Portfolio | Exact members or posture | Net P/T/W/G/N/I/X | Capability and gates |
|---|---|---|---|
| `TN-P0` | Status quo; no option selected | `0/0/0/0/0/0/0` | Full product; C0/J0 |
| `TN-P1` | `TN-N01`, `TN-N02`, `STATE-WORKSPACE-001`, `STATE-SNAPSHOT-001`, `STATE-REDUCER-001` | `U/U/U/U/U/U/U` | Full product; exact-contract and independent-oracle gates |
| `TN-P2` | `TN-P1` posture plus `NT-ART-01`, `NT-CONTENT-01`, `NT-GEN-01`; `TN-R01` only after a measured spike | `U/U/U/U/U/U/U` | Full product; C0/C1, authority and oracle-independence gates |
| `TN-P3` | `TN-P2` posture plus exactly one persistence authority, host set, package topology, and delivery posture | `U/U/U/U/U/U/U` | Intended retained capability; C2 possible; durability, migration, telemetry, install, rollback gates |
| `TN-P4` | `STATE-SUBFEATURE-DEL` with explicitly selected subfeatures; exclude internal work in deleted modules | `U/U/U/U/U/U/U` | Reduced product; C2/J2; product and data-erasure gates |
| `TN-P5` | One of `PLAT-EXT-DAEMON`, `PLAT-EXT-EDGE`, `PLAT-HOSTED-COMPUTE-001`, `PLAT-HOSTED-FULL-001` with `PLAT-EXT-THIN` when required | `U/U/U/U/U/U/U` | Connected/local-footprint posture; C2/J1; auth, privacy, offline, tenancy, SLO, spend, exit gates |
| `TN-P6` | `TN-DOC-PACK-001` | `U/U/U/U/U/U/U` | Documentation/prompts only; C2/J3; explicit product conversion |

### Node and TypeScript portfolios

| Portfolio | Exact members or posture | Net P/T/W/G/N/I/X | Capability and gates |
|---|---|---|---|
| `NT-P0` | Status quo; no option selected | `0/0/0/0/0/0/0` | Full product; C0/J0 |
| `NT-P1` | `NT-ART-01`, `NT-MCP-01`, `NT-VAL-01`, `NT-CLI-01`, `NT-GEN-02` evaluated independently | `U/U/U/U/U/U/U` | Full product; C0/C1; no composite estimate survives |
| `NT-P2` | `NT-P1` posture plus `NT-DOC-01`, `STATE-WORKSPACE-001`, `STATE-SNAPSHOT-001`, then gated `STATE-EXPORTS-001` | `U/U/U/U/U/U/U` | Full product except approved deep-import retirement; C0/C1 then C2/J1 |
| `NT-P3` | `NT-P2` posture plus `NT-CONTENT-01`, `NT-CONTENT-03`, `STATE-REDUCER-001`, and one approved delivery posture | `U/U/U/U/U/U/U` | Intended retained capability; gross annotations only; registry, state, delivery, runtime gates |
| `NT-P4` | `STATE-SUBFEATURE-DEL` | `U/U/U/U/U/U/U` | Reduced session product; C2/J2 |
| `NT-P5` | `PLAT-HOSTED-MCP-001` plus only approved hosted state/content/compute boundaries and `PLAT-EXT-THIN` | `U/U/U/U/U/U/U` | Connected service; C2/J1; `GI-HOSTED-DIST` is evidence, not portfolio arithmetic |
| `NT-P6` | `NT-PRODUCT-01`, optionally after a separately approved Codex singleton mini-contract | `U/U/U/U/U/U/U` | Content-only product; C2/J2; Codex `DP` stays non-sortable evidence |

## Provisional dominance analysis

This is deliberately non-numeric. Only status quo has an exact net vector.
Evidence annotations cannot sort or prove dominance.

| Candidate | Capability | C/J | Net effect | Non-sortable evidence | Qualitative risk |
|---|---|---|---|---|---|
| Status quo | Full | C0/J0 | `0/0/0/0/0/0/0` | `OBS-REPO`, `OBS-SRC`, `OBS-TEST`, `OBS-GEN`, `OBS-DIST`, `OBS-NPM` | Low change risk; current debt remains |
| `TN-P1` posture | Full | C0/J0 | `U/U/U/U/U/U/U` | No authorized combined range | Low-to-medium implementation overlap |
| `NT-P1` posture | Full | C0/C1/J0 | `U/U/U/U/U/U/U` | Individual inventories only | Medium oracle-coupling risk |
| `PLAT-HOST-SINGLETON-001` | One host | C2/J2 | `U/U/U/U/U/U/U` | `DP-HOST-*` and Codex-only `DP` keys | High product/adoption risk |
| `STATE-CLIENT-001` | Intended retained persistence | C2/J1 | `U/U/U/U/U/U/U` | No authorized net | High client-transfer risk |
| `STATE-HOSTED-001` | Connected persistence | C2/J1 | `U/U/U/U/U/U/U` | No authorized net | High privacy/operations risk |
| `PLAT-HOSTED-MCP-001` | Connected MCP | C2/J1 | `U/U/U/U/U/U/U` | `GI-HOSTED-DIST` gross ceiling | High backend/auth risk |
| `TN-P03` | Intended parity binary | C2/J0 | `U/U/U/U/U/U/U` | `ISE-NATIVE-BUILD` outside vectors | High replacement/release risk |
| `STATE-SUBFEATURE-DEL` | Reduced | C2/J2 | `U/U/U/U/U/U/U` | No authorized combined inventory | High product risk, true deletion |
| `NT-PRODUCT-01` | Content-only | C2/J2 | `U/U/U/U/U/U/U` | No authorized net | Very high product risk |
| `TN-DOC-PACK-001` | No executable product | C2/J3 | `U/U/U/U/U/U/U` | No authorized future net | Maximum product change |

No alternative is declared dominant.

## Host-set mini-contracts

`G` = Gemini, `C` = Claude, `X` = Codex, and `Q` = Qwen. These fifteen rows
are exact visible-path projections, not dependency-closed artifacts. Every
change row requires adoption telemetry and an install/replacement plan. No row
is recommended.

| Retained set | Retained journey | Lost journey | Retained visible npm DP | Removed visible npm DP | Gate and dependency closure |
|---|---|---|---:|---:|---|
| `G+C+X+Q` | All four hosts | None | 337 entries / 818,490 B | 0 / 0 | Status quo exact artifact; closure not needed |
| `G` | Gemini | Claude, Codex, Qwen | 200 / 645,855 B | 137 / 172,635 B | Telemetry and three replacements; dependency-closed build not performed/U |
| `C` | Claude | Gemini, Codex, Qwen | 210 / 669,689 B | 127 / 148,801 B | Telemetry and three replacements; dependency-closed build not performed/U |
| `X` | Codex | Gemini, Claude, Qwen | 167 / 595,617 B | 170 / 222,873 B | Telemetry and three replacements; dependency-closed build not performed/U |
| `Q` | Qwen | Gemini, Claude, Codex | 183 / 627,370 B | 154 / 191,120 B | Telemetry and three replacements; dependency-closed build not performed/U |
| `G+C` | Gemini, Claude | Codex, Qwen | 269 / 742,197 B | 68 / 76,293 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `G+X` | Gemini, Codex | Claude, Qwen | 226 / 668,125 B | 111 / 150,365 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `G+Q` | Gemini, Qwen | Claude, Codex | 242 / 699,878 B | 95 / 118,612 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `C+X` | Claude, Codex | Gemini, Qwen | 236 / 691,959 B | 101 / 126,531 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `C+Q` | Claude, Qwen | Gemini, Codex | 252 / 723,712 B | 85 / 94,778 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `X+Q` | Codex, Qwen | Gemini, Claude | 209 / 649,640 B | 128 / 168,850 B | Telemetry and two replacements; dependency-closed build not performed/U |
| `G+C+X` | Gemini, Claude, Codex | Qwen | 295 / 764,467 B | 42 / 54,023 B | Telemetry and Qwen replacement; dependency-closed build not performed/U |
| `G+C+Q` | Gemini, Claude, Qwen | Codex | 311 / 796,220 B | 26 / 22,270 B | Telemetry and Codex replacement; dependency-closed build not performed/U |
| `G+X+Q` | Gemini, Codex, Qwen | Claude | 268 / 722,148 B | 69 / 96,342 B | Telemetry and Claude replacement; dependency-closed build not performed/U |
| `C+X+Q` | Claude, Codex, Qwen | Gemini | 278 / 745,982 B | 59 / 72,508 B | Telemetry and Gemini replacement; dependency-closed build not performed/U |

Visible npm classifier components are `DP`: Gemini 59 entries/72,508 B;
Claude 69/96,342 B; Codex 26/22,270 B; Qwen 42/54,023 B; common
141/573,347 B; total 337/818,490 B. Packed host allocation is `U`.

The stronger Codex-only `DP` removes at least 381 TypeScript lines plus 674
content lines, at least 165 generated files/243,065 B, and at least 177 npm
entries/235,244 B; it retains at most 160 npm entries/583,246 B. Shared
pruning, registry rewrites, dependency closure, and packed bytes remain `U`.
This stronger projection still does not recommend Codex-only operation.

## Distribution gross-owner accounting

| Key / option | Exact gross owner | Excluded from the gross owner | Net |
|---|---:|---|---|
| `GI-STABLE-W` / `PLAT-STABLE-001` | preview 29 W; RC 41 W; nightly 21 W; prerelease-publish 125 W; total 216 W | Replacement workflow and operational behavior | U |
| `GI-DIST-RELEASE` / `PLAT-DIST-RELEASE` | 193 P; 116 combined T+W outside vectors | Replacement installer, signing, mirror, support | U |
| `GI-DIST-TARBALL` / `PLAT-DIST-TARBALL` | 276 P; 208 combined T+W outside vectors | Replacement delivery and update behavior | U |
| `GI-REL-NOIDEM` / `PLAT-REL-NOIDEM` | 349 P + 349 T | Retry/latest-repair replacement | U |
| `GI-ONDEMAND` / `PLAT-PKG-ONDEMAND` | 196 owned files; 275,896 B | Downloader, cache, remote storage, overlap | U |

No channel-retirement composite survives.

## Hosted MCP gross ceiling and owner boundary

The following is `GI-HOSTED-DIST`, a gross whole-`dist` ceiling only:

| Compiled subtree | Entries | Bytes |
|---|---:|---:|
| `bin` | 2 | 6,269 |
| `config` | 2 | 7,551 |
| `core` | 14 | 35,540 |
| `generated` | 5 | 156,661 |
| `hooks` | 10 | 23,705 |
| `lib` | 6 | 18,721 |
| `mcp` | 84 | 264,401 |
| `platforms` | 13 | 24,212 |
| `state` | 1 | 6,315 |
| **Gross total** | **137** | **543,375** |

Net `N/I/X` is `U` for hosted, full, thin, edge, and daemon choices. A retained
thin client owns bins, transport, OAuth client, endpoint configuration,
adapters, bootstrap/versioning, diagnostics, tests, and package metadata. The
remote owner owns handlers, state, content, compute, OAuth resource-server
behavior, storage, deployment, observability, abuse response, incidents, and
runbooks.

## Package, externalization, and replacement owner comparison

| Exact option | Repository/local owner | External or recurring owner | O/S/L | Rollback/exit |
|---|---|---|---|---|
| `PLAT-SPLIT-001` | Shared core, host packages, manifests, compatibility tests | Multiple releases and version skew | O2/S1/L2 | Universal monolith |
| `PLAT-PKG-ONDEMAND` | Downloader, verifier, cache, offline behavior | Registry/storage/network availability | O2/S2/L2 | Universal prebuilt package |
| `PLAT-GEN-FIRST-RUN-001` | Generator/bootstrap/cache | Install environment and support | O2/S1/L2 | Prebuilt payload |
| `PLAT-EXT-UPSTREAM` | Adapter, parity, export, provider exit | Upstream roadmap/incidents/dependency | O2/S2/L3 | Local provider |
| `NT-AGENTS-SDK-001` | Adapter and Maestro parity | SDK dependency and optional hosted/sandbox services | O2/S1/L2 | Current stack |
| `PLAT-HOSTED-MCP-001` | Thin client boundary | OAuth, tenancy, compute, storage, SLO, incidents | O4/S3/L2 | Local server |
| `PLAT-EXT-DAEMON` | Host adapters and IPC client | Local daemon lifecycle/upgrades/support | O2/S0/L2 | Embedded server |
| `TN-REWRITE-GO` | Replacement source and migrations | Cross-platform builds, releases, CVEs, support | O2/S1/L2 | Node product |
| `TN-REWRITE-RUST` | Replacement source and migrations | Cross-platform builds, releases, CVEs, support | O2/S1/L2 | Node product |
| `TN-REWRITE-PYTHON` | Replacement source and migrations | Interpreter/package/runtime support | O2/S1/L2 | Node product |
| `TN-P03` | Compiled replacement and parity | Signing, multi-platform release and patch cadence | O2/S1/L2 | Node package |

## State correctness and security debt

Every retained-state option owns these current gaps. A storage migration that
omits them may remove code but is not an acceptable retained-capability design.

| Gap | Current evidence | Required remediation and verification floor |
|---|---|---|
| Transition legality is incomplete | `src/mcp/session/phase-transition-service.ts:167-211` mutates requested phases; `blocked_by` exists at `src/mcp/contracts/session-state-schema.ts:53-75` | Enforce dependency completion, current-phase and batch/parallel legality; negative transition corpus |
| Repeated transition is not idempotent | Token totals are added at `src/mcp/session/phase-transition-service.ts:194-198` | Define request identity and duplicate behavior; prove retry cannot double-count |
| Checkpoint and active state can diverge on crash | Checkpoint capture at `src/mcp/session/phase-transition-service.ts:200-205`; active write follows mutator at `src/mcp/session/session-store.ts:176-188` | Transaction/write-ahead or recovery reconciliation; fault-inject every write boundary |
| Phase-ID contracts disagree | Plan IDs allowed at `src/mcp/contracts/session-state-schema.ts:53-61`; checkpoint handling coerces/requires numeric IDs at `src/mcp/handlers/checkpoints.ts:49-56` and `src/mcp/handlers/checkpoints.ts:169-186` | One phase-ID contract across state, files, list, capture, restore; migrate old checkpoints |
| Fork can overwrite active state | `src/mcp/handlers/session-lineage.ts:105-140` calls create; `src/mcp/session/session-store.ts:198-206` writes active slot | Assert active/target absence and roll back gate creation |
| Session IDs are not globally unique | `src/mcp/session/session-lifecycle-service.ts:100-135` does not prove every archive/checkpoint/gate namespace | Atomic uniqueness across all derived namespaces |
| Archive is nontransactional | `src/mcp/session/session-lifecycle-service.ts:190-205` performs state, rename, plan, and gate steps | Commit marker or journal; idempotent retry and recovery/rollback tests |
| Future schema versions can be relabeled current | `src/mcp/session/session-store.ts:76-83` always emits current version | Reject unknown future versions; migrate only known older versions |
| Failed/skipped states lack a complete journey | Statuses at `src/mcp/contracts/session-state-schema.ts:53-75`; transition service lacks complete failure/skip lifecycle | Define retry, skip, dependent-phase and archive semantics |
| Concurrency/durability has no formal guarantee | `src/mcp/session/session-store.ts:176-215` reads, mutates and writes with no visible lock/CAS/fsync/transaction contract | Select and verify locking, compare-and-swap, transaction and durability semantics |
| Privacy erasure is incomplete | Archives, checkpoints, memories, plans, and gates are separate derived stores | Derivative inventory, erasure transaction, audit report, end-to-end oracle |
| Absolute design path can copy any readable file | `src/mcp/session/document-repository.ts:90-104` accepts absolute input | Approved roots or explicit capability/consent; symlink, traversal, absolute-path and race tests |

Minimum retained-state verification includes transition invariants,
duplicate-request behavior, crash-boundary fault injection, concurrency, raw
persisted corpora, future/corrupt migrations, containment, authorization,
privacy erasure, and transaction/rollback behavior.

## TEST quarantine and verification ownership

### Exact physical inventory

The physical `EO` is 239 test-partition files/28,201 lines: 185 executable
files/25,869 lines, 9 support files/1,033 lines, 44 golden files/1,007 lines,
and 1 type fixture/292 lines. The tool-schema subset is 40 files/913
lines/19,544 B.

### Unreproduced Phase 6 ownership assessment

This table is `ISE-TEST-OWNER`, not `EO`. It has no 239-file semantic manifest,
must not be composed, and cannot authorize deletion.

| Assessed primary owner | Executable files | Executable lines |
|---|---:|---:|
| Black-box behavior | 39 | 5,223 |
| Runtime startup / host parity | 26 | 4,182 |
| Generator ownership / drift | 28 | 4,307 |
| Implementation detail | 25 | 3,585 |
| Package / release | 20 | 2,833 |
| Public contract | 17 | 2,001 |
| Migration / recovery | 13 | 1,938 |
| Security / containment | 17 | 1,800 |
| **Total** | **185** | **25,869** |

A future 239-file semantic owner manifest is mandatory before implementation.
Snapshots and goldens derived from the same production catalog are
tautological for semantics, though they can still be static drift fixtures.
The 40 schema fixtures remain static wire-drift fixtures; selected explicit
field and enum assertions provide independent semantics. Mocks may own unit
isolation but cannot replace real SDK, package, process, filesystem, or startup
journeys. Duplicate smoke tests can shrink only after a named independent owner
is recorded.

### Nine independent oracle classes

1. Public schema/wire for every retained tool: static drift fixtures plus
   selected independently authored semantic assertions.
2. Real MCP SDK registration and invocation.
3. Raw npm pack, installed package, bins, and startup.
4. Real tar/archive contents, modes, corrupt, missing, and extra cases.
5. Security, path containment, workspace isolation, consent, and
   authorization.
6. Persistence migrations, future/corrupt data, crash, concurrency, rollback,
   and privacy erasure.
7. Generator paths, bytes, collision, stale deletion, failure, and drift.
8. Host/runtime startup, parity, package root, and payload.
9. CLI flags, dry-run, stdout, stderr, path, and exit.

CI optimization may table-drive cases, consolidate narrow fixtures, and avoid
repeating builds only when the retained real-artifact and startup owner remains
independent. It may not generate expected values from the production source it
claims to verify.

## Review remediation disposition

All 28 Phase 10–12 review findings were resolved: 27 accepted and one revised.
No finding was rejected or deferred.

| Finding | Outcome | Applied remediation |
|---|---|---|
| `ARCH-10-001` | Accept | Removed phantom `NT-MCP-02` from live taxonomy |
| `ARCH-10-002` | Accept | Split compatibility and journey-loss axes |
| `ARCH-10-003` | Accept | Added all host singleton, pair, and triple mini-contracts |
| `ARCH-10-004` | Accept | Added package-topology and delivery shapes |
| `ARCH-10-005` | Accept | Added no-generator, host-native, protocol, and upstream options |
| `ARCH-10-006` | Accept | Separated P, T, and W or used U |
| `ARCH-10-007` | Accept | Removed composite `NT-P1` estimate and made dominance provisional |
| `ARCH-10-008` | Accept | Added Tracks to every live record |
| `ARCH-10-009` | Accept | Added Owner and M/O/S/L fields |
| `ARCH-10-010` | Accept | Narrowed `NT-MCP-01` to pack-local contraction |
| `EVID-11-001` | Accept | Retired false `HIST-PARSER-001` claim |
| `EVID-11-002` | Accept | Limited hosted compiled inventory to gross whole-dist ceiling |
| `EVID-11-003` | Accept | Labeled host values visible-path projections without closure |
| `EVID-11-004` | Accept | Enforced separate P/T/W accounting |
| `EVID-11-005` | Accept | Quarantined TEST ownership pending semantic manifest |
| `EVID-11-006` | Revise | Promoted Git/action/resource; kept generic-resource persistence as separate rejected mini-contract |
| `EVID-11-007` | Accept | Added `NT-AGENTS-SDK-001` |
| `EVID-11-008` | Accept | Made `TEST-EXEC` unquantified |
| `EVID-11-009` | Accept | Replaced pseudo-ID references with exact semantic IDs |
| `EVID-11-010` | Accept | Attached external keys to relevant records |
| `ACCT-12-001` | Accept | Marked host paths as DP and dependency closure U |
| `ACCT-12-002` | Accept | Marked hosted compiled subtree GI only |
| `ACCT-12-003` | Accept | Removed false parser values and contributions |
| `ACCT-12-004` | Accept | Enforced vector separation or U |
| `ACCT-12-005` | Accept | Removed unsupported TEST composition |
| `ACCT-12-006` | Accept | Removed non-status portfolio/dominance arithmetic |
| `ACCT-12-007` | Accept | Corrected schema inventory to `GI-SCHEMA` |
| `ACCT-12-008` | Accept | Classified schema goldens as static drift fixtures with selected semantic assertions |

## Historical process deviation and quarantine

The Phase 7 worker directly read
`docs/maestro/state/active-session.md` despite the state-tool-only contract.
That file-derived sequencing proof is discarded. Immediately before Phase 7,
the root orchestrator used Maestro `get_session_status` for session
`2026-07-11-fresh-architecture-reduction-rescan` and observed Phases 1–6
completed, Phase 7 in progress, Phases 8–16 pending, with sequential execution.
That root MCP result establishes the quarantine boundary. This atlas does not
cite the state file as evidence and did not initialize or mutate Maestro state.

Historical material admitted only `HIST-NODE-FLOOR-001` and
`HIST-POLICY-PARSER-001` after live verification. `HIST-PARSER-001` was proven
a false positive and is outside the live count.

## User-owned decision gates

No implementation begins until the owner answers every applicable gate:

1. Which hosts remain, based on adoption telemetry rather than package size?
2. Must all 40 tool names, schemas, discovery behavior, errors, and wire formats
   remain exact?
3. Which package entrypoints and deep imports are supported, and when may they
   break?
4. May the Node engine floor rise, and which installed environments must work?
5. Which npm, marketplace, dist, release, tar/archive, prerelease, local-plugin,
   and offline delivery journeys remain?
6. Which memory, history, design approval, durable session, MCP, content, and
   executable-product journeys may disappear?
7. Which persistence authority and durability, consistency, concurrency,
   crash, inspection, migration, rollback, and erasure semantics are required?
8. May state, content, or execution leave the local machine? Define auth,
   privacy, residency, offline, tenancy, availability, spend, and exit rules.
9. May generic actions/resources replace named discovery and per-tool
   authorization?
10. Is a language/platform rewrite worth parallel implementation, full parity,
    multi-platform release, and migration?
11. Does a content-only MCP, serverless content product, or documentation pack
    still satisfy the product goal?

## Non-binding evaluation sequence

1. Reproduce the baseline and preserve all nine independent oracle classes.
2. Measure one `TN-N01` or `TN-N02` slice and one `NT-ART-01` projection;
   retain only behavior-identical, net-negative diffs.
3. Evaluate `NT-MCP-01`, `NT-MCP-03`, `NT-GEN-01`, `NT-GEN-02`,
   `NT-RUNTIME-01`, `NT-VAL-01`, and `NT-CLI-01` independently.
4. Build explicit workspace and raw-state corpora before state changes, then
   close the state correctness/security gaps.
5. Choose exactly one persistence authority, package topology, delivery
   posture, content authority, and host set.
6. Collect host and channel telemetry before retirement.
7. Evaluate protocol, upstream, hosted, daemon, edge, and thin-client transfers
   with both local and transferred owners.
8. Evaluate capability deletions as product decisions and remove only the
   dependent tests whose owners are mapped.
9. Run rewrite/binary spikes only for a named product or deployment constraint.
10. Before implementation approval, run the selected owner tests and the real
    source, package, install, startup, and release gates.

## Evidence appendix

### Current repository evidence

Paths and line references were checked against the frozen repository.

| Key | Evidence and relevance |
|---|---|
| `EV-RUNTIME` | `src/platforms/runtime-declarations.ts:7-41` defines shared facts; `src/platforms/runtime-declarations.ts:41-133` defines host declarations; `src/platforms/runtime-declarations.ts:134-170` exposes the catalog |
| `EV-GEN` | `src/generator/types.ts:6-24` defines output/manifest shapes; `src/tooling/generate.ts:100-154` builds and reconciles outputs |
| `EV-ARTIFACT` | `src/tooling/artifact-policy.ts:219-238` declares compatibility/package policy; `src/tooling/artifact-policy.ts:270-295` identifies independent release verification sources |
| `EV-PACK` | `src/tooling/verify-npm-pack.ts:158-196` checks required/denied entries and budgets; `src/tooling/verify-npm-pack.ts:199-212` invokes raw package verification |
| `EV-MCP` | `src/mcp/tool-packs/command-table.ts:1-68` defines command contracts; `src/mcp/tool-packs/command-table.ts:109-179` registers them; `src/mcp/server/tool-pipeline.ts:8-52` owns workspace, handler, error and post-call order |
| `EV-TOOLS` | `src/mcp/tool-packs/session/index.ts:30-94`, `src/mcp/tool-packs/memory/index.ts:20-99`, `src/mcp/tool-packs/history/index.ts:12-46`, `src/mcp/tool-packs/content/index.ts:7-35`, and `src/mcp/tool-packs/workspace/index.ts:15-65` are the five pack-local tables |
| `EV-CONTENT` | `src/mcp/content/provider.ts:14-31` filesystem provider; `src/mcp/content/provider.ts:34-56` registry provider; `src/mcp/content/provider.ts:59-65` selection/fallback |
| `EV-CTX` | `src/mcp/server/handler-context.ts:22-43` builds services; `src/mcp/server/handler-context.ts:84-135` resolves explicit workspace/root/context |
| `EV-STATE` | `src/mcp/session/session-store.ts:76-111` migration/parsing; `src/mcp/session/session-store.ts:129-150` read/write; `src/mcp/session/session-store.ts:176-223` mutation/archive |
| `EV-TRANSITION` | `src/mcp/session/phase-transition-service.ts:167-211` applies transition, accounting, checkpoint and writeback behavior |
| `EV-DOC-PATH` | `src/mcp/session/document-repository.ts:43-53` copies documents; `src/mcp/session/document-repository.ts:90-104` accepts absolute or workspace-relative paths |
| `EV-VALIDATION` | `src/mcp/validation/plan-validation-pipeline.ts:1-50` owns ordered stages/rules and profiles |
| `EV-CLI` | `src/bin/maestro-install-codex.ts:50-75` parses/document flags; `src/bin/maestro-install-codex.ts:187-200` applies or previews installation |
| `EV-NODE` | `package.json:68-74` records the current Node engine and TypeScript/Node support contract |
| `EV-WORKFLOW` | `package.json:31-45` defines build/source/release/package commands; delivery workflows begin at `.github/workflows/release.yml:1`, `.github/workflows/prepare-release.yml:1` and `.github/workflows/prerelease-publish.yml:1` |
| `EV-MEMORY` | `src/mcp/tool-packs/memory/index.ts:20-99` declares memory/profile/recall/knowledge/import/export operations |
| `EV-HISTORY` | `src/mcp/tool-packs/history/index.ts:12-46` declares lineage/checkpoint operations; `src/mcp/handlers/checkpoints.ts:45-89` captures checkpoints |
| `EV-DESIGN` | `src/mcp/session/session-lifecycle-service.ts:100-140` materializes design/plan inputs; `src/mcp/handlers/design-gate.ts:31-40` enters the gate |
| `EV-POLICY` | `src/hooks/policy/shell-parser.ts:1-254` is the current parser; `src/hooks/policy/policy-enforcer.ts:1-15` imports it and `src/hooks/policy/policy-enforcer.ts:32-55` applies fail-closed policy |
| `EV-TEST-OWNERS` | Representative files: `tests/unit/session-state.test.js:20`, `tests/transforms/mcp-content-pack.test.js:1`, `tests/integration/generator.test.js:16`, `tests/support/contracts.js:11`, `tests/fixtures/mcp-command-table-type-contract.ts:1` |
| `EV-MCP-TEST` | `tests/unit/mcp-command-table.test.js:30-219` and `tests/unit/mcp-tool-pipeline.test.js:19-162` |
| `EV-SCHEMA-TEST` | `tests/unit/mcp-tool-packs-zod-schemas.test.js:67-176` and static fixtures under `tests/unit/golden/tool-packs/` |
| `EV-VALIDATION-TEST` | `tests/unit/plan-validation-context.test.js:1`, `tests/unit/plan-validation-extensibility.test.js:1`, `tests/unit/plan-validation-pipeline.test.js:1` |
| `EV-STATE-TEST` | `tests/unit/session-state.test.js:20`, `tests/unit/session-migrations.test.js:17`, `tests/unit/session-migration-read-paths.test.js:1`, `tests/integration/workspace-requirement.test.js:27` |
| `EV-PACK-TEST` | `tests/integration/npm-package-surface.test.js:54`, `tests/integration/release-artifacts.test.js:19`, `tests/integration/install-codex-plugin.test.js:1`, `tests/integration/dist-runtime-startup.test.js:1` |
| `EV-GEN-TEST` | `tests/integration/generator.test.js:16`, `tests/integration/generator-failure.test.js:1`, `tests/unit/release-artifact-manifest.test.js:1` |
| `EV-SECURITY-TEST` | `tests/unit/workflow-security.test.js:59`, `tests/integration/workspace-requirement.test.js:27`, `tests/unit/mcp-design-gate-consent.test.js:1` |
| `EV-CLI-TEST` | `tests/unit/cli-lib.test.js:34-86`, `tests/unit/maestro-mcp-server-bin.test.js:1`, `tests/integration/install-codex-plugin.test.js:1` |

The frozen Phase 1 source and release gates passed. This Phase 15 documentation
remediation does not rerun full repository gates.

### Official external references

External references support ecosystem facts, never repository deltas.

| Key | Official source | Attached decisions |
|---|---|---|
| `EXT-MCP` | [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) | `PLAT-HOSTED-MCP-001`, `PLAT-EXT-THIN`, `STATE-HOSTED-001`, `STATE-ACTION-001`, `STATE-RESOURCE-001`, `TN-PROTOCOL-CLI-001`, `TN-PROTOCOL-JSONRPC-001` |
| `EXT-NODE-ESM` | [Node.js ECMAScript modules](https://nodejs.org/api/esm.html#importmetadirname) | `HIST-NODE-FLOOR-001` |
| `EXT-NODE-FS` | [Node.js filesystem APIs](https://nodejs.org/api/fs.html#fsreaddirsyncpath-options) | `HIST-NODE-FLOOR-001` |
| `EXT-NODE-SQLITE` | [Node.js SQLite](https://nodejs.org/api/sqlite.html) | `STATE-SQLITE-001` |
| `EXT-NODE-PACKAGES` | [Node.js package entry points and exports](https://nodejs.org/api/packages.html#package-entry-points) | `PLAT-PKG-EXPORTS`, `PLAT-SPLIT-001`, `STATE-EXPORTS-001` |
| `EXT-CLAUDE` | [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) | `PLAT-HOST-SINGLETON-001`, `PLAT-HOST-SUBSET-001`, `PLAT-DIST-001`, `PLAT-NPM-001`, `PLAT-DIST-RELEASE` |
| `EXT-CODEX` | [OpenAI Codex plugins](https://learn.chatgpt.com/docs/plugins) | `PLAT-HOST-SINGLETON-001`, `PLAT-HOST-SUBSET-001`, `PLAT-DIST-001`, `PLAT-NPM-001`, `PLAT-DIST-RELEASE` |
| `EXT-AGENTS-SDK` | [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/) | `NT-AGENTS-SDK-001` |

## Task Report

- **Status:** Phase 15 report remediation complete. This atlas remains a
  decision reference; no product option is selected and no implementation is
  approved.
- **Normalized contract:** 96 live records: 78 architecture/product, 16
  quarantined `TEST` overlays, and 2 surviving late `HIST` records; 23
  canonical families; 14 portfolio templates; 2 retired IDs outside the live
  count; all 23 promoted records have full contracts.
- **Review disposition:** all 28 findings are represented: 27 accepted and one
  revised. The phantom and false-positive records, compatibility/journey split,
  host-set projections, package/protocol/upstream options, quantitative
  quarantine, test ownership, and external evidence routing are applied.
- **File scope:** modified only
  `ARCHITECTURE_REDUCTION_OPTION_ATLAS.md`. It remains one untracked
  documentation file. No source, test, generated, compiled, workflow,
  dependency, runtime, package-policy, design, plan, or state file changed.
- **Artifact size:** 818 lines; 119,963 bytes.
- **Validation:** positions are unique and sequential; all record fields,
  promoted IDs, family rows, portfolios, historical/retired boundaries, review
  dispositions, evidence keys, table widths, and Markdown fences passed the
  artifact validator. Every record delta is `U` or an authorized
  `GI`/`DP`/`ISE` key. Portfolio and provisional-dominance arithmetic is exact
  only for status quo.
- **Whitespace check:** `git diff --no-index --check /dev/null
  ARCHITECTURE_REDUCTION_OPTION_ATLAS.md` emitted no whitespace-error output;
  its expected no-index result is a difference because the atlas is untracked.
- **Repository hygiene:** `git status --short --untracked-files=all` reports
  only `?? ARCHITECTURE_REDUCTION_OPTION_ATLAS.md`; `git diff --check` is
  clean.
- **Gates not run:** no full build, source, test, package, startup, or release
  gate was rerun because this phase is documentation-only and the approved
  validation scope is the artifact.
- **Stage/publish:** no stage, commit, push, publish, package, or release action
  occurred.
- **Errors, deviations, blockers:** none in Phase 15. The earlier Phase 7
  direct-state read is disclosed and quarantined above.

## Downstream Context

- **Key interfaces:** semantic option IDs; the 23 `F-` families; independent
  `C` and `J` axes; `P/T/W/G/N/I/X` surfaces; `EO/GI/DP/ISE/U` quantitative
  classes; Owner and `M/O/S/L` fields; exact dependency edges.
- **Patterns established:** status quo is the only portfolio with exact net
  arithmetic; gross/direct/inherited evidence is non-sortable and
  record-local; local/install deletion is separate from external ownership;
  verification reduction is parent-bound and requires independent oracles.
- **Integration points:** any implementation plan must select exact semantic
  IDs, resolve the user gates, build a file/owner manifest, measure the
  dependency-closed diff, and run the relevant real artifact/runtime gates.
- **Assumptions:** host adoption remains unknown; no host is recommended;
  categorical cost fields use `?` where frozen evidence cannot justify
  precision; external sources establish ecosystem constraints, not code deltas.
- **Warnings:** do not sum alternatives, overlaps, superseded work, `TEST`
  overlays, or `GI`/`DP`/`ISE` annotations; do not call transfer a total-system
  reduction; do not treat this atlas as implementation approval.
