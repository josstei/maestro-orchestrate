# Codebase Bloat Reduction Opportunities

Date: 2026-07-01

This report summarizes aggressive opportunities to reduce repository size, package size, generated-output drift, prompt/content volume, and maintenance surface in `maestro-orchestrate`.

Original scope: analysis and implementation options. Five read-only adversarial subagents reviewed the first draft; validated findings are incorporated below. Phases 0 through 6 plus the package-source hardening follow-up have since been executed in this worktree and are recorded in their phase sections.

## Current Status: Phase 6 Tests, CI, and Release Scripts

Execution status as of 2026-07-01: implemented and validated in this worktree.

- `claude/src/**` and `plugins/maestro/src/**` are both retired generated cleanup roots and are absent after write-mode generation.
- All runtimes now resolve shared MCP content from package-root `src` with `fallback: none`.
- `src/generator/payload-builder.js` and its unit test were removed because no runtime keeps a detached payload target.
- `scripts/generate.js` no longer copies or version-stamps detached payloads; write-mode generation reports `Detached payloads: none`.
- Claude entrypoints and hook adapters direct-load package-root `src` modules instead of choosing between repo and bundled payload copies.
- Claude marketplace metadata now points at the package root (`source: "."`), with `.claude-plugin/plugin.json` referencing `./claude/.mcp.json` and `./claude/hooks/claude-hooks.json`.
- Claude and Codex public entrypoints overwrite `MAESTRO_EXTENSION_PATH` with their package root, so a stale ambient env var cannot select a second content tree.
- `src/mcp/content/provider.js` now rejects non-`none` fallback declarations instead of constructing provider chains.
- `src/config/setting-resolver.js` has one extension-root input, `MAESTRO_EXTENSION_PATH`; Claude adapters normalize their host-specific root into that variable.
- Installed-package tests now prove Claude MCP startup, hook runner, policy enforcer, and public adapter stubs load package-root `src` with `claude/src` absent.
- Session state access is now an MCP-only contract; generated command content no longer injects state helper scripts or documents direct state-file fallback paths.
- Package and release allowlists deny retired payload roots and enumerate public Claude surfaces instead of allowing all of `claude/`.
- Package and release allowlists now share one explicit runtime-source inventory instead of shipping broad `src/`.
- Build-only source-checkout tooling is excluded from npm and release artifacts: `src/generator/`, `src/transforms/`, `src/entry-points/`, `src/lib/discovery/`, `src/lib/yaml-emit.js`, `src/manifest.js`, platform metadata builders, and `src/platforms/runtime-payload-contract.js`.
- Agent handoff templates are centralized in `src/skills/shared/delegation/protocols/agent-base-protocol.md`; all 39 canonical `src/agents/*.md` files now keep only a pointer to that shared contract.
- Runtime delegation-path tests now prove agent-backed entry points and execute/resume commands load `delegation`, and that standard/express orchestration steps load `agent-base-protocol` plus `filesystem-safety-protocol` before delegation.
- Agent output-contract tests now reject reintroducing the full per-agent `## Task Report` / `## Downstream Context` templates while proving the shared protocol owns the canonical template.
- Tests now have a shared `tests/support` MCP/workspace/session harness for repeated temporary workspace, initialized server, phase fixture, workspace file, and session frontmatter setup.
- Representative MCP/session tests use the shared harness while preserving named high-scenario coverage.
- Source validation and package/release validation now have separate reusable command surfaces: `npm run check:source`, `npm run check:release`, `just source-check`, and `just release-check`.
- GitHub workflows call the shared source/release checks where appropriate while keeping release event, token, version, label, tag, and publish policy visible in workflow YAML.
- The follow-up no-shim remediation removes implicit workspace initialization, direct state helper scripts, legacy runtime dispatch aliases, hook env/prompt identity fallbacks, the dead shared agent-name module, and legacy manifest output pass-through.
- Validated npm package metrics: 338 entries, 307,912 packed bytes, 1,106,749 unpacked bytes.
- Validated release artifact metrics: 444 archive entries, 355,658 archive bytes, no root `scripts/`, no retired payload roots, no build-only `src` tooling, and only the two public bin files under `bin/`.

## Baseline

Original measured baseline before Phase 0 execution:

| Metric | Value |
| --- | ---: |
| Tracked files | 772 |
| Tracked lines | 79,276 |
| NPM package entries | 655 |
| NPM packed size | 461 KB |
| NPM unpacked size | 2.69 MB |
| Tracked Markdown | 341 files / 33,081 lines |
| Tests | 88 files / 15,789 lines |

Largest package buckets from `npm pack --dry-run --json --ignore-scripts`:

| Package bucket | Unpacked bytes |
| --- | ---: |
| `src/` | 773,968 |
| `claude/src` | 707,741 |
| `plugins/maestro/src` | 706,876 |
| `docs` | 115,394 |
| `claude` non-`src` | 100,035 |
| `CHANGELOG.md` | 59,867 |
| `scripts` | 46,249 |
| `qwen` | 31,685 |
| `agents` | 31,481 |

The top three buckets, `src/`, `claude/src`, and `plugins/maestro/src`, total about 2.19 MB, roughly 81 percent of unpacked package size.

## Branch Topology Prerequisite

The project instructions describe a TypeScript/`dist` topology, but the current checkout is still CommonJS/source-first:

- `src/` currently contains authored `.js`, Markdown, and template files.
- `package.json` does not currently expose a TypeScript build pipeline.
- `npm pack` ships explicit runtime-source subpaths under `src/`, runtime roots, selected docs, and public bins; root `scripts/` and build-only `src` tooling remain source-checkout content only.

Before implementing any slice, choose one of these modes:

