# MCP Content Serving — Outstanding Work

> **Context:** Phases 1-4 of runtime deduplication are complete on branch `feat/runtime-deduplication`. The infrastructure is in place: `get_runtime_context` MCP tool exists in all 3 runtimes, `get_skill_content` is enabled for all 3 runtimes, runtime configs are embedded in the MCP server bundle. But the generated file copies were never eliminated — the MCP serves content from runtime-local copies instead of from the canonical `src/` source. This document describes the remaining work to make MCP the single content broker.

## Problem

232 generated files are committed across 3 runtimes. Of these:
- 23 files are **byte-identical** across all 3 runtimes (lib, scripts, templates, orchestration-steps.md)
- 8 files differ only by **path substitution** (`${extensionPath}` → `${CLAUDE_PLUGIN_ROOT}` → relative paths) and **skill metadata** (`user-invocable: false` for Claude)
- Agents differ by **frontmatter** (Gemini/Claude need different YAML) — these MUST stay on disk for platform registration
- The rest are entry-point skills (now template-generated) and runtime configs

The MCP server (`get_skill_content`) already reads content from disk and returns it to the LLM. It currently reads from the runtime's local copy. It needs to read from `src/` (canonical source) and apply transforms at read time.

## What Changes

### 1. MCP `get_skill_content` reads from `src/` and applies transforms

**File:** `src/lib/mcp/handlers/get-skill-content.js`

Currently (line 51):
```js
const absolutePath = path.join(extensionRoot, relativePath);
contents[id] = fs.readFileSync(absolutePath, 'utf8');
```

Change to:
```js
const srcRoot = path.resolve(extensionRoot, SRC_RELATIVE_PATH);
const absolutePath = path.join(srcRoot, toCanonicalPath(relativePath));
let content = fs.readFileSync(absolutePath, 'utf8');
content = applyRuntimeTransforms(content, RUNTIME_CONFIG, relativePath);
contents[id] = content;
```

Where:
- `SRC_RELATIVE_PATH` is the relative path from the runtime's extensionRoot to `src/`. For Gemini (root): `'src'`. For Claude (`claude/`): `'../src'`. For Codex (`plugins/maestro/`): `'../../src'`. This is embedded per-runtime via feature flags (same pattern as `RUNTIME_CONFIG`).
- `toCanonicalPath(relativePath)` maps runtime paths back to canonical source paths: `'skills/delegation/SKILL.md'` → `'skills/shared/delegation/SKILL.md'`
- `applyRuntimeTransforms(content, config, path)` applies `replace-paths` and `skill-metadata` using the embedded `RUNTIME_CONFIG`

The transform logic is simple — it's the same as `src/transforms/replace-paths.js` and `src/transforms/skill-metadata.js` but inlined in the handler (no need to import the full transform pipeline; these are 10-line functions):

```js
function applyRuntimeTransforms(content, config, relativePath) {
  let result = content;
  
  // replace-paths: swap ${extensionPath} with runtime-specific path variable
  const envPath = config.env.extensionPath;
  if (envPath) {
    const replacement = envPath.startsWith('${') ? envPath : '${' + envPath + '}';
    result = result.replace(/\$\{extensionPath\}/g, replacement);
  }
  
  // skill-metadata: add user-invocable: false for Claude skills
  if (config.name === 'claude' && relativePath.endsWith('SKILL.md')) {
    result = result.replace(/^(---\n[\s\S]*?)(^---)/m, '$1user-invocable: false\n$2');
  }
  
  return result;
}
```

For `references/architecture.md` which also needs `replace-agent-names` and `strip-feature`: add those transforms to the handler for that specific resource. The `strip-feature` logic is in `src/transforms/strip-feature.js` (50 lines). The `replace-agent-names` logic is in `src/transforms/replace-agent-names.js`. Both can be inlined or bundled into the MCP server.

### 2. Update the allowlist with canonical paths

**File:** `src/lib/mcp/handlers/get-skill-content.js`

The `RESOURCE_ALLOWLIST` currently maps IDs to runtime-relative paths. Change it to map to canonical `src/` paths:

