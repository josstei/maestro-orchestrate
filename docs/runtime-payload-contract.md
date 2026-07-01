# Runtime Payload Contract

Date: 2026-07-01

This contract records the runtime startup paths, content roots, detached payload requirements, and public package invariants that must stay true until a later phase deliberately changes them.

## Topology Decision

Implementation targets the live JS source-first topology.

- Canonical source is `src/**/*.js`, plus canonical Markdown/templates under `src/`.
- Runtime entrypoints are CommonJS files generated into root runtime directories, `claude/`, `plugins/maestro/`, and `qwen/`.
- `bin/maestro-mcp-server.js` loads `src/mcp/maestro-server.js` from the npm package root.
- The package and release artifacts ship only the explicit runtime-source inventory under package-root `src`, not the source-checkout generator, transform, metadata-builder, or manifest tooling.
- `AGENTS.md` currently describes a TypeScript/`dist` topology. Treat that as a separate topology-reconciliation track, not as the contract for this phase.

No payload mirror should be deleted, untracked, or removed from the npm package until the runtime row below is changed in the code contract and verified by tests. Phase 1 changed the Codex row; the no-fallback debt-removal slice changed the Claude row. No runtime now requires a detached `src` payload mirror.

The machine-readable source for this contract is `src/platforms/runtime-payload-contract.js`.

## Runtime Matrix

| Runtime | Startup manifest | Startup entrypoint | Content root | Detached payload | Current release invariant |
| --- | --- | --- | --- | --- | --- |
| Gemini | `gemini-extension.json` | `mcp/maestro-server.js` | package/root `src` | None | root generated runtime files plus the runtime-source inventory under package-root `src` |
| Claude | `.claude-plugin/plugin.json` -> `claude/.mcp.json` | `claude/mcp/maestro-server.js` | package/root `src` | None | `.claude-plugin/plugin.json`, `claude/.mcp.json`, `claude/mcp/maestro-server.js`, runtime-source inventory under package-root `src` |
| Codex | `plugins/maestro/.mcp.json` | npm bin `maestro-mcp-server` via `npx -p @josstei/maestro@<version>` | package/root `src` | None | `bin/maestro-mcp-server.js`, `plugins/maestro/.codex-plugin/plugin.json`, `plugins/maestro/.mcp.json`, runtime-source inventory under package-root `src` |
| Qwen | `qwen-extension.json` | `mcp/maestro-server.js` | package/root `src` | None | root generated runtime files plus the runtime-source inventory under package-root `src` |

## Package Invariants

The npm package must keep these categories until the corresponding runtime contract changes:

- public bins: `bin/maestro-mcp-server.js` and `bin/maestro-install-codex.js`
- canonical runtime source: the explicit runtime-source inventory in `scripts/release-artifact-manifest.js`, mirrored by `package.json` `files`
- generated root runtime files: `agents/`, `commands/`, `hooks/`, `mcp/`, `policies/`, `gemini-extension.json`, `qwen-extension.json`
- Claude plugin runtime: root `.claude-plugin/` metadata plus explicit public `claude/` surfaces only; it must not include `claude/src`
- Codex plugin runtime: `plugins/maestro/` public metadata, runtime guide, and skills; it must not include `plugins/maestro/src`
- Qwen runtime: `qwen/`
- selected public docs listed in `package.json files`
- root `scripts/` are source-checkout release/dev tooling only and must not be packaged
- build-only `src` tooling is source-checkout only and must not be packaged: `src/generator/`, `src/transforms/`, `src/entry-points/`, `src/lib/discovery/`, `src/lib/yaml-emit.js`, `src/manifest.js`, platform metadata builders, and `src/platforms/runtime-payload-contract.js`

`npm run pack:verify` enforces the package inventory and size budgets.

## Acceptance Tests

The payload contract is covered by these checks:

- `get_agent` reads runtime-correct content for Gemini, Claude, Codex, and Qwen.
- `get_skill_content` reads runtime-correct content for Gemini, Claude, Codex, and Qwen.
- Claude content lookup uses package-root `src` with no fallback chain.
- Every runtime contract has existing startup manifests, entrypoints, package invariants, and docs.
- The release artifact manifest rejects retired Claude and Codex detached payloads.
- The release artifact manifest rejects build-only `src` tooling outside the runtime-source inventory.
- The npm package gate rejects unclassified package entries, root `scripts/` leakage, build-only `src` tooling, and package budget growth.
- The packed-package smoke test installs the tarball and runs `maestro-install-codex` and `maestro-mcp-server` from the installed package.

## Phase 1 Status

Phase 1 retires `plugins/maestro/src` by changing this contract so Codex no longer lists that detached payload as a release/package invariant, then updating:

- `scripts/release-artifact-manifest.js`
- `scripts/verify-npm-pack.js`
- Codex runtime docs and plugin-facing docs
- source-of-truth and glob-manifest tests
- a negative startup/content fixture with `plugins/maestro/src` absent