| Mode | Meaning | Consequence |
| --- | --- | --- |
| Live JS mode | Treat the current CommonJS/source-first tree as authoritative. | Implement bloat reduction against current files and tests. |
| Topology reconciliation mode | First migrate or restore the TypeScript/`dist` topology described by project docs. | Re-run this audit after the migration because package/runtime assumptions will change. |

Do not mix future TypeScript assumptions with current JS package behavior in the same implementation plan.

## Dependency Graph

The opportunities are not independent. Payload, package, content, release, and generated-output changes overlap heavily.

Recommended dependency order:

| Order | Gate / Slice | Why it must come here |
| ---: | --- | --- |
| 0 | Runtime payload contract | Defines which runtimes need detached/offline payloads and which may rely on npm package content. |
| 1 | Generated-surface inventory | Prevents accidental deletion of generated outputs that current tests/release checks still require. |
| 2 | Codex payload retirement proof | High-value first deletion candidate, but only after the contract and inventory exist. |
| 3 | Content provider or registry | Required before broad package narrowing or detached payload removal. |
| 4 | Package split / package allowlist | Converts topology decisions into install-footprint reduction. |
| 5 | Detached payload strategy for Claude/Codex | Decides whether `claude/src` survives, becomes release-only, or is replaced. |
| 6 | Prompt and methodology normalization | Should be measured after payload mirrors are addressed to avoid double-counting. |
| 7 | Test harness and generated matrix tests | Supports the refactors while preserving behavior checks. |
| 8 | Runtime portfolio pruning | Product-scope decision, not a technical cleanup default. |
| 9 | MCP state-machine simplification | Public wire-contract migration; do after package/runtime churn settles. |
| 10 | Generator and release script consolidation | Safest after generated-surface ownership is explicit. |

## Phase 0: Runtime Payload Contract

This is the required first step before deleting or untracking any runtime payload.

Execution status as of 2026-06-30: complete in this worktree.

Implemented artifacts:

- `src/platforms/runtime-payload-contract.js`
- `docs/runtime-payload-contract.md`
- `src/generator/generated-surface-inventory.js`
- `docs/generated-surface-inventory.md`
- `scripts/verify-npm-pack.js` positive package inventory and package budgets
- `tests/unit/runtime-payload-contract.test.js`
- `tests/unit/generated-surface-inventory.test.js`

Implemented decisions:

- Phase 0 targets the live JS source-first topology. The TypeScript/`dist` instructions in `AGENTS.md` remain a separate topology-reconciliation track.
- Gemini and Qwen use package-root `src` through root generated MCP entrypoints.
- Claude keeps `claude/src` as a startup and release invariant.
- Codex startup uses the npm package bin through `npx`. At Phase 0 close, `plugins/maestro/src` remained a release/package invariant pending Phase 1 proof.
- The generator now consumes the generated-surface inventory for owned stale-pruned roots and detached payload targets.
- `npm run pack:verify` now rejects unclassified package entries, unclassified packaged scripts, denied paths, and package budget regressions.
- Completion-audit hardening now derives required npm package files from the runtime payload contract, asserts generated MCP startup manifests match the startup matrix, and runs runtime content lookup tests through each runtime's declared content root.

Phase 0 closing package budget gate:

| Budget | Limit | Current verified value |
| --- | ---: | ---: |
| Package entries | 660 | 657 |
| Packed size | 475,000 bytes | 465,003 bytes |
| Unpacked size | 2,750,000 bytes | 2,707,315 bytes |

Questions to answer:

- Does Codex require a local `plugins/maestro/src` payload, or should it always serve content from the versioned npm package root?
- Does Claude require `claude/src` for detached/offline plugin installs?
- Are runtime roots (`claude/`, `plugins/maestro/`, `qwen/`, root Gemini/Codex files) source-controlled deliverables, release-only artifacts, or package-only artifacts?
- Which runtime docs are authoritative for install and startup behavior?
- Which generated outputs are part of public compatibility?

Acceptance criteria:

- A runtime matrix covering Gemini, Claude, Codex, and Qwen startup paths.
- Content lookup tests for `get_agent` and `get_skill_content` for every runtime.
- Explicit release artifact invariants for detached payloads.
- Explicit npm package invariants for public bins, install helpers, and runtime assets.
- A decision record saying whether implementation targets the live JS topology or a TypeScript/`dist` topology.

## Slice 1: Retire `plugins/maestro/src`

Execution status as of 2026-06-30: complete in this worktree.

Phase 1 results:

- Removed the tracked Codex detached payload: 134 files and 15,655 tracked lines deleted under `plugins/maestro/src`.
- Removed Codex from detached payload generation; at Phase 1 close, only Claude still kept a detached payload.
- Changed the Codex runtime payload contract to package-root `src` with no detached payload for startup, release, or package invariants.
- Narrowed the npm and release artifact Codex allowlists to plugin metadata, runtime guide, README, and skills.
- Added explicit deny checks for retired `plugins/maestro/src` leakage in npm and release artifacts.
- Added a negative MCP integration fixture that launches `bin/maestro-mcp-server.js` from a package-shaped copy after deleting `plugins/maestro/src`, then calls `get_skill_content` and `get_agent`.

Phase 1 package budget gate:

| Budget | Limit | Current verified value |
| --- | ---: | ---: |
| Package entries | 530 | 523 |
| Packed size | 420,000 bytes | 408,859 bytes |
| Unpacked size | 2,050,000 bytes | 2,001,439 bytes |

Measured package delta from Phase 0 close:

| Metric | Phase 0 close | Phase 1 verified | Reduction |
| --- | ---: | ---: | ---: |
| Package entries | 657 | 523 | 134 |
| Packed size | 465,003 bytes | 408,859 bytes | 56,144 bytes |
| Unpacked size | 2,707,315 bytes | 2,001,439 bytes | 705,876 bytes |