```js
const RESOURCE_ALLOWLIST = Object.freeze({
  // Skills — canonical source is in skills/shared/
  'delegation':               'skills/shared/delegation/SKILL.md',
  'execution':                'skills/shared/execution/SKILL.md',
  'validation':               'skills/shared/validation/SKILL.md',
  'session-management':       'skills/shared/session-management/SKILL.md',
  'implementation-planning':  'skills/shared/implementation-planning/SKILL.md',
  'code-review':              'skills/shared/code-review/SKILL.md',
  'design-dialogue':          'skills/shared/design-dialogue/SKILL.md',
  
  // Protocols
  'agent-base-protocol':      'skills/shared/delegation/protocols/agent-base-protocol.md',
  'filesystem-safety-protocol': 'skills/shared/delegation/protocols/filesystem-safety-protocol.md',
  
  // Templates
  'design-document':          'templates/design-document.md',
  'implementation-plan':       'templates/implementation-plan.md',
  'session-state':            'templates/session-state.md',
  
  // References
  'architecture':             'references/architecture.md',
  'orchestration-steps':      'references/orchestration-steps.md',
});
```

### 3. Add `get_agent` MCP tool

**New tool** that serves agent methodology (body content, not frontmatter) from `src/agents/`:

```js
registerTool({
  name: 'get_agent',
  description: 'Read one or more Maestro agent methodology definitions by name. Returns the agent body (methodology, constraints, decision frameworks) with runtime-appropriate tool and agent name mappings applied.',
  inputSchema: {
    type: 'object',
    properties: {
      agents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Agent names (kebab-case): "coder", "code-reviewer", "architect", etc.'
      }
    },
    required: ['agents']
  }
}, handleGetAgent);
```

