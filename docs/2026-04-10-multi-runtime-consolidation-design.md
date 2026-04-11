# Multi-Runtime Consolidation Design

**Date:** 2026-04-10
**Branch:** `feat/consolidate-plugin-scaffolding`
**Status:** Approved design

## Goal

Eliminate dead-weight duplication and unnecessary code generation while retaining full functionality across Gemini, Claude, and Codex runtimes. Adopt thin public scaffolding where canonical content lives in repo-root `src/`, while still shipping the minimal generated `src/` payload required for detached Claude and Codex installs that cannot see the repo checkout.

## Architecture Decision: Thin Public Scaffolding + Detached Runtime Payloads

The gap analysis (`docs/maestro-mcp-gap-analysis-2026-04-10.md`) identified that Maestro has two supported deployment modes that both need to remain valid:

- Repo-local runtimes: Gemini at repo root and Claude launched with `--plugin-dir /path/to/repo/claude` can resolve the canonical repo `src/` tree directly.
- Detached plugin installs: Claude marketplace/user/project installs and `scripts/install-codex-plugin.js` copy only `claude/` or `plugins/maestro/` into standalone plugin directories, so they cannot assume a sibling repo-root `src/`.

This design therefore commits to a hybrid packaging model:

- Canonical authoring still lives once in repo-root `src/`.
- Public platform scaffolding (`mcp/maestro-server.js`, `claude/scripts/*.js`, `plugins/maestro/mcp/maestro-server.js`, metadata files, discovery stubs) becomes thin hand-authored wrappers or generated stubs at their final locations.
- Detached Claude and Codex bundles still ship a generated local `src/` payload containing only the canonical runtime content required to boot MCP, run hooks, and serve skill/agent content outside the repo.
- The generated payload is an installation artifact, not a second authored source tree, and it is produced by an explicit pack step rather than the old generic file-copy manifest.

This direction is informed by:

- The MCP server (`src/mcp/content/runtime-content.js`) already applies runtime transforms dynamically at request time.
- The superpowers plugin (obra/superpowers) proves thin public scaffolding works across Claude, Gemini, Codex, and Cursor.
- The documented Claude marketplace flow and current Codex installer already copy isolated plugin directories, so eliminating local payloads entirely would break the published installation contract.

## Platform Discovery Constraints (Proven from CLI Source)

Each platform's agent/skill discovery mechanism was verified against CLI source code:

### Gemini CLI
- **Source:** `gemini-cli/packages/core/src/agents/agentLoader.ts:67-88, 572-629`
- Agents must be `.md` files in `{extensionPath}/agents/`
- Frontmatter validated with Zod `.strict()` schema -- rejects ALL unknown fields
- Accepted fields: `name`, `description`, `display_name`, `tools` (array), `mcp_servers`, `model`, `temperature`, `max_turns`, `timeout_mins`, `kind` (defaults to `local`)
- Skills discovered as `SKILL.md` files; commands discovered as `.toml` files

### Claude Code
- **Source:** `claude-code/plugins/README.md:51-61` + 13 first-party plugin agents
- Agents discovered from `{plugin_root}/agents/*.md` by convention
- Frontmatter fields: `name`, `description`, `tools`, `model`, `color`, `maxTurns`
- No `.strict()` validation observed -- lenient parsing inferred from format variety across official plugins

### Codex
- **Source:** `codex/codex-rs/core/src/plugins/manifest.rs:117-237`, `manager.rs:1771-1788`
- Plugin manifest has `skills`, `mcp_servers`, `apps` fields -- **no `agents` field**
- Agent Roles are `.toml` files in `.codex/agents/` (config-level, not plugin-level)
- **Plugin agent files are never read by Codex**

### Format Incompatibility (Proven)

Gemini and Claude CANNOT share a single `agents/` directory:

| Field | Claude | Gemini | Conflict |
|---|---|---|---|
| `color` | Yes | No | Gemini `.strict()` rejects it |
| `maxTurns` | Yes | No | Gemini `.strict()` rejects it |
| `max_turns` | No | Yes | Different field name |
| `temperature` | No | Yes | Claude doesn't use it |
| `timeout_mins` | No | Yes | Claude doesn't use it |
| Tool names | `Read`, `Glob` | `read_file`, `glob` | Incompatible vocabularies |