### Evidence

Before Phase 1, `plugins/maestro/src` was a detached copy of canonical `src/`, generated by `scripts/generate.js` via `buildDetachedPayload`.

Measured impact:

- 134 package files.
- 15,655 tracked lines.
- 705,876 verified unpacked package bytes from Phase 0 close to Phase 1.
- Most files are byte-identical to canonical `src/`, excluding version metadata.

Codex has a verified retirement path because `bin/maestro-mcp-server.js` loads package-root `src`.

### Resolved Blockers

- `tests/integration/source-of-truth.test.js` now asserts the Codex detached payload is absent.
- `tests/integration/glob-manifest.test.js` no longer encodes a Codex `plugins/maestro/src` output expectation.
- `scripts/release-artifact-manifest.js` no longer reads Codex detached payload version metadata and rejects `plugins/maestro/src` if present.
- `scripts/verify-npm-pack.js` no longer classifies `plugins/maestro/src` as valid package content and rejects it through the shared denied-path gate.
- `docs/runtime-codex.md`, `plugins/maestro/references/runtime-guide.md`, and `plugins/maestro/README.md` now describe package-root `src` for Codex.
- `maestro-install-codex` still copies `plugins/maestro`, but the source plugin no longer contains `src`; the integration test asserts the installed plugin lacks the retired payload.

### Historical Options

Decision status: resolved by selecting the package-root `src` runtime path and retiring the remaining Claude payload.

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Prove and delete `plugins/maestro/src` | Largest practical first win; aligns Codex with npm runtime model | Requires docs, tests, release verifier, generator, package, and installer contract updates together | Medium-high | Git lines, package size, install footprint, drift |
| Keep `plugins/maestro/src` only in release artifacts | Shrinks git while preserving detached plugin packaging | Package/install footprint remains high if npm still ships it | Medium | Git lines, drift |
| Replace with a small bootstrap manifest | Preserves plugin metadata without source mirror | Requires robust bootstrap/install behavior | Medium-high | Git lines, package size |

### Required Proof Status

1. Negative fixture where `plugins/maestro/src` is absent: done in `tests/integration/mcp-server-bundle-behavior.test.js`.
2. Codex MCP startup through package-root server: done through the same fixture and existing Codex bin startup tests.
3. Codex `get_agent` and `get_skill_content` runtime-correct content: done through the same negative fixture.
4. Source-of-truth and glob-manifest payload invariants replaced: done.
5. Release artifact verification no longer requires Codex payload version metadata or `plugins/maestro/src/mcp/maestro-server.js`: done.
6. Codex runtime docs and plugin-facing docs updated: done.
7. Package verification and release artifact verification: done.

## Slice 2: Decide the Detached Payload Model

### Evidence

Original pre-Phase-1 baseline: `claude/src` and `plugins/maestro/src` together duplicated roughly 31k tracked lines and about 1.41 MB unpacked package size.

Superseded post-Phase-1 state: only `claude/src` remained a detached payload. The no-fallback debt-removal slice resolved that decision by retiring `claude/src` as well. The generator now keeps both `claude/src` and `plugins/maestro/src` only as cleanup targets so old generated files are pruned if they reappear locally.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Standardize remaining detached runtime on the npm package root `src/` | Deletes the remaining Claude mirror; removes parity/version stamping | Claude detached/offline marketplace fallback likely breaks | High | Git lines, package size, install footprint, complexity |
| Generate remaining detached payloads only during release/prepack | Keeps standalone artifacts without tracking them | Release pipeline becomes source of generated truth | High | Git lines, drift |
| Replace mirrored trees with content-addressed payload archive | Self-contained installs without hundreds of duplicate files | Debuggability and filesystem assumptions get harder | High | Git lines, package size, file count |
| Keep Claude detached | Avoids breaking Claude fallback after Codex retirement | Leaves one large mirror in place | Medium | Git lines, package size, drift |

### Required Contract

Resolved detached payload contract:

- Standalone copied `claude/` installs without sibling package-root `src/` are not supported.
- Codex npm execution is resolved by Phase 1; any future change should be treated as a new runtime contract change.
- Generated detached payloads are not tracked, prepacked, or release-only artifacts.
- Version stamping for detached payloads is removed because there are no detached payload targets.
- Isolated Claude bundle tests copy the package-root runtime shape (`.claude-plugin/`, `claude/`, and `src/`) and launch `claude/mcp/maestro-server.js`.

## Cross-Cutting Decision: No-Fallback Runtime Usage

Clarification: the target architecture is not "keep every fallback that currently works." The target architecture is one clear usage path per concern, with compatibility fallbacks treated as temporary migration debt unless a runtime contract explicitly proves they are required.

Runtime fallback surfaces removed in the no-fallback slice:

- `claude/mcp/maestro-server.js` now direct-loads package-root `src/mcp/maestro-server.js`.
- `src/mcp/content/provider.js` now supports one filesystem provider and rejects non-`none` fallback declarations.
- `src/platforms/claude/runtime-config.js` and `src/platforms/runtime-payload-contract.js` now model Claude as package-root `src` with no detached payload.
- `src/config/setting-resolver.js` now reads extension `.env` only through `MAESTRO_EXTENSION_PATH`; Claude adapters normalize their host root before shared settings resolution runs.

Remaining non-payload fallback surfaces for later slices:

- `src/mcp/core/project-root-cache.js` exposes a workspace suggestion chain from explicit env, MCP `roots/list`, and `cwd`. Stateful tools already require explicit initialization, but the user-facing guidance still describes multiple discovery paths.
- Slice 8 still tracks legacy script-based session fallback as a later API/state cleanup.