Handler reads from `src/agents/<name>.md`, strips frontmatter (the LLM doesn't need it — the runtime handles registration), and returns just the methodology body. No transforms needed on the body since Phase 3 made agent bodies runtime-neutral (feature flags only affect frontmatter/examples, which are handled by `inject-frontmatter` at registration time).

### 4. Update shared skills to use MCP instead of file reads

**Files:** All 9 shared skill files in `src/skills/shared/`

Currently skills reference other skills/protocols via file paths:
```markdown
1. Read `agent-base-protocol.md` from `${extensionPath}/skills/delegation/protocols/`
```

Change to MCP calls:
```markdown
1. Load `agent-base-protocol` via `get_skill_content`
```

This removes the 13 `${extensionPath}` occurrences from shared skills (the `replace-paths` transform becomes unnecessary for skills served via MCP).

Similarly, delegation prompts that say "Read the agent's definition file" change to "Call `get_agent` with the agent name."

### 5. Update entry-point skills/commands to use MCP

**Files:** All entry-point skills (thin + thick) across all runtimes

Currently Claude's entry points say:
```markdown
Read `${CLAUDE_PLUGIN_ROOT}/references/architecture.md`.
```

Change to:
```markdown
Call `get_skill_content` with resources: ["architecture"].
```

This is already how Gemini works (it calls `get_skill_content` via MCP). Claude and Codex now have this tool too (enabled in Phase 2). Making all runtimes use the same MCP-based loading pattern.

The thin entry-point templates (`src/entry-points/templates/*.tmpl`) need to be updated to use MCP calls instead of file reads.

### 6. Delete generated copies that MCP now serves

**Files to delete from generated output (and from the manifest):**

Skills (currently 3 copies each, served by MCP):
- `skills/*.md` (7 Gemini copies)
- `claude/skills/*.md` (7 Claude copies — the shared ones, not entry-points)
- `plugins/maestro/skills/*.md` (7 Codex copies — the shared ones)
- `skills/delegation/protocols/*.md` (2 Gemini copies)
- `claude/skills/delegation/protocols/*.md` (2 Claude copies)
- `plugins/maestro/skills/delegation/protocols/*.md` (2 Codex copies)

Templates (byte-identical, served by MCP):
- `templates/*.md` (3 Gemini copies)
- `claude/templates/*.md` (3 Claude copies)
- `plugins/maestro/templates/*.md` (3 Codex copies)

References (served by MCP):
- `references/architecture.md` and `orchestration-steps.md` (Gemini)
- `claude/references/*.md` (Claude)
- `plugins/maestro/references/*.md` (Codex — except `runtime-guide.md` which is Codex-only and stays)

**Total files eliminated:** ~54 files (18 skills + 6 protocols + 9 templates + 6 references) × 3 runtimes, minus some that only exist in 1-2 runtimes.

### 7. Replace agent file copies with frontmatter stubs

**Files:** Agent files in each runtime directory

Currently each runtime has full agent copies (frontmatter + methodology body). The frontmatter MUST stay (platform registration). The body can be served by `get_agent` MCP tool.

Replace full agent copies with stubs:
```yaml
---
name: coder
kind: local
description: "Implementation specialist for writing clean, well-structured code"
tools:
  - read_file
  - write_file
  ...
temperature: 0.2
max_turns: 25
timeout_mins: 10
---

Agent methodology loaded via MCP tool `get_agent`. Call `get_agent(agents: ["coder"])` to read the full methodology at delegation time.
```

The `inject-frontmatter` transform still runs to produce runtime-specific YAML. But the body is a one-liner instead of 100+ lines of methodology.

**Impact:** 22 agents × 3 runtimes = 66 files still exist but are dramatically smaller (~15 lines each instead of 100+).

### 8. Skill discovery stubs for Claude and Codex

Claude and Codex need SKILL.md files on disk for skill discovery (the `/` autocomplete menu in Claude, the `skills/` directory scan in Codex). These can be minimal stubs:

```yaml
---
name: delegation
description: Agent delegation best practices for constructing effective subagent prompts
user-invocable: false
---

Methodology loaded via MCP. Call `get_skill_content(resources: ["delegation"])`.
```

These stubs are ~5 lines each. The generator still produces them for discovery, but the full content is served by MCP at invocation time.

Gemini doesn't need skill stubs — it uses `activate_skill` which reads from disk, but this should be replaced with `get_skill_content` MCP calls in the orchestration flow (Gemini already uses `get_skill_content` for some resources).

### 9. Update manifest and generator

**`src/manifest.js`:** Remove entries for skills, templates, references that are now MCP-served. Add entries for the new stubs (agent frontmatter stubs, skill discovery stubs).

**`scripts/generate.js`:** Add a stub generation mode — for agent stubs, run `inject-frontmatter` to produce the YAML header, then append the one-liner body. For skill stubs, produce minimal YAML + one-liner.

### 10. Embed `SRC_RELATIVE_PATH` in MCP server per runtime

Same pattern as `RUNTIME_CONFIG` — use feature flags:

```js
// @feature geminiRuntimeConfig
var SRC_RELATIVE_PATH = 'src';
// @end-feature
// @feature claudeRuntimeConfig
var SRC_RELATIVE_PATH = '../src';
// @end-feature
// @feature codexRuntimeConfig
var SRC_RELATIVE_PATH = '../../src';
// @end-feature
```

The MCP server uses this to resolve `path.resolve(extensionRoot, SRC_RELATIVE_PATH)` → absolute path to `src/`.

## What Stays On Disk Per Runtime After This Work

### Gemini (repo root)
- `agents/*.md` — frontmatter stubs (22 files, ~15 lines each)
- `commands/maestro/*.toml` — entry-point commands (12 files)
- `hooks/` — hook scripts and config (6 files)
- `mcp/maestro-server.js` — MCP server bundle (1 file)
- `policies/maestro.toml` — policy config (1 file)
- `GEMINI.md`, `gemini-extension.json`, `.geminiignore` — extension config (3 files)
- `README.md` — docs (1 file)
- **NO** `skills/`, `templates/`, `references/`, `lib/`, `scripts/` — all served by MCP or required by MCP server internally

### Claude (`claude/`)
- `agents/*.md` — frontmatter stubs (22 files)
- `skills/*/SKILL.md` — discovery stubs for all skills (19 files, ~5 lines each)
- `hooks/claude-hooks.json` — hook config (1 file)
- `scripts/*.js` — hook scripts (6 files)
- `mcp/maestro-server.js` — MCP server bundle (1 file)
- `.claude-plugin/plugin.json`, `.mcp.json`, `mcp-config.example.json` — plugin config (3 files)
- `README.md` — docs (1 file)
- **NO** `templates/`, `references/` — served by MCP
- **NO** full skill content in `skills/` — stubs only, full content from MCP

### Codex (`plugins/maestro/`)
- `agents/*.md` — frontmatter stubs (22 files)
- `skills/*/SKILL.md` — discovery stubs (19 files)
- `mcp/maestro-server.js` — MCP server bundle (1 file)
- `.codex-plugin/plugin.json`, `.app.json`, `.mcp.json` — plugin config (3 files)
- `references/runtime-guide.md` — Codex-only reference (1 file)
- `README.md` — docs (1 file)
- **NO** `lib/`, `scripts/`, `templates/` — MCP server handles internally

### Shared (used by MCP server at runtime)
- `src/skills/shared/` — 9 canonical skill files (source of truth)
- `src/agents/` — 22 canonical agent definitions (source of truth)
- `src/templates/` — 3 canonical templates
- `src/references/` — 2 canonical references
- `src/lib/` — shared JS modules (required by MCP server/hooks)
- `src/scripts/` — shared utility scripts

## What About `lib/` and `scripts/`?

The 23 byte-identical `lib/` and `scripts/` files are consumed by Node.js (MCP server, hook scripts) via `require()`. They are NOT read by the LLM.

**Option A:** The MCP server bundle already includes all lib modules (it's a webpack bundle). The standalone scripts (`scripts/read-state.js`, etc.) are fallbacks when MCP is unavailable. These could become thin re-export stubs:
```js
// claude/scripts/read-state.js
module.exports = require('../../src/scripts/read-state.js');
```

This reduces 23 × 3 = 69 full copies to 69 one-liners. But it depends on `src/` being reachable via `require()` from each runtime directory, which works for Gemini and Claude but may need testing for Codex (Node.js `require()` doesn't have the same path restrictions as the LLM's file reads).

**Option B:** Keep lib/scripts as full copies (they're small JS files). Focus the MCP work on the content files (skills, agents, templates, references) which are much larger and directly visible to the user as duplication.

## Net Impact

| Category | Before | After |
|----------|--------|-------|
| Skills (shared) on disk | 27 full files (9 × 3 runtimes) | 0 full files (27 stubs for discovery, ~5 lines each) |
| Protocols on disk | 6 full files (2 × 3) | 0 full files (served by MCP) |
| Templates on disk | 9 full files (3 × 3) | 0 full files (served by MCP) |
| References on disk | 6 full files (2 × 3) | 0 full (served by MCP) + 1 Codex-only |
| Agent files on disk | 66 full files (22 × 3) | 66 stubs (~15 lines each, down from 100+) |
| Entry-point skills | Template-generated (current) | Stubs + MCP for thick ones |
| lib/scripts | 69 identical copies | 69 copies (or stubs, Option A) |
| **Total generated files** | **232** | **~150 stubs + configs** |
| **Total content duplication** | High | Near-zero (canonical source in `src/`, MCP serves with transforms) |

## Orchestration Flow Change

Currently the orchestration-steps.md says:
```
0. Call get_runtime_context if available.
1. Call resolve_settings.
...
```

Skills are loaded by reading files from disk (Claude: `Read ${CLAUDE_PLUGIN_ROOT}/skills/delegation/SKILL.md`, Gemini: `activate_skill(name: "delegation")`).

After this work, ALL runtimes use MCP for content:
```
0. Call get_runtime_context.
1. Call resolve_settings.
...
When a step says "load the delegation skill":
  Call get_skill_content(resources: ["delegation"])
When a step says "delegate to coder":
  Call get_agent(agents: ["coder"]) to read methodology, then dispatch
```

This is uniform across all 3 runtimes. The MCP server handles runtime-specific transforms internally.

## Dependencies

This work depends on everything already completed in Phases 1-4:
- `get_runtime_context` tool exists and returns runtime config (Phase 2)
- `get_skill_content` enabled for all 3 runtimes (Phase 2)
- `RUNTIME_CONFIG` embedded in MCP server per runtime (Phase 2)
- Shared skills are LLM-adaptive with generic language (Phase 3)
- Entry-point templates and registry exist (Phase 4)

## Implementation Order

1. Extend `get_skill_content` handler to read from `src/` with transforms
2. Add `get_agent` MCP tool
3. Embed `SRC_RELATIVE_PATH` per runtime in MCP server
4. Update shared skills to reference MCP calls instead of file paths
5. Update entry-point templates to use MCP calls
6. Update orchestration-steps.md to document MCP-based loading
7. Generate agent frontmatter stubs and skill discovery stubs
8. Delete full generated copies (skills, templates, references, protocols)
9. Update manifest for new stub-only output
10. Rebuild MCP server bundle with extended handler + new tool