## What Gets Eliminated

### Generated JS File Copies (~35 files)

| File | Current copies | Replacement |
|---|---|---|
| `canonical-source.js` | 5 copies across runtimes | Eliminated -- public entrypoints use explicit repo-local / bundled candidate paths |
| `mcp-entrypoint.js` | 3 copies (one per runtime) | 3 hand-authored thin entrypoints with bounded path resolution |
| `hook-runner.js` | 2 copies (Gemini + Claude) | 2 hand-authored thin wrappers |
| `gemini-adapter.js` | 1 copy | Hand-authored thin wrapper |
| `claude-adapter.js` | 1 copy | Hand-authored thin wrapper |

Runtime payload copies of canonical `src` are retained only for detached Claude/Codex installs. What gets eliminated here are duplicated public wrappers/helpers and the generic manifest-driven copy pipeline.

### Codex Agent Stubs (22 files)
- `plugins/maestro/agents/*.md` -- proven unused by Codex CLI source

### Platform Metadata Copies (~17 manifest rules)
All `copy` transform rules in the manifest become hand-authored files at their final locations.

### Transforms (6 of 10 deleted)
Eliminated: `copy`, `inline-runtime`, `replace-paths`, `replace-tool-names`, `replace-agent-names`, `strip-feature`
Remaining: `inject-frontmatter`, `agent-stub`, `skill-discovery-stub`, `skill-metadata`
The eliminated transforms continue to exist in `runtime-content.js` for MCP-time application.

## What the Generator Still Produces

### Detached Runtime Payloads (Claude + Codex only)
- `claude/src/**` and `plugins/maestro/src/**` remain generated for detached installs
- Includes only canonical content needed outside the repo: MCP implementation, shared/core runtime helpers, hook logic, runtime configs, and MCP-served skill/agent content
- Excludes public entrypoints, discovery stubs, and platform metadata that now live as thin wrappers at their final paths
- Generated by a dedicated payload-pack step with an allowlist, not by the deleted generic `copy` transform rules

### Agent Discovery Stubs (44 files)
- 22 Gemini stubs in `agents/*.md` (Gemini frontmatter format)
- 22 Claude stubs in `claude/agents/*.md` (Claude frontmatter format)
- Each is ~8 lines: platform-specific frontmatter + 1-line MCP body
- No body transforms, no feature stripping, no example extraction

### Skill Discovery Stubs (~14 files)
- Claude stubs in `claude/skills/*/SKILL.md`
- Codex stubs in `plugins/maestro/skills/*/SKILL.md`
- Gemini uses TOML commands instead of skill files

### Entry Points (36 files)
- 12 Gemini TOML commands in `commands/maestro/`
- 12 Claude public `SKILL.md` entrypoints in `claude/skills/`
- 12 Codex public `SKILL.md` entrypoints in `plugins/maestro/skills/`
- Generated from `src/entry-points/registry.js` (9 standard entrypoints) and `core-command-registry.js` (3 core commands: `orchestrate`, `execute`, `resume`) via templates

## Thin Entrypoint Design

Each runtime gets a hand-authored public entrypoint that sets its runtime default and loads the canonical server from a bounded candidate list:

- Gemini: repo-local `src/` only.
- Claude/Codex: prefer repo-local `src/` in a checkout, then fall back to bundled `src/` inside a detached plugin install.

There is no upward directory walking. Each wrapper checks only the explicit paths that correspond to supported deployment layouts.

### MCP Entrypoints

**`mcp/maestro-server.js` (Gemini):**
```js
'use strict';
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'gemini';
require('../src/mcp/maestro-server').main();
```

**`claude/mcp/maestro-server.js` (Claude):**
```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'claude';
const repoEntry = path.resolve(__dirname, '../../src/mcp/maestro-server.js');
const bundledEntry = path.resolve(__dirname, '../src/mcp/maestro-server.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry).main();
```