Target option for maximum normalization:

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Single package-root runtime path for all runtimes: public MCP bin plus package-root `src` content | Deletes `claude/src`, removes content provider chains, removes detached payload parity/version stamping, and gives every runtime the same content model | Breaks or changes Claude detached/offline marketplace behavior unless Claude can invoke the package bin or package-root server directly | High | Git lines, package size, install footprint, resolver complexity |
| Single local detached path per runtime, no fallback | Clear runtime behavior and simpler errors | Keeps or increases mirrored payload bloat | Medium | Resolver complexity only |
| Keep fallback chain as migration scaffolding | Eases transition and proves parity before deletion | Violates the no-fallback end state if left in place | Low short-term, high long-term | Nothing unless followed by deletion |

Selected no-fallback slice: single package-root runtime path for all runtimes. The Phase 2 fallback-chain work is retained only as historical migration proof; the steady-state chain was removed.

## Slice 3: Content Provider / Registry

Execution status as of 2026-06-30: Phase 2's provider fallback strategy is historical migration proof, not current architecture. The no-fallback debt-removal slice selected the single package-root runtime content path and removed the provider chain. Registry/blob compaction remains a later option and was not implemented.

### Evidence

Pre-Phase-2, the MCP content layer normalized `primary` and `fallback` policy but always collapsed to a single filesystem provider. Runtime source choice was implicit in entrypoint path resolution rather than owned by the content provider.

Historical Phase 2 added an ordered filesystem provider chain:

- Gemini, Codex, and Qwen remain package-root `src` with `fallback: none`.
- Claude reads detached `claude/src` first and falls back to source-checkout `src` when a known content file is missing.
- Unknown resources and unknown agents remain allowlist errors instead of falling through the provider chain.
- Filesystem read failures remain typed internally so exhausted fallback chains can report every attempted source.
- Raw filesystem reads are separated from runtime materialization so future registry providers can feed the same runtime transforms instead of duplicating transformed copies.

The no-fallback slice now resolves all runtime content through one filesystem provider. Content is not just raw Markdown. It includes:

- generated resource and agent registries
- runtime transforms
- frontmatter stripping/rebuild
- feature and example block handling
- runtime-specific tool mapping
- missing-resource behavior

Phase 2 deliberately did not delete `claude/src`, split packages, narrow `package.json files`, or change release artifact gates. The later no-fallback slice did delete `claude/src`, narrowed package/release surfaces, and changed release artifact gates.

Phase 2 package budget gate:

| Budget | Limit | Current verified value |
| --- | ---: | ---: |
| Package entries | 530 | 523 |
| Packed size | 420,000 bytes | 410,133 bytes |
| Unpacked size | 2,050,000 bytes | 2,011,416 bytes |

Phase 2 adversarial audit results incorporated:

- Restricted fallback to missing-file (`ENOENT`) failures so corrupted or unreadable detached Claude content is not masked by source-checkout fallback.
- Added direct proof that unknown resource and agent IDs fail at the allowlist layer before provider fallback.
- Added Qwen-specific runtime materialization proof for snake_case tool names and Qwen tool mapping.
- Cleared ambient `MAESTRO_EXTENSION_PATH` from static runtime parity launches so bundle tests cannot accidentally read the parent checkout.
- Made npm package size-budget verification fail closed when `npm pack` omits packed or unpacked size metadata.
- Added `qwen/agents` to the owned generated roots so stale Qwen stubs are pruned.
- Removed canonical `src/` from Qwen generated-surface classification.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Add provider fallback chain | Allows package-root `src/`, runtime-local payload, or bundled registry | More resolver complexity | Medium | Drift, detached payload pressure |
| Generate a content registry | Single file or small set of files can replace mirrored trees | New format and tooling; harder manual inspection | Medium-high | File count, package size, drift |
| Use content-addressed blobs | Integrity and dedupe improve; release artifacts get smaller | Debugging and patching prompt content gets harder | High | Package size, file count |
| Pre-render runtime-specific content | Removes read-time transform logic | Can increase generated content unless paired with pruning | Medium | Runtime complexity |

Selected Phase 2 option at implementation time: provider fallback chain, filesystem-only. Updated architectural interpretation: this is migration scaffolding for proving runtime parity, not the desired steady state. The no-fallback slice should collapse this back to one content source after the Claude/package-root contract is decided.

### Required Proof Status

- `get_agent` across all runtimes: done, including Qwen runtime launch and isolated Claude plugin.
- `get_skill_content` across all runtimes: done, including Qwen runtime launch and isolated Claude plugin.
- runtime transform semantics: done for fallback through handler-level Claude skill transforms and integration content checks.
- agent tool mapping: done for fallback through handler-level Claude agent transforms.
- missing-resource errors: done for single-source Codex and exhausted Claude fallback chain.
- explicit fallback-chain behavior: done for Claude fallback success, primary-wins behavior, and exhausted-chain reporting.
- package-root startup with runtime-local payload absent where applicable: Codex remains done from Phase 1; Claude checkout fallback is now proven when selected detached content files are absent.
- generated registry semantics: not applicable to selected Phase 2 strategy; required before any later registry/blob implementation.

## Slice 4: Split Package Artifacts / Narrow Package Surface

Execution status as of 2026-07-01: complete in this worktree for the one-package classified surface strategy plus explicit runtime-source package hardening. Server/extension package split and per-runtime packages remain future options and were not implemented in this slice.

### Evidence

Pre-Phase-3, the npm package shipped all runtime roots, source, docs, and root `scripts/` through the `package.json` `files` allowlist.

The original runtime-only package estimate is only valid for a server-only package. The package also exposes `maestro-install-codex`, and that installer copies `plugins/maestro` out of the installed package.

At Phase 3 close, the single package remained because Gemini, Codex, and Qwen used package-root `src`, Claude still required `claude/src`, and Codex install support still needed `plugins/maestro`. The no-fallback slice supersedes the Claude part of that rationale: all runtimes now use package-root `src`. The public command contract is the npm bin name, not a root `scripts/` path:

- `maestro-install-codex` now resolves to `bin/maestro-install-codex.js`.
- `maestro-mcp-server` remains `bin/maestro-mcp-server.js`.
- root `scripts/` are classified as private source-checkout release/dev tooling and are denied from npm package and release artifacts.
- package verification fails if any root `scripts/` path appears in `npm pack`.
- a packed-package integration test installs the generated tarball and runs both public bins from the installed package.
- package and release verification now use a shared runtime-source inventory for the runtime subset of package-root `src`.
- build-only source-checkout tooling under `src/generator`, `src/transforms`, `src/entry-points`, `src/lib/discovery`, `src/lib/yaml-emit.js`, `src/manifest.js`, platform metadata builders, and `src/platforms/runtime-payload-contract.js` is unclassified for npm and unallowlisted for release artifacts.

Current package budget gate after package-source hardening:

| Budget | Limit | Current verified value |
| --- | ---: | ---: |
| Package entries | 360 | 344 |
| Packed size | 325,000 bytes | 313,372 bytes |
| Unpacked size | 1,200,000 bytes | 1,161,725 bytes |

Measured package delta from no-fallback close:

| Metric | No-fallback verified | Package-source hardening verified | Reduction |
| --- | ---: | ---: | ---: |
| Package entries | 378 | 344 | 34 |
| Packed size | 335,462 bytes | 313,372 bytes | 22,090 bytes |
| Unpacked size | 1,240,329 bytes | 1,161,725 bytes | 78,604 bytes |

Release artifact delta from no-fallback close:

| Metric | No-fallback verified | Package-source hardening verified | Reduction |
| --- | ---: | ---: | ---: |
| Archive entries | 490 | 451 | 39 |

Measured package delta from Phase 2 close:

| Metric | Phase 2 verified | Phase 3 verified | Reduction |
| --- | ---: | ---: | ---: |
| Package entries | 523 | 513 | 10 |
| Packed size | 410,133 bytes | 398,648 bytes | 11,485 bytes |
| Unpacked size | 2,011,416 bytes | 1,963,817 bytes | 47,599 bytes |

Phase 3 adversarial audit results incorporated:

- Corrected packaged changelog text so the legacy/offline Codex installer is the `maestro-install-codex` bin, not the removed root script path.
- Updated the report intro so completed phases do not contradict the slice status sections.
- Strengthened the packed-package smoke test to set `MAESTRO_RUNTIME=codex`, assert `get_runtime_context` returns Codex, run the installed `maestro-install-codex` non-dry-run against a temp home, and launch `maestro-mcp-server` through the installed npm bin.
- Verified the installed package copies Codex plugin metadata, skills, and references while keeping `plugins/maestro/src` absent.
- Narrowed the release artifact bin allowlist to the two public bin files and added a negative release-gate test for private bin leakage.
- Made `npm run pack:verify` print entry, packed-byte, and unpacked-byte metrics for direct auditability.
- Added an Unreleased changelog entry for the package-surface change. Public bin names are preserved; treating root `scripts/` as public would require a separate semver decision.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Split server package from extension artifacts | Cleanest public contract; users install only needed artifacts | Release matrix and version coordination get more complex | Medium-high | Package size, install footprint |
| Publish per-runtime packages | Maximum per-user footprint reduction | More packages, more docs, more compatibility paths | High | Package size, install footprint, runtime clutter |
| Keep one package but classify files by public role | Simpler than package split; can remove release/dev internals | Must preserve Codex installer and plugin assets | Medium | Package size |
| Move public install helper from `scripts/` to `bin/` | Allows `scripts/` to become dev/release-only | Bin path migration and docs update required | Medium | Package clarity, package size |

### Required Proof

Before narrowing `files`:

- Classify every published script as public bin, runtime support, release-only, or dev-only: done. Root `scripts/` are private release/dev tooling; public commands live under `bin/`.
- Add a positive npm package inventory gate, not just required/denied path checks: done.
- Keep `src/` fully packaged until content provider/registry strategy is proven: superseded by the no-fallback decision and this hardening slice; the package now ships only the runtime-source inventory.
- Preserve `maestro-install-codex` or replace it with a separate extension artifact: done, preserved as a public npm bin.
- Verify package entry count, unpacked bytes, required public files, and forbidden private prefixes: done through `npm run pack:verify` and the packed-package smoke test.

## Slice 5: Normalize Prompt and Methodology Content

Execution status as of 2026-07-01: complete in this worktree.

Phase 5 results:

- Re-measured existing tracked Markdown after retiring payload mirrors: 235 files, 0 exact duplicate groups, 0 exact duplicate files, and 0 exact redundant lines after excluding retired `claude/src/**` and `plugins/maestro/src/**` cleanup roots.
- Confirmed the remaining reduction lever is semantic duplication, not exact duplicate Markdown.
- Added `tests/integration/delegation-protocol-invariant.test.js` to enforce that runtime delegation paths load `delegation` and that the shared protocols are loaded before agent delegation.
- Added `tests/unit/agent-output-contract.test.js` to keep the full handoff template centralized in `agent-base-protocol.md` and prevent the per-agent template from returning.
- Replaced the duplicated output-contract template in all 39 canonical agents with a shared-protocol pointer.
- Measured source delta for `src/agents`: 39 insertions, 780 deletions, net 741 lines removed.
- Measured npm package delta from the package-source hardening close: packed bytes dropped from 313,372 to 310,426; unpacked bytes dropped from 1,161,725 to 1,115,627.
- Preserved the fallback pointer in each agent body until protocol injection is enforced by more than prompt-level tests.

### Evidence

