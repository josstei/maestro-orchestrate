# Runtime Payload Contract

Date: 2026-07-07

This contract records the runtime startup paths, content roots, detached payload requirements, and public package invariants that must stay true until a later phase deliberately changes them.

## Topology Decision

Implementation is in the Phase 6 dist-only package/release contract.

- Canonical implementation source is TypeScript under `src/`. Canonical
  Markdown/templates remain authored under `src/`.
- Repo commands and public package bins execute compiled NodeNext ESM output
  under `dist/src/`.
- The npm package and release artifacts ship the explicit compiled runtime
  inventory under `dist/src` plus public generated runtime surfaces. They do
  not ship package-root raw implementation source under `src`.
- `src/bin/maestro-mcp-server.ts` and `src/bin/maestro-install-codex.ts`
  are the TypeScript sources for the public package bins. They emit to
  `dist/src/bin` under the Phase 1 `rootDir: "."` dist topology.
- Root `bin/`, root `scripts/`, root `src/`, tests, local Maestro state, private
  dist tooling, declaration files, and source maps are not package/release
  artifacts.

## Planned TypeScript/Dist Topology

Option 1 is the active terminal topology.

- Canonical implementation source is `src/**/*.ts`, with canonical
  Markdown/templates still authored under `src/`.
- Runtime JavaScript is emitted by `tsc` under `dist/src/`.
- Public bins execute compiled `dist/src` output. Directly-runnable generated MCP
  wrappers remain public generated runtime surfaces and load compiled
  `dist/src` runtime modules.
- MCP pack registration is authored in `src/mcp/tool-packs/**` as typed
  command tables and emitted into `dist/src/mcp/tool-packs/**`.
- npm and release artifacts ship runtime-only `dist/src` subtrees plus public
  generated runtime surfaces, not package-root raw implementation source.

The machine-readable planned target is
`PLANNED_TOPOLOGY_DECISION` in `src/platforms/runtime-payload-contract.ts`.

No payload mirror should be deleted, untracked, or removed from the npm package until the runtime row below is changed in the code contract and verified by tests. Phase 1 changed the Codex row; the no-fallback debt-removal slice changed the Claude row. No runtime now requires a detached `src` payload mirror.

The machine-readable source for this contract is `src/platforms/runtime-payload-contract.ts`.

## Runtime Matrix

| Runtime | Startup manifest | Startup entrypoint | Content root | Detached payload | Current release invariant |
| --- | --- | --- | --- | --- | --- |
| Gemini | `gemini-extension.json` | npm bin `maestro-mcp-server` -> `dist/src/bin/maestro-mcp-server.js` | package/root `dist/src` registry | None | root generated runtime files plus dist runtime inventory and `dist/src/generated/runtime-content-registry.*` |
| Claude | `.claude-plugin/plugin.json` -> `claude/.mcp.json` | npm bin `maestro-mcp-server` -> `dist/src/bin/maestro-mcp-server.js` | package/root `dist/src` registry | None | `.claude-plugin/plugin.json`, `claude/.mcp.json`, `claude/mcp/maestro-server.js`, dist runtime inventory, and `dist/src/generated/runtime-content-registry.*` |
| Codex | `plugins/maestro/.mcp.json` | npm bin `maestro-mcp-server` -> `dist/src/bin/maestro-mcp-server.js` | package/root `dist/src` registry | None | `dist/src/bin/maestro-mcp-server.js`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, dist runtime inventory, and `dist/src/generated/runtime-content-registry.*` |
| Qwen | `qwen-extension.json` | npm bin `maestro-mcp-server` -> `dist/src/bin/maestro-mcp-server.js` | package/root `dist/src` registry | None | root generated runtime files plus dist runtime inventory and `dist/src/generated/runtime-content-registry.*` |

## Package Invariants

The npm package must keep these categories until the corresponding runtime contract changes:

- public package bins: `dist/src/bin/maestro-mcp-server.js` and `dist/src/bin/maestro-install-codex.js`
- generated runtime content registry: `dist/src/generated/runtime-content-registry.json` plus its raw content payload at `dist/src/generated/runtime-content-registry.txt`
- compiled runtime output: the explicit `dist/src/bin` and `dist/src` runtime inventory in `src/tooling/lib/artifact-inventory.ts`, mirrored by `package.json` `files`
- generated root runtime files: `agents/`, `commands/`, `hooks/`, `mcp/`, `policies/`, `gemini-extension.json`, `qwen-extension.json`
- Claude plugin runtime: root `.claude-plugin/` metadata plus explicit public `claude/` surfaces only; it must not include `claude/src`
- Codex plugin runtime: `plugins/maestro/` public metadata, runtime guide, and skills; it must not include `plugins/maestro/src`
- Qwen runtime: `qwen/`
- selected public docs listed in `package.json files`
- root `bin/`, root `scripts/`, and root `src/` are source-checkout only and must not be packaged
- build-only dist tooling is source-checkout only and must not be packaged: `dist/src/tooling/`, `dist/src/generator/`, `dist/src/transforms/`, `dist/src/entry-points/`, `dist/src/lib/discovery/`, `dist/src/lib/yaml-emit.js`, `dist/src/manifest.js`, platform metadata builders, and `dist/src/platforms/runtime-payload-contract.js`
- declaration files and source maps are not public runtime artifacts

`npm run pack:verify` enforces the package inventory and size budgets.

## Acceptance Tests

The payload contract is covered by these checks:

- `get_agent` reads runtime-correct content for Gemini, Claude, Codex, and Qwen.
- `get_skill_content` reads runtime-correct content for Gemini, Claude, Codex, and Qwen.
- Claude content lookup uses package-root `dist/src` with no fallback chain.
- Every runtime contract has existing startup manifests, entrypoints, package invariants, and docs.
- The release artifact manifest rejects retired Claude and Codex detached payloads.
- The release artifact manifest rejects package-root `src`, root `scripts`, root `bin`, private dist tooling, declaration files, and source maps.
- The npm package gate rejects unclassified package entries, root `scripts` leakage, package-root `src`, root `bin`, private dist tooling, declaration files, and source maps.
- The packed-package smoke test installs the tarball and runs `maestro-install-codex` and `maestro-mcp-server` from the installed package through the compiled `dist/src/bin` targets.

## Historical Payload Cleanup Note

The earlier payload-cleanup migration retired `plugins/maestro/src` by changing this contract so Codex no longer lists that detached payload as a release/package invariant, then updating:

- `src/tooling/release-artifact-manifest.ts`
- `src/tooling/verify-npm-pack.ts`
- Codex runtime docs and plugin-facing docs
- source-of-truth and glob-manifest tests
- a negative startup/content fixture with `plugins/maestro/src` absent