**`plugins/maestro/mcp/maestro-server.js` (Codex):**
```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
const repoEntry = path.resolve(__dirname, '../../../src/mcp/maestro-server.js');
const bundledEntry = path.resolve(__dirname, '../src/mcp/maestro-server.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry).main();
```

### MCP Server Update

`src/mcp/maestro-server.js` `main()` function reads `MAESTRO_RUNTIME` env var instead of accepting it as a parameter from the entrypoint. The `runRuntimeServer()` function already accepts runtime config as a string name and resolves it via `normalizeRuntimeConfig()`.

### Hook Entrypoints

Same pattern: Gemini hook wrappers target repo-local `src/platforms/shared/`, while Claude `claude/scripts/*.js` wrappers use the same repo-first / bundled-fallback resolution as the MCP entrypoint so isolated plugin copies keep working without path walking.

## Gap Analysis Resolution

| Gap | Resolution |
|---|---|
| Gap 1: No self-contained payloads | Gemini is pure thin-adapter; Claude/Codex keep a minimal generated `src/` payload for detached installs only |
| Gap 2: Launchers walk upward | Public entrypoints use explicit repo-local and bundled candidate paths, with no upward walking |
| Gap 3: Isolated plugin startup fails | Detached Claude/Codex installs fall back to their local `src/` payload and remain bootable after copy/install |
| Gap 4: Runtime defaults to gemini | Each entrypoint sets its own `MAESTRO_RUNTIME` default |
| Gap 5: Tests disagree on architecture | Tests are split cleanly between repo-local wrapper coverage and detached-bundle coverage, including hooks |
| Gap 6: Docs/changelog drift | Docs updated to describe the hybrid repo-local/detached packaging model |
| Gap 7: Codex workspace blocked | Detached Codex startup remains supported, so workspace-root behavior is tested through the real installed-bundle path |
| Gap 8: Empty `claude/src` directory | Replaced with an explicit generated detached-runtime payload rather than an empty placeholder |

## Manifest Simplification

**Before:** ~20 rules covering agents, skills, JS copies, platform metadata
**After:** 2 discovery rules + 1 explicit detached-payload pack step

```js
module.exports = [
  { glob: 'agents/*.md',
    transforms: ['inject-frontmatter', 'agent-stub'],
    runtimes: ['gemini', 'claude'] },

  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },
];
```

Entry-point expansion (`expandEntryPoints`, `expandCoreCommands`) continues unchanged. Claude/Codex detached `src/` payloads are produced by a dedicated allowlisted pack step from canonical `src/`, not by the deleted generic `copy` transform.

## Test Suite Changes

### Updated Tests
- `zero-diff.test.js` / `generator.test.js` -- expected public scaffolding outputs shrink, but `claude/src/` and `plugins/maestro/src/` detached payload outputs remain expected
- `source-of-truth.test.js` -- replace full-bundle assertions with allowlisted detached-payload assertions plus thin-entrypoint assertions
- `mcp-server-entrypoint.test.js` -- cover repo-local Gemini/Claude startup and detached Claude/Codex startup through the bounded resolver
- `mcp-server-bundle-behavior.test.js` -- keep detached bundle behavior coverage, updated for the minimal payload model
- `hook-entrypoints.test.js` -- cover repo-local Gemini/Claude hook wrappers and isolated Claude hook startup through the same fallback path
- `install-codex-plugin.test.js` -- verify the installer copies the detached Codex payload required by the marketplace install flow

### New Tests
- Repo-first/fallback resolution: verify Claude/Codex entrypoints prefer repo-local `src/` when present and bundled `src/` when detached
- Runtime default correctness: verify each entrypoint defaults to its own runtime
- Detached payload allowlist: verify only the canonical content needed for MCP/hook execution is copied into `claude/src/` and `plugins/maestro/src/`
- Hand-authored file existence: verify platform metadata files exist at expected locations

### Deleted Tests
- Tests for eliminated transforms (`copy.test.js` etc.)
- Tests that assume generated public wrapper/helper copies such as `canonical-source.js`, generated `hook-runner.js`, or generated `mcp-entrypoint.js` remain part of the runtime surface