Original pre-Phase-1 baseline: tracked Markdown was 33,081 lines. Exact duplicate Markdown groups accounted for about 16,350 redundant lines across all tracked Markdown, but those exact duplicates were entirely a payload-mirror effect: after excluding `claude/src/**` and `plugins/maestro/src/**`, exact duplicate Markdown groups dropped to zero.

Post-no-fallback state: both detached payload mirrors are removed, so this slice should be remeasured before starting prompt/content normalization. Remaining exact-duplicate pressure is expected to come from public generated stubs, not payload mirrors.

Therefore this slice should be treated as semantic/content normalization after payload-mirror decisions, not as the main duplicate-line reduction lever.

Content surfaces to inventory separately:

| Surface | Examples | Notes |
| --- | --- | --- |
| Canonical prompt content | `src/agents`, `src/skills/shared`, `src/references` | Source of behavior. |
| Retired payload mirrors | `claude/src/**`, `plugins/maestro/src/**` | Cleanup-only roots; they should remain absent. |
| Generated runtime stubs | `agents/`, `claude/agents/`, `qwen/agents/`, runtime `skills/` | Smaller but public runtime content. |
| Runtime docs | `docs/runtime-*.md`, `GEMINI.md`, `QWEN.md`, `claude/README.md` | Drift-prone public docs. |
| Ignored local/session artifacts | `docs/maestro/**`, `docs/superpowers/**` | Local noise, not tracked/package bloat. |

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Extract shared handoff contract from agents | Reduces semantic duplication and prompt tokens | Risky unless every delegation path prepends `agent-base-protocol` before agent body | Medium-high until invariant is tested | Markdown, prompt tokens, drift |
| Generate roster/capability views from richer metadata | Removes manual drift | Current registry lacks task-domain and primary/secondary selection semantics | Medium | Drift, docs lines |
| Tier agent methodology into short default plus deep playbook | Reduces default prompt load | No current playbook/resource retrieval contract exists | Medium-high | Prompt tokens, Markdown |
| Move examples out of default payload | Reduces per-agent token load | Claude registration currently embeds examples by runtime contract | Medium-high | Prompt tokens, package size |
| Convert runtime docs to generated matrix | Single source for repeated runtime facts | Less hand-crafted docs if overdone | Low-medium | Docs drift, docs lines |

### Required Proof

Before shrinking prompt bodies:

- Prove every runtime delegation path prepends shared protocols before agent bodies: done for generated entry points, execute/resume commands, standard orchestration, and express orchestration with `tests/integration/delegation-protocol-invariant.test.js`.
- Keep a fallback pointer in each agent body until that invariant is enforced: done in all 39 canonical agents.
- Add a playbook resource type before tiering methodology.
- Split Claude registration examples from MCP-served examples.
- Add generated Claude stub tests before moving examples.
- Add richer canonical agent metadata before generating planning/delegation tables.
- Re-measure Markdown duplication after payload mirrors are removed: done; exact duplicate count is zero, so Phase 5 avoided exact-duplicate chasing.

## Slice 6: Tests, CI, and Release Scripts

Execution status as of 2026-07-01: complete in this worktree for the low-risk harness and command-consolidation slice. Broader release-CLI unification and aggressive table-driving remain intentionally deferred.

Phase 6 results:

- Added `tests/support/mcp.js` with focused helpers for temporary workspaces, MCP server construction, workspace initialization, `docs/maestro` setup, workspace file writes, session frontmatter reads, and common phase fixtures.
- Converted representative session, design-gate, workspace/content tool-pack, plan-contract, workspace-requirement, and reconciliation-flow tests to use the shared setup helpers without renaming or flattening scenario tests.
- Added `npm run check:source` for source generation, drift, layer, and test validation.
- Added `npm run check:release` for npm package verification and release artifact verification.
- Added `just source-check` and `just release-check`, with `just ci` remaining source-validation focused rather than absorbing release/package gates.
- Updated generator-check and stable release workflows to use both shared checks.
- Updated nightly, preview, RC, and prepare-release workflows to use the shared source check while retaining their runtime versioning, package verification, publishing, and PR/comment policy steps.
- Current package/release metrics after the command-surface changes: 344 npm entries, 310,507 packed bytes, 1,115,866 unpacked bytes, 451 release archive entries, and 358,750 release archive bytes.

### Evidence

Tests total 15,789 tracked lines:

- `tests/unit`: 10,499 lines
- `tests/integration`: 2,948 lines
- `tests/transforms`: 2,342 lines

Observed repeated patterns:

- `fs.mkdtempSync` appears about 100 times across 39 test files.
- `initialize_workspace` is repeated about 33 times.
- `phases: [` fixtures repeat about 34 times.
- CI repeats full `node --test` commands.
- CI and release scripts repeat `node scripts/generate.js` and `npm run pack:verify`.
- Release helper scripts account for most of `scripts/`.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Add `tests/support` workspace/session/MCP harness | Removes repeated setup while preserving coverage | Multi-file churn | Medium | Test lines, maintenance |
| Table-drive low-level parser/frontmatter/manifest tests | Collapses repeated assertions and payloads | Failures can be less narrative | Low-medium | Test lines |
| Preserve scenario-named design/session tests | Maintains behavior clarity for hard gates | Less raw line reduction | Low | Regression risk |
| Create shared source-check and release-check commands | One command source without dropping release gates | Must not equate `just ci` with package/release verification | Medium | Workflow lines, maintenance |
| Build one release CLI with subcommands | Deletes wrapper script sprawl | Release event/token/branch/tag policy is currently encoded in workflows | High | Script lines, workflow lines |
| Stop publishing private release scripts | Package no longer ships release internals | Requires positive package inventory gate and public bin migration | Medium | Package size |

### Required Guardrails

