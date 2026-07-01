# Generated Surface Inventory

Date: 2026-07-01

This is the Phase 0 inventory of generated and package-controlled surfaces. It exists because `src/manifest.js` covers only transform outputs; the generator and release tooling also write registries, entrypoints, metadata, stale-pruned roots, and package/release allowlists.

The machine-readable source for generator-owned directories and retired cleanup roots is `src/generator/generated-surface-inventory.js`.

## Producers

| Surface | Producer | Write mode | Outputs | Public status |
| --- | --- | --- | --- | --- |
| Registry outputs | `src/generator/registry-scanner.js` | `generate` / `prepack` | `src/generated/agent-registry.json`, `src/generated/resource-registry.json`, `src/generated/hook-registry.json` | outputs tracked and packaged; producer source is source-checkout only |
| Manifest transform outputs | `src/manifest.js` through `src/generator/manifest-expander.js` | `generate` / `prepack` | `agents/*.md`, `claude/agents/*.md`, `qwen/agents/*.md`, `claude/skills/*/SKILL.md`, `plugins/maestro/skills/*/SKILL.md` | outputs tracked and packaged; producer source is source-checkout only |
| Entry point outputs | `src/generator/entry-point-expander.js` | `generate` / `prepack` | `commands/maestro/*.toml`, `claude/skills/*/SKILL.md`, `plugins/maestro/skills/*/SKILL.md` | outputs tracked and packaged; producer source is source-checkout only |
| Platform metadata | `src/platforms/*/metadata.js` | `generate` / `prepack` | extension manifests, marketplace files, plugin manifests, MCP configs | outputs tracked and packaged; metadata builder source is source-checkout only |
| Stale pruning | `src/generator/stale-pruner.js` | write-mode generation only | `agents`, `claude/agents`, `qwen/agents`, `claude/skills`, `plugins/maestro/skills`, `commands` | outputs tracked and packaged; stale-pruner source is source-checkout only |
| Retired generated cleanup roots | `src/generator/stale-pruner.js` | write-mode generation only | `claude/src`, `plugins/maestro/src` | intentionally absent |
| Package and release allowlists | `package.json files`, `.npmignore`, `scripts/release-artifact-manifest.js`, `scripts/verify-npm-pack.js` | verification | npm pack file list, release tarball contents, and runtime-source inventory | public artifact contract |

## Dry Run Limitation

`node scripts/generate.js --dry-run` and `node scripts/generate.js --diff` exercise transform, registry, entrypoint, and metadata writes through the read-only file writer. They do not exercise stale pruning.

Any phase that deletes or untracks generated runtime roots must run a real write-mode generation path in a staging or clean worktree, not only `--dry-run` or `--diff`.

## Current Owned Roots

These roots are stale-pruned after write-mode generation:

- `agents`
- `claude/agents`
- `qwen/agents`
- `claude/skills`
- `plugins/maestro/skills`
- `commands`

These retired generated roots are cleanup-only prune targets and should remain absent after write-mode generation:

- `claude/src`
- `plugins/maestro/src`

## Change Rule

When adding or retiring a generated surface, update all of the following in the same change:

- `src/generator/generated-surface-inventory.js`
- `scripts/release-artifact-manifest.js` runtime-source inventory and `package.json` `files`, when the package/release source surface changes
- the generator producer or release/package verifier that owns the surface
- the relevant runtime payload contract entry
- tests that prove the surface is generated, packaged, or intentionally absent