## Files Deleted From `src/`

After migration, these source files are no longer needed:
- `src/platforms/shared/mcp-entrypoint.js` -- replaced by hand-authored thin entrypoints per runtime
- `src/platforms/claude/*` (except `runtime-config.js`) -- moved to final locations
- `src/platforms/codex/*` (except `runtime-config.js`) -- moved to final locations
- `src/platforms/gemini/*` (except `runtime-config.js`) -- moved to final locations
- `src/hooks/hook-configs/` -- moved to final locations
- `src/transforms/copy.js`, `inline-runtime.js`, `replace-paths.js`, `replace-tool-names.js`, `replace-agent-names.js`, `strip-feature.js` -- generation-time usage eliminated

Note: `src/core/canonical-source.js` is NOT deleted -- it's still used by `src/mcp/utils/extension-root.js` for runtime resolution. The copies in platform directories are what get deleted.

## Final Directory Structure

```
maestro-orchestrate/
├── src/                              # Canonical source — single source of truth
│   ├── agents/*.md                   # Full agent methodology (22 files)
│   ├── skills/shared/                # Full skill content
│   ├── mcp/                          # MCP server implementation
│   ├── platforms/
│   │   ├── shared/                   # Hook-runner, adapters
│   │   ├── claude/runtime-config.js
│   │   ├── codex/runtime-config.js
│   │   └── gemini/runtime-config.js
│   ├── transforms/                   # 4 remaining transforms
│   ├── entry-points/                 # Registries + templates
│   ├── core/                         # Shared utilities
│   └── manifest.js                   # 2 rules
│
├── agents/*.md                  [G]  # Gemini agent stubs (22)
├── commands/maestro/*.toml      [G]  # Gemini entry points
├── mcp/maestro-server.js             # Thin entrypoint (Gemini)
├── hooks/                            # Hand-authored
├── GEMINI.md                         # Hand-authored
├── gemini-extension.json             # Hand-authored
│
├── claude/
│   ├── .claude-plugin/plugin.json    # Hand-authored
│   ├── agents/*.md              [G]  # Claude agent stubs (22)
│   ├── skills/*/SKILL.md        [G]  # Claude skills + entry points
│   ├── mcp/maestro-server.js         # Thin entrypoint (Claude)
│   ├── src/                     [G]  # Detached runtime payload for marketplace/copied installs
│   ├── scripts/                      # Hand-authored hooks + policy-enforcer
│   └── hooks/claude-hooks.json       # Hand-authored
│
├── plugins/maestro/
│   ├── .codex-plugin/plugin.json     # Hand-authored
│   ├── skills/*/SKILL.md       [G]   # Codex skills + entry points
│   ├── mcp/maestro-server.js         # Thin entrypoint (Codex)
│   ├── src/                   [G]    # Detached runtime payload for installed Codex bundle
│   └── references/runtime-guide.md   # Hand-authored
│                                     # NO agents/ — Codex doesn't use them
├── scripts/generate.js               # Simplified
└── tests/                            # Updated
```

## Migration Order

1. Hand-author thin MCP entrypoints + hook wrappers with explicit repo-local / bundled-fallback resolution
2. Introduce the detached payload pack step for `claude/src/` and `plugins/maestro/src/`
3. Move platform metadata from `src/platforms/` to final locations
4. Move hook configs from `src/hooks/hook-configs/` to final locations
5. Delete generated public helpers (`canonical-source.js`, generated `hook-runner.js`, generated `mcp-entrypoint.js`) and update any remaining `require()` paths
6. Delete Codex agent stubs (`plugins/maestro/agents/`)
7. Simplify the manifest to 2 discovery rules and wire the explicit payload-pack step into the generator
8. Delete unused transforms + their tests
9. Update generator owned-directory list and stale-file pruning for the retained detached payloads
10. Update/rewrite affected integration tests, including `mcp-server-entrypoint.test.js`, `mcp-server-bundle-behavior.test.js`, `hook-entrypoints.test.js`, and `install-codex-plugin.test.js`
11. Update docs (`runtime-claude.md`, `runtime-codex.md`, `CHANGELOG.md`)