- Limit the shared test harness to setup helpers for high-scenario tests.
- Preserve named scenarios for Plan Mode materialization, session mismatch/orphan gate behavior, `NOT_FOUND` sequencing, string phase IDs, archive behavior, and handoff validation.
- Only table-drive low-level parser/frontmatter-style tests first.
- Do not replace workflow release/package steps with `just ci`; local `just ci` does not currently include npm pack and release artifact verification.
- Keep GitHub event, token, label, branch, and tag policy visible in workflows unless the release CLI has explicit tested modes for stable, recovery, RC, preview, and nightly.
- Add a positive npm package inventory gate before deciding which scripts remain published.

## Slice 7: Runtime Portfolio Pruning

### Evidence

The project publicly supports Gemini, Claude, Codex, and Qwen. Qwen shares implementation patterns with Gemini, but it is still a first-class public runtime with its own docs, manifests, env behavior, tool mappings, hooks, agent stubs, and package entries.

The package-size win from pruning Qwen is small relative to the payload mirror opportunities.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Deduplicate Qwen implementation while preserving Qwen support | Reduces implementation drift without product break | Needs careful runtime config and docs tests | Medium | Complexity, some runtime lines |
| Deprecate or remove Qwen as product runtime | Larger clean break | Breaks public support and install docs | High | Runtime lines, package size, complexity |
| Drop or split less-used specialist agents | Reduces 39-agent catalog, stubs, registry, package content | Agent names are runtime/API contract, not just plan references | Medium-high | Source lines, runtime lines, prompt selection complexity |
| Split specialists into optional packs | Keeps capability while reducing default install | Retrieval/install complexity increases | High | Default package size, prompt catalog size |

### Required Compatibility Checklist

For Qwen changes:

- `qwen-extension.json`
- `QWEN.md`
- `MAESTRO_RUNTIME=qwen`
- Qwen tool-name overrides
- `qwen/hooks.json`
- `qwen/agents`
- package `files`
- docs/examples
- release artifact verification
- semver/deprecation decision

For agent catalog changes:

- aliases in `get_agent` and plan validation
- generated roster/capability docs
- runtime-context optional-pack metadata
- `MAESTRO_DISABLED_AGENTS` name behavior
- migration guidance for stored plans
- release notes for removed public agent names

## Slice 8: MCP API and State-Machine Simplification

### Evidence

The architecture exposes many MCP tools, including session, design gate, validation, content, workspace, and reconciliation surfaces. Session/design/reconciliation logic is spread across large handlers and tool packs.

Large modules include:

- `src/mcp/handlers/session-state-tools.js`
- `src/mcp/handlers/design-gate.js`
- `src/mcp/handlers/reconciliation.js`
- `src/mcp/tool-packs/session/index.js`
- `src/mcp/core/protocol-dispatcher.js`

This is a public wire-contract migration, not just a source cleanup.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Introduce state-machine internals behind existing tool names | Simplifies implementation without immediate API break | Adapters must preserve current schemas and errors | Medium | Source complexity |
| Add versioned v2 MCP tools | Clean migration path | Temporarily increases surface | Medium-high | Long-term source complexity |
| Collapse session/design/reconciliation into a new API | Strongest API simplification | Breaking MCP API and skill rewrite | High | Source lines, complexity |
| Generate MCP tool contracts from a single registry | Eliminates tool pack/schema drift | Must preserve wire shape | Medium | Source lines, drift |
| Remove script-based session fallback | Simplifies state access | Completed by moving generated commands and shared skills to MCP-only state tools | Medium-high | Complexity |

### Required Proof

Before API simplification:

- Golden tests for `tools/list`.
- Golden tests for `tools/call` success and error payloads.
- Compatibility tests for `transition_phase`.
- Design content/path variant tests.
- Reconciliation, resume, and archive tests.
- Active-session and design-gate file compatibility checks.
- Proof that Gemini/Qwen `/maestro:resume` and status flows use MCP state tools instead of pre-turn shell-injected state context.

## Slice 9: Generated Output Inventory and Tracking Strategy

### Evidence

`src/manifest.js` currently contains only two manifest rules, while the generator also writes outputs from:

- registry scanner
- manifest outputs
- entrypoint expanders
- platform metadata
- stale-pruner owned dirs
- version stamping
- package `files`
- release artifact allowlists
- generated-surface inventory and retired cleanup roots

`--dry-run` and `--diff` do not exercise every cleanup path; write-mode generation is still required to prove stale-pruned roots stay absent. Detached payload copy/version-stamping is no longer a generator write path after Phase 4.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Add full generated-surface inventory and orphan gate | Prevents hidden generated bloat | Adds process before deletion | Low-medium | Drift |
| Replace generic manifest DSL with explicit output contract | Removes abstraction that may not earn its cost | Less future flexibility | Medium | Source lines, complexity |
| Stop tracking generated runtime roots | Large git reduction | Conflicts with current tests and release verifier until contract changes | High | Git lines |
| Keep generated roots but package fewer of them | Lower package risk than deleting from git | Repo stays large | Medium | Package size |

### Required Proof

Before untracking generated runtime roots:

- Run a real generation/prepack path in a staging location, not only `--dry-run`.
- Prove release/prepack artifacts regenerate and start without tracked roots.
- Update release verification and source-of-truth tests in the same plan.
- Add absence checks for forbidden generated prefixes when a payload is retired.
- Add package-size and package-entry budgets to prevent regressions.

## Slice 10: Local Ignored Artifacts

### Evidence

The workspace contains ignored artifacts such as `coverage/` and `node_modules/`.

These do not affect tracked repo size or npm package size, but they do affect local disk footprint and search noise.

### Options

| Option | Pros | Cons | Risk | Reduces |
| --- | --- | --- | --- | --- |
| Clean ignored coverage artifacts | Frees local disk and reduces accidental search noise | No repo/package benefit | Low | Local workspace only |
| Keep ignored artifacts out of reports by default | Keeps bloat analysis focused | None | Low | Analysis noise |

## Cross-Slice Acceptance Criteria

Every implementation slice should define:

- target tracked-line reduction
- target package entry and unpacked-byte budget
- forbidden path prefixes after the slice
- runtime startup matrix for Gemini, Claude, Codex, and Qwen
- content checks for `get_agent` and `get_skill_content`
- release tarball checks
- npm pack checks
- source drift checks
- generated-output orphan checks
- compatibility/deprecation plan for public runtime or agent-name changes

Minimum validation set for payload/package slices:

- `node scripts/generate.js`
- `node scripts/generate.js --diff`
- full Node test suite
- package verification
- release artifact verification
- runtime startup/content checks for each affected runtime

The exact command names should be confirmed against the live branch before implementation because the project instructions and live JS topology currently disagree.

## Suggested First Implementation Plan

Phase 0: Contract and inventory

1. Decide live JS versus TypeScript/`dist` topology.
2. Write the runtime payload contract.
3. Add generated-surface inventory covering all output producers.
4. Add positive package inventory gate.
5. Add package-size and package-entry budgets.

Phase 1: Codex payload retirement proof

Execution status: complete in this worktree.

1. Added a negative test with `plugins/maestro/src` absent.
2. Proved Codex startup and content serving still work from package-root `src`.
3. Replaced tests and release verifier invariants that require Codex payload files.
4. Updated plugin-facing docs and Codex runtime docs.
5. Removed Codex detached payload generation.
6. Removed `plugins/maestro/src` from package/release allowlists.
7. Re-measured tracked lines and npm package size.

Phase 2: Content provider strategy

Execution status: complete in this worktree as interim migration proof; superseded by the no-fallback debt-removal slice above.

1. Implemented a filesystem provider fallback chain and kept registry/blob compaction as a later option.
2. Added provider, handler, runtime-contract, source-of-truth, and MCP bundle parity tests.
3. Proved Claude detached behavior with isolated bundled sentinels and proved checkout fallback to package-root `src` when selected detached content is missing.
4. Kept `claude/src` tracked and packaged; no package split or package narrowing was done in this phase.
5. Follow-up under the clarified goal: complete. The fallback chain was deleted once the no-fallback runtime path was approved.

Phase 3: Package surface split

Execution status: complete in this worktree.

1. Classified root `scripts/` as private source-checkout release/dev tooling.
2. Kept one package for now; server/extension split and per-runtime packages remain deferred.
3. Moved the public Codex install helper to `bin/maestro-install-codex.js` while preserving the `maestro-install-codex` bin name.
4. Removed root `scripts/` from package content and added package/release denial checks.
5. Added a packed-package smoke test that installs the tarball and runs both public bins.
6. Follow-up hardening complete in the no-fallback slice: Claude package/release allowlists now enumerate public subpaths instead of allowing all of `claude/`.
7. Follow-up package-source hardening complete: npm and release artifacts now enumerate the runtime-source subset under `src/` and reject build-only source-checkout tooling.

Phase 4: No-fallback runtime path

Execution status: complete and validated in this worktree.

1. Retired `claude/src/**` and removed detached payload copy/version-stamp machinery.
2. Collapsed Claude to package-root `src` with `fallback: none`.
3. Removed the content provider chain and made non-`none` fallback declarations fail closed.
4. Direct-loaded package-root `src` from Claude MCP, hook, policy, and adapter wrappers.
5. Replaced isolated-Claude payload tests with package-root runtime tests.
6. Added package/release guards rejecting both retired detached payload roots.
7. Added installed-package proof for Claude policy enforcer and adapter stubs with `claude/src` absent.
8. Reworded Codex state-file docs and Claude architecture references so they no longer imply a runtime content fallback path.

Phase 5: Prompt/content normalization

Execution status: complete in this worktree.

1. Re-measured after payload mirrors were addressed.
2. Extracted the shared handoff contract after adding protocol-prepend invariant tests.
3. Add richer agent metadata before generating roster views.
4. Treat Claude examples as runtime registration contract.

Phase 6: Tests and release consolidation

1. Add `tests/support` harness.
2. Convert repeated setup without flattening scenario tests.
3. Consolidate source-check and release-check commands separately.
4. Keep workflow policy visible until release CLI modes are explicit and tested.

## Adversarial Audit Summary

Status: complete. Five read-only subagents audited the report by slice.

Validated amendments incorporated:

- Added Phase 0 runtime payload contract before any deletion.
- Reordered package narrowing behind content resolution.
- Added generated-surface inventory before untracking generated outputs.
- Clarified that Codex payload deletion conflicts with current tests/release verification until those contracts are changed.
- Added plugin-facing Codex docs and `maestro-install-codex` as public package-surface constraints.
- Corrected prompt-content duplicate counting: exact Markdown duplicates are payload-mirror-driven.
- Raised risk for handoff-contract extraction, playbook tiering, and Claude example movement.
- Preserved scenario-named tests while allowing setup harnesses and low-level matrix tests.
- Separated source CI gates from release/package gates.
- Treated Qwen and the 39-agent catalog as public compatibility surfaces.
- Treated MCP simplification as a wire-contract migration, not a local refactor.

Remaining decision points:

- Codex npm package execution instead of a local payload: resolved in Phase 1.
- Claude detached/offline installs without package-root `src/`: resolved as unsupported in the no-fallback slice.
- Whether the package should split into server and extension artifacts.
- Whether Qwen or specialist agents should be product-deprecated, deduplicated, or optionalized.
- Whether implementation proceeds on the current JS topology or waits for TypeScript/`dist` reconciliation.
