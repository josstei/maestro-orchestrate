# Multi-Runtime Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate dead-weight duplication and unnecessary code generation while retaining full Gemini, Claude, and Codex runtime functionality, including detached plugin installs.

**Architecture:** Canonical content stays in `src/`. Public platform scaffolding becomes thin hand-authored wrappers. A dedicated payload-pack step generates minimal `claude/src/` and `plugins/maestro/src/` trees for detached Claude/Codex installs. The manifest shrinks from ~20 rules to 2, and 6 of 10 transforms are removed from generation-time usage.

**Tech Stack:** Node.js, `node:test`, `node:fs`, `node:path`

**Spec:** `docs/superpowers/specs/2026-04-10-multi-runtime-consolidation-design.md`

---

## File Structure

### Files Created
- `mcp/maestro-server.js` (overwrite generated copy with hand-authored thin entrypoint)
- `claude/mcp/maestro-server.js` (overwrite generated copy with hand-authored thin entrypoint)
- `plugins/maestro/mcp/maestro-server.js` (overwrite generated copy with hand-authored thin entrypoint)
- `hooks/hook-runner.js` (overwrite generated copy with hand-authored thin wrapper)
- `hooks/adapters/gemini-adapter.js` (overwrite generated copy with hand-authored thin wrapper)
- `claude/scripts/hook-runner.js` (overwrite generated copy with hand-authored thin wrapper)
- `claude/scripts/adapters/claude-adapter.js` (overwrite generated copy with hand-authored thin wrapper)
- `tests/integration/thin-entrypoints.test.js` (new test file)

### Files Modified
- `src/platforms/shared/hook-runner.js` (update require paths)
- `src/mcp/maestro-server.js:373-375` (read runtime from env var)
- `src/manifest.js` (shrink to 2 rules)
- `src/transforms/index.js` (remove 6 transforms)
- `scripts/generate.js` (update owned dirs, add payload-pack step)
- `tests/integration/helpers.js` (no changes needed -- `withIsolatedClaudePlugin` and `withIsolatedCodexPlugin` already copy from final dirs)
- `tests/integration/zero-diff.test.js` (update assertions)
- `tests/integration/generator.test.js` (update assertions)
- `tests/integration/source-of-truth.test.js` (update assertions)
- `tests/integration/mcp-server-entrypoint.test.js` (assertions already match thin entrypoint behavior)
- `docs/runtime-claude.md`
- `docs/runtime-codex.md`
- `CHANGELOG.md`

### Files Deleted
- `src/platforms/shared/mcp-entrypoint.js`
- `src/platforms/claude/*` (except `runtime-config.js`)
- `src/platforms/codex/*` (except `runtime-config.js`)
- `src/platforms/gemini/*` (except `runtime-config.js`)
- `src/hooks/hook-configs/gemini.json`
- `src/hooks/hook-configs/claude.json`
- `hooks/canonical-source.js`
- `mcp/canonical-source.js`
- `claude/scripts/canonical-source.js`
- `claude/mcp/canonical-source.js`
- `plugins/maestro/mcp/canonical-source.js`
- `plugins/maestro/agents/*.md` (22 files)
- `claude/src/` (empty dir, replaced by generated payload)
- `src/transforms/copy.js`
- `src/transforms/inline-runtime.js`
- `src/transforms/replace-paths.js`
- `src/transforms/replace-tool-names.js`
- `src/transforms/replace-agent-names.js`
- `src/transforms/strip-feature.js`
- `tests/transforms/copy.test.js`

---

### Task 1: Update MCP server to read runtime from env var

**Files:**
- Modify: `src/mcp/maestro-server.js:373-375`

- [ ] **Step 1: Write the failing test**

Create a test that verifies `main()` reads from `MAESTRO_RUNTIME` env var:

```js
// Add to existing test file or verify inline:
// Set MAESTRO_RUNTIME=claude, call main(), verify it uses claude config
```

Since the existing integration tests (`mcp-server-entrypoint.test.js`) already test startup via the entrypoint files which will set the env var, we can validate this through those tests after Task 2. For now, make the code change.

- [ ] **Step 2: Modify `main()` to read `MAESTRO_RUNTIME` env var**

In `src/mcp/maestro-server.js`, change lines 373-375 from:

```js
function main(runtimeConfig = getDefaultRuntimeConfig()) {
  runRuntimeServer(runtimeConfig);
}
```

to:

```js
function main(runtimeConfig) {
  const resolved = runtimeConfig || process.env.MAESTRO_RUNTIME || getDefaultRuntimeConfig();
  runRuntimeServer(resolved);
}
```

This is backwards-compatible: callers passing a config object still work, the env var is the new path, and the default falls back to `getDefaultRuntimeConfig()`.

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `node --test tests/integration/mcp-server-entrypoint.test.js`
Expected: All currently-passing tests still pass (repo-root Gemini and Claude startup).

- [ ] **Step 4: Commit**

```bash
git add src/mcp/maestro-server.js
git commit -m "refactor: read MAESTRO_RUNTIME from env var in MCP server main()"
```

---

### Task 2: Hand-author thin MCP entrypoints

**Files:**
- Overwrite: `mcp/maestro-server.js`
- Overwrite: `claude/mcp/maestro-server.js`
- Overwrite: `plugins/maestro/mcp/maestro-server.js`

- [ ] **Step 1: Write Gemini thin entrypoint**

Overwrite `mcp/maestro-server.js` with:

```js
'use strict';

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'gemini';
require('../src/mcp/maestro-server').main();
```

- [ ] **Step 2: Write Claude thin entrypoint with fallback**

Overwrite `claude/mcp/maestro-server.js` with:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'claude';
const repoEntry = path.resolve(__dirname, '../../src/mcp/maestro-server.js');
const bundledEntry = path.resolve(__dirname, '../src/mcp/maestro-server.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry).main();
```

- [ ] **Step 3: Write Codex thin entrypoint with fallback**

Overwrite `plugins/maestro/mcp/maestro-server.js` with:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
const repoEntry = path.resolve(__dirname, '../../../src/mcp/maestro-server.js');
const bundledEntry = path.resolve(__dirname, '../src/mcp/maestro-server.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry).main();
```

- [ ] **Step 4: Run MCP startup tests**

Run: `node --test tests/integration/mcp-server-entrypoint.test.js`
Expected: Gemini and Claude repo-root tests pass. Isolated Claude and Codex tests still fail (no bundled `src/` payload yet -- that comes in Task 7).

- [ ] **Step 5: Commit**

```bash
git add mcp/maestro-server.js claude/mcp/maestro-server.js plugins/maestro/mcp/maestro-server.js
git commit -m "refactor: replace generated MCP entrypoints with thin hand-authored wrappers"
```

---

### Task 3: Update shared hook-runner require paths

**Files:**
- Modify: `src/platforms/shared/hook-runner.js:3`

- [ ] **Step 1: Replace canonical-source require with direct path**

In `src/platforms/shared/hook-runner.js`, change line 3 from:

```js
const { requireFromCanonicalSrc } = require('./canonical-source');
```

to:

```js
const path = require('node:path');
```

And change line 34 from:

```js
const logicModule = requireFromCanonicalSrc(hookEntry.module, __dirname);
```

to:

```js
const logicModule = require(path.resolve(__dirname, '../../', hookEntry.module));
```

This resolves hook logic modules relative to `src/` (two directories up from `src/platforms/shared/`), eliminating the canonical-source dependency.

- [ ] **Step 2: Run hook entrypoint tests**

Run: `node --test tests/integration/hook-entrypoints.test.js`
Expected: Gemini and Claude repo-root hook tests pass. The isolated Claude hook test may still fail until the bundled payload is introduced.

- [ ] **Step 3: Commit**

```bash
git add src/platforms/shared/hook-runner.js
git commit -m "refactor: replace canonical-source require with direct path in shared hook-runner"
```

---

### Task 4: Hand-author thin hook wrappers

**Files:**
- Overwrite: `hooks/hook-runner.js`
- Overwrite: `hooks/adapters/gemini-adapter.js`
- Overwrite: `claude/scripts/hook-runner.js`
- Overwrite: `claude/scripts/adapters/claude-adapter.js`

- [ ] **Step 1: Write Gemini hook-runner wrapper**

Overwrite `hooks/hook-runner.js` with:

```js
'use strict';

require('../src/platforms/shared/hook-runner');
```

The shared hook-runner reads `process.argv[2]` (runtime) and `process.argv[3]` (hookName) directly, so no arguments need to be forwarded. The hooks.json config already passes `gemini session-start` etc. as argv.

- [ ] **Step 2: Write Gemini adapter wrapper**

Overwrite `hooks/adapters/gemini-adapter.js` with:

```js
'use strict';

module.exports = require('../../src/platforms/shared/adapters/gemini-adapter');
```

- [ ] **Step 3: Write Claude hook-runner wrapper with fallback**

Overwrite `claude/scripts/hook-runner.js` with:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../src/platforms/shared/hook-runner.js');
const bundledEntry = path.resolve(__dirname, '../src/platforms/shared/hook-runner.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry);
```

- [ ] **Step 4: Write Claude adapter wrapper with fallback**

Overwrite `claude/scripts/adapters/claude-adapter.js` with:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../../src/platforms/shared/adapters/claude-adapter.js');
const bundledEntry = path.resolve(__dirname, '../../src/platforms/shared/adapters/claude-adapter.js');
module.exports = require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry);
```

- [ ] **Step 5: Run hook tests**

Run: `node --test tests/integration/hook-entrypoints.test.js`
Expected: Gemini and Claude repo-root hook tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/hook-runner.js hooks/adapters/gemini-adapter.js claude/scripts/hook-runner.js claude/scripts/adapters/claude-adapter.js
git commit -m "refactor: replace generated hook wrappers with thin hand-authored entrypoints"
```

---

### Task 5: Delete canonical-source copies

**Files:**
- Delete: `hooks/canonical-source.js`
- Delete: `mcp/canonical-source.js`
- Delete: `claude/scripts/canonical-source.js`
- Delete: `claude/mcp/canonical-source.js`
- Delete: `plugins/maestro/mcp/canonical-source.js`

- [ ] **Step 1: Delete all canonical-source copies**

```bash
rm hooks/canonical-source.js mcp/canonical-source.js claude/scripts/canonical-source.js claude/mcp/canonical-source.js plugins/maestro/mcp/canonical-source.js
```

- [ ] **Step 2: Run MCP and hook tests to verify nothing relies on them**

Run: `node --test tests/integration/mcp-server-entrypoint.test.js tests/integration/hook-entrypoints.test.js`
Expected: Repo-root tests still pass (thin wrappers don't use canonical-source).

- [ ] **Step 3: Commit**

```bash
git add -u hooks/canonical-source.js mcp/canonical-source.js claude/scripts/canonical-source.js claude/mcp/canonical-source.js plugins/maestro/mcp/canonical-source.js
git commit -m "refactor: delete canonical-source.js copies replaced by thin entrypoints"
```

---

### Task 6: Move platform metadata to final locations

**Files:**
- Delete: `src/platforms/claude/.claude-plugin/plugin.json`, `src/platforms/claude/.mcp.json`, `src/platforms/claude/mcp-config.example.json`, `src/platforms/claude/README.md`, `src/platforms/claude/scripts/policy-enforcer.js`, `src/platforms/claude/scripts/policy-enforcer.test.js`
- Delete: `src/platforms/codex/.codex-plugin/plugin.json`, `src/platforms/codex/.mcp.json`, `src/platforms/codex/.app.json`, `src/platforms/codex/README.md`, `src/platforms/codex/references/runtime-guide.md`
- Delete: `src/platforms/gemini/GEMINI.md`, `src/platforms/gemini/gemini-extension.json`, `src/platforms/gemini/.geminiignore`, `src/platforms/gemini/policies/maestro.toml`
- Delete: `src/hooks/hook-configs/gemini.json`, `src/hooks/hook-configs/claude.json`
- Delete: `src/platforms/shared/mcp-entrypoint.js`

The files at their final locations (`claude/.claude-plugin/plugin.json`, `GEMINI.md`, etc.) already exist as generated copies. They become the authoritative versions.

- [ ] **Step 1: Delete source copies for Claude platform**

```bash
rm -rf src/platforms/claude/.claude-plugin src/platforms/claude/.mcp.json src/platforms/claude/mcp-config.example.json src/platforms/claude/README.md src/platforms/claude/scripts
```

- [ ] **Step 2: Delete source copies for Codex platform**

```bash
rm -rf src/platforms/codex/.codex-plugin src/platforms/codex/.mcp.json src/platforms/codex/.app.json src/platforms/codex/README.md src/platforms/codex/references
```

- [ ] **Step 3: Delete source copies for Gemini platform**

```bash
rm src/platforms/gemini/GEMINI.md src/platforms/gemini/gemini-extension.json src/platforms/gemini/.geminiignore
rm -rf src/platforms/gemini/policies src/platforms/gemini/hooks
```

- [ ] **Step 4: Delete hook config sources and shared mcp-entrypoint**

```bash
rm -rf src/hooks/hook-configs
rm src/platforms/shared/mcp-entrypoint.js
```

- [ ] **Step 5: Verify only runtime-config.js remains in each platform dir**

```bash
ls src/platforms/claude/
# Should show: runtime-config.js only
ls src/platforms/codex/
# Should show: runtime-config.js only
ls src/platforms/gemini/
# Should show: runtime-config.js only
```

- [ ] **Step 6: Commit**

```bash
git add -u src/platforms/ src/hooks/hook-configs/
git commit -m "refactor: delete source platform metadata, promote final-location copies to authoritative"
```

---

### Task 7: Implement detached payload pack step

**Files:**
- Modify: `scripts/generate.js`

This task adds a function that copies the minimal canonical `src/` content needed for detached Claude and Codex installs into `claude/src/` and `plugins/maestro/src/`.

- [ ] **Step 1: Define the payload allowlist**

Add the following function to `scripts/generate.js` before the `main()` function:

```js
const DETACHED_PAYLOAD_ALLOWLIST = [
  'core/',
  'config/',
  'hooks/',
  'mcp/',
  'platforms/shared/',
  'platforms/claude/runtime-config.js',
  'platforms/codex/runtime-config.js',
  'platforms/gemini/runtime-config.js',
  'state/',
  'agents/',
  'skills/',
  'references/',
  'templates/',
  'entry-points/',
];

function shouldIncludeInPayload(relativePath) {
  return DETACHED_PAYLOAD_ALLOWLIST.some((prefix) => relativePath.startsWith(prefix));
}

function buildDetachedPayload(srcDir, outputDir) {
  const stats = { copied: 0, skipped: 0 };

  function walkAndCopy(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(srcDir, fullPath);

      if (entry.isDirectory()) {
        if (shouldIncludeInPayload(relativePath + '/')) {
          walkAndCopy(fullPath);
        } else {
          stats.skipped++;
        }
      } else if (entry.isFile()) {
        if (shouldIncludeInPayload(relativePath)) {
          const outputPath = path.join(outputDir, relativePath);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          const content = fs.readFileSync(fullPath, 'utf8');
          const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
          if (existing !== content) {
            fs.writeFileSync(outputPath, content, 'utf8');
            stats.copied++;
          }
        } else {
          stats.skipped++;
        }
      }
    }
  }

  // Clean stale files from output that are no longer in allowlist
  function cleanStale(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(outputDir, fullPath);
      if (entry.isDirectory()) {
        cleanStale(fullPath);
        if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
        }
      } else if (!fs.existsSync(path.join(srcDir, relativePath))) {
        fs.unlinkSync(fullPath);
      }
    }
  }

  walkAndCopy(srcDir);
  cleanStale(outputDir);
  return stats;
}
```

- [ ] **Step 2: Wire pack step into `main()`**

In `scripts/generate.js`, add the pack step at the end of the `main()` function, after the stale-file pruning block and before the error exit check:

```js
  // ── Build detached runtime payloads for Claude + Codex ──
  if (!dryRun && !diffMode) {
    const claudePayloadStats = buildDetachedPayload(SRC, path.join(ROOT, 'claude', 'src'));
    const codexPayloadStats = buildDetachedPayload(SRC, path.join(ROOT, 'plugins', 'maestro', 'src'));
    console.log(`\nDetached payloads: claude/src (${claudePayloadStats.copied} updated), plugins/maestro/src (${codexPayloadStats.copied} updated)`);
  }
```

- [ ] **Step 3: Run the generator and verify payloads are created**

Run: `node scripts/generate.js`
Expected: `claude/src/` and `plugins/maestro/src/` are populated with canonical content. The output reports payload stats.

- [ ] **Step 4: Run isolated plugin tests**

Run: `node --test tests/integration/mcp-server-entrypoint.test.js`
Expected: ALL tests pass, including isolated Claude and Codex plugin startup -- the thin entrypoints now find the bundled `src/` payload.

Run: `node --test tests/integration/hook-entrypoints.test.js`
Expected: Isolated Claude hook test passes -- the hook wrapper finds the bundled `src/` payload.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate.js claude/src/ plugins/maestro/src/
git commit -m "feat: add detached payload pack step for Claude and Codex isolated installs"
```

---

### Task 8: Delete Codex agent stubs

**Files:**
- Delete: `plugins/maestro/agents/*.md` (22 files)

- [ ] **Step 1: Delete the directory**

```bash
rm -rf plugins/maestro/agents
```

- [ ] **Step 2: Run Codex-related tests**

Run: `node --test tests/integration/mcp-server-entrypoint.test.js tests/integration/mcp-server-bundle-behavior.test.js`
Expected: All pass -- Codex agent stubs were never used by the CLI.

- [ ] **Step 3: Commit**

```bash
git add -u plugins/maestro/agents/
git commit -m "refactor: delete unused Codex agent stubs (Codex discovers skills via MCP, not agent files)"
```

---

### Task 9: Update generator owned-directory list (BEFORE manifest simplification)

**Files:**
- Modify: `scripts/generate.js` (owned dirs + owned root files)

This task MUST run before Task 10 (manifest simplification) to prevent the generator from pruning hand-authored files when the manifest shrinks.

- [ ] **Step 1: Update owned directories**

In `scripts/generate.js`, replace the `ownedDirs` array (around line 548) with:

```js
    const ownedDirs = [
      'agents',
      'claude/agents',
      'claude/skills',
      'plugins/maestro/skills',
      'commands',
    ];
```

- [ ] **Step 2: Update owned root files**

Replace the `ownedRootFiles` array with:

```js
    const ownedRootFiles = [];
```

- [ ] **Step 3: Remove `claude/.claude-plugin` from ownedDirs**

Delete the line `ownedDirs.push('claude/.claude-plugin');`.

- [ ] **Step 4: Run generator to verify no unintended pruning**

Run: `node scripts/generate.js`
Expected: No hand-authored files are pruned. Generated agent stubs and entry points are still maintained correctly.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate.js
git commit -m "refactor: update generator owned-directory list for hand-authored platform scaffolding"
```

---

### Task 10: Simplify manifest to 2 discovery rules

**Files:**
- Modify: `src/manifest.js`

- [ ] **Step 1: Replace manifest content**

Overwrite `src/manifest.js` with:

```js
module.exports = [
  // ── Agent discovery stubs — Gemini + Claude only ──────────────────
  { glob: 'agents/*.md',
    transforms: ['inject-frontmatter', 'agent-stub'],
    runtimes: ['gemini', 'claude'] },

  // ── Shared skill discovery stubs — Claude + Codex only ────────────
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },
];
```

- [ ] **Step 2: Run generator dry-run**

Run: `node scripts/generate.js --dry-run`
Expected: Output shows only agent stubs (22 Gemini + 22 Claude) and skill stubs (Claude + Codex), plus entry-point outputs. No `canonical-source.js`, `hook-runner.js`, `mcp-entrypoint.js`, or platform metadata outputs.

- [ ] **Step 3: Run generator to apply**

Run: `node scripts/generate.js`
Expected: Stale files are pruned (old generated copies that are no longer in the manifest). Hand-authored files at final locations are NOT pruned because they won't be in generator-owned directories anymore (updated in Task 11).

- [ ] **Step 4: Commit**

```bash
git add src/manifest.js
git commit -m "refactor: simplify manifest to 2 discovery rules (agents + skills)"
```

---

### Task 10: Delete unused transforms

**Files:**
- Delete: `src/transforms/copy.js`
- Delete: `src/transforms/inline-runtime.js`
- Delete: `src/transforms/replace-paths.js`
- Delete: `src/transforms/replace-tool-names.js`
- Delete: `src/transforms/replace-agent-names.js`
- Delete: `src/transforms/strip-feature.js`
- Delete: `tests/transforms/copy.test.js`
- Modify: `src/transforms/index.js`

- [ ] **Step 1: Update transform registry**

Replace `src/transforms/index.js` with:

```js
const injectFrontmatter = require('./inject-frontmatter');
const skillMetadata = require('./skill-metadata');
const agentStub = require('./agent-stub');
const skillDiscoveryStub = require('./skill-discovery-stub');

const transforms = {
  'inject-frontmatter': injectFrontmatter,
  'skill-metadata': skillMetadata,
  'agent-stub': agentStub,
  'skill-discovery-stub': skillDiscoveryStub,
};

function resolve(name) {
  const [baseName, param] = name.split(':');
  const fn = transforms[baseName];
  if (!fn) {
    throw new Error(`Unknown transform: "${baseName}"`);
  }
  return { fn, param: param || null };
}

module.exports = { resolve, transforms };
```

- [ ] **Step 2: Delete transform files**

```bash
rm src/transforms/copy.js src/transforms/inline-runtime.js src/transforms/replace-paths.js src/transforms/replace-tool-names.js src/transforms/replace-agent-names.js src/transforms/strip-feature.js
```

- [ ] **Step 3: Delete copy transform test**

```bash
rm tests/transforms/copy.test.js
```

- [ ] **Step 4: Run remaining transform tests**

Run: `node --test tests/transforms/index.test.js tests/transforms/inject-frontmatter.test.js tests/transforms/skill-metadata.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -u src/transforms/ tests/transforms/copy.test.js
git add src/transforms/index.js
git commit -m "refactor: delete 6 generation-time transforms no longer used by simplified manifest"
```

---

### Task 12: Update integration tests

**Files:**
- Modify: `tests/integration/zero-diff.test.js`
- Modify: `tests/integration/generator.test.js`
- Modify: `tests/integration/source-of-truth.test.js`
- Create: `tests/integration/thin-entrypoints.test.js`

- [ ] **Step 1: Rewrite zero-diff.test.js**

Replace `tests/integration/zero-diff.test.js` with:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');

    // Agent stubs are generated for gemini and claude
    assert.ok(
      report.statusLines.some((line) => line.includes('agents/architect.md')),
      'Expected gemini agent stubs in generator output'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/agents/architect.md')),
      'Expected claude agent stubs in generator output'
    );

    // No canonical-source copies
    assert.ok(
      report.statusLines.every((line) => !line.includes('canonical-source.js')),
      'Did not expect canonical-source copies in generator output'
    );

    // No generated mcp-entrypoint or hook-runner copies
    assert.ok(
      report.statusLines.every((line) => !line.includes('hooks/hook-runner.js')),
      'Did not expect generated hook-runner in generator output'
    );

    // No mirrored lib outputs
    assert.ok(
      report.statusLines.every((line) => !line.includes('/lib/')),
      'Did not expect mirrored lib outputs in dry-run status'
    );

    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
  });
});
```

- [ ] **Step 2: Rewrite generator.test.js**

Replace `tests/integration/generator.test.js` with:

```js
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DRY_RUN_MARKER,
  getGitStatus,
  parseDryRunReport,
  ROOT,
  runGenerator,
} = require('./helpers');

describe('generator integration', () => {
  it('--dry-run reports manifest status without mutating the worktree', () => {
    const beforeStatus = getGitStatus();
    const result = runGenerator(['--dry-run']);
    const afterStatus = getGitStatus();
    const report = parseDryRunReport(result);

    assert.equal(afterStatus, beforeStatus);
    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected dry-run to report manifest output status');
    assert.ok(
      report.statusLines.some((line) => line.includes('agents/architect.md')),
      'Expected agent stubs in dry-run report'
    );
    assert.deepEqual(report.nonStatusLines, []);
  });

  it('thin MCP entrypoints resolve canonical src without canonical-source helpers', () => {
    const entrypoints = [
      'mcp/maestro-server.js',
      'claude/mcp/maestro-server.js',
      'plugins/maestro/mcp/maestro-server.js',
    ];

    for (const relativePath of entrypoints) {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

      assert.ok(
        !content.includes("require('./canonical-source')"),
        `Expected ${relativePath} to NOT use canonical-source helper`
      );
      assert.ok(
        content.includes('MAESTRO_RUNTIME'),
        `Expected ${relativePath} to set MAESTRO_RUNTIME`
      );
    }
  });
});
```

- [ ] **Step 3: Rewrite source-of-truth.test.js**

Replace `tests/integration/source-of-truth.test.js` with:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { expandManifest, assertNoMirroredSharedOutputs } = require('../../scripts/generate');
const manifestRules = require('../../src/manifest');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');

describe('src-first architecture invariants', () => {
  it('ships a detached src payload for Claude isolated installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'claude/src/mcp/maestro-server.js')),
      true,
      'Expected detached Claude src payload to exist'
    );
  });

  it('ships a detached src payload for Codex isolated installs', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/src/mcp/maestro-server.js')),
      true,
      'Expected detached Codex src payload to exist'
    );
  });

  it('does not ship Codex agent stubs (Codex uses skills, not agent files)', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'plugins/maestro/agents')),
      false,
      'Expected plugins/maestro/agents/ to not exist'
    );
  });

  it('removes mirrored runtime lib trees and generated MCP core artifacts', () => {
    const forbiddenPaths = [
      'lib',
      'claude/lib',
      'plugins/maestro/lib',
      'mcp/maestro-server-core.js',
      'claude/mcp/maestro-server-core.js',
      'plugins/maestro/mcp/maestro-server-core.js',
      'src/mcp/maestro-server-core.js',
      'src/mcp/server-core-entry.js',
    ];

    for (const relativePath of forbiddenPaths) {
      assert.equal(
        fs.existsSync(path.join(ROOT, relativePath)),
        false,
        `Did not expect ${relativePath} to exist in src-first mode`
      );
    }
  });

  it('keeps all runtime content policies filesystem-first with no registry fallback', () => {
    for (const runtimeName of ['gemini', 'claude', 'codex']) {
      const runtimeConfig = getRuntimeConfig(runtimeName);
      assert.equal(runtimeConfig.content.primary, 'filesystem');
      assert.equal(runtimeConfig.content.fallback, 'none');
    }
  });

  it('rejects manifest outputs that reintroduce mirrored shared code', () => {
    const runtimes = {
      gemini: getRuntimeConfig('gemini'),
      claude: getRuntimeConfig('claude'),
      codex: getRuntimeConfig('codex'),
    };

    const manifest = expandManifest(manifestRules, runtimes, path.join(ROOT, 'src'));
    assert.doesNotThrow(() => assertNoMirroredSharedOutputs(manifest));
  });
});
```

- [ ] **Step 4: Create thin-entrypoints.test.js**

Create `tests/integration/thin-entrypoints.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');

describe('thin entrypoint design', () => {
  it('each MCP entrypoint sets its own MAESTRO_RUNTIME default', () => {
    const expectations = [
      { file: 'mcp/maestro-server.js', runtime: 'gemini' },
      { file: 'claude/mcp/maestro-server.js', runtime: 'claude' },
      { file: 'plugins/maestro/mcp/maestro-server.js', runtime: 'codex' },
    ];

    for (const { file, runtime } of expectations) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        content.includes(`'${runtime}'`),
        `Expected ${file} to default MAESTRO_RUNTIME to '${runtime}'`
      );
    }
  });

  it('Claude and Codex entrypoints have repo-first / bundled-fallback resolution', () => {
    const fallbackFiles = [
      'claude/mcp/maestro-server.js',
      'plugins/maestro/mcp/maestro-server.js',
    ];

    for (const file of fallbackFiles) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        content.includes('repoEntry') && content.includes('bundledEntry'),
        `Expected ${file} to have repo-first / bundled-fallback resolution`
      );
    }
  });

  it('Gemini entrypoint uses direct repo-local resolution only', () => {
    const content = fs.readFileSync(path.join(ROOT, 'mcp/maestro-server.js'), 'utf8');
    assert.ok(
      !content.includes('bundledEntry'),
      'Expected Gemini entrypoint to NOT have bundled fallback'
    );
    assert.ok(
      content.includes("require('../src/mcp/maestro-server')"),
      'Expected Gemini entrypoint to require directly from src/'
    );
  });

  it('no canonical-source.js copies exist outside src/core/', () => {
    const forbiddenLocations = [
      'hooks/canonical-source.js',
      'mcp/canonical-source.js',
      'claude/scripts/canonical-source.js',
      'claude/mcp/canonical-source.js',
      'plugins/maestro/mcp/canonical-source.js',
    ];

    for (const file of forbiddenLocations) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        false,
        `Expected ${file} to NOT exist (replaced by thin entrypoints)`
      );
    }
  });

  it('hand-authored platform metadata exists at final locations', () => {
    const requiredFiles = [
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'GEMINI.md',
      'gemini-extension.json',
      'hooks/hooks.json',
    ];

    for (const file of requiredFiles) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        true,
        `Expected hand-authored ${file} to exist`
      );
    }
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `node --test tests/integration/thin-entrypoints.test.js tests/integration/zero-diff.test.js tests/integration/generator.test.js tests/integration/source-of-truth.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add tests/integration/zero-diff.test.js tests/integration/generator.test.js tests/integration/source-of-truth.test.js tests/integration/thin-entrypoints.test.js
git commit -m "test: update integration tests for thin-entrypoint architecture"
```

---

### Task 13: Delete empty claude/src placeholder

**Files:**
- Delete: `claude/src/` (empty directory, now replaced by generated payload from Task 7)

- [ ] **Step 1: Verify claude/src/ is populated by the generator**

The detached payload pack step from Task 7 should have populated `claude/src/` with canonical content. Verify:

```bash
ls claude/src/mcp/maestro-server.js
# Should exist
```

If the file exists, the empty placeholder has already been replaced. No action needed beyond confirming.

- [ ] **Step 2: Commit if any changes**

If there were lingering empty-directory artifacts:

```bash
git add claude/src/
git commit -m "chore: replace empty claude/src placeholder with generated detached payload"
```

---

### Task 14: Run full test suite and fix regressions

**Files:**
- Potentially modify any test file with regressions

- [ ] **Step 1: Run full test suite**

Run: `node --test tests/integration/*.test.js tests/transforms/*.test.js`
Expected: All tests pass.

- [ ] **Step 2: Fix any regressions**

If any test fails, read the error, trace the root cause, and fix. Common issues:
- Tests that assert generated files now deleted (update assertions)
- Tests that reference old require paths (update paths)
- Transform tests that import deleted transforms (remove those tests)

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test regressions from consolidation"
```

---

### Task 15: Update documentation

**Files:**
- Modify: `docs/runtime-claude.md`
- Modify: `docs/runtime-codex.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update runtime-claude.md**

Replace references to self-contained `claude/src/` bundle with the thin-entrypoint model. Describe:
- Claude MCP entrypoint at `claude/mcp/maestro-server.js` sets `MAESTRO_RUNTIME=claude` and resolves canonical `src/` via repo-first / bundled-fallback
- Detached installs (marketplace/copied) include a generated `claude/src/` payload
- Agent stubs in `claude/agents/` point to MCP `get_agent` for methodology

- [ ] **Step 2: Update runtime-codex.md**

Replace references to self-contained `plugins/maestro/src/` bundle and remove references to `plugins/maestro/agents/`. Describe:
- Codex MCP entrypoint at `plugins/maestro/mcp/maestro-server.js` sets `MAESTRO_RUNTIME=codex`
- No agent files -- Codex discovers skills and MCP tools, not agent files
- Detached installs include a generated `plugins/maestro/src/` payload

- [ ] **Step 3: Update CHANGELOG.md**

Add entry describing the consolidation:
- Thin hand-authored entrypoints replace generated copies
- Manifest simplified from ~20 rules to 2
- 6 transforms removed from generation pipeline
- Codex agent stubs deleted (unused)
- Detached payload pack step introduced for isolated plugin installs
- All 8 gaps from gap analysis resolved

- [ ] **Step 4: Commit**

```bash
git add docs/runtime-claude.md docs/runtime-codex.md CHANGELOG.md
git commit -m "docs: update runtime docs and changelog for multi-runtime consolidation"
```

---

## Validation Checklist

After all tasks are complete, run the full verification:

```bash
# Full test suite
node --test tests/integration/*.test.js tests/transforms/*.test.js

# Generator produces clean output
node scripts/generate.js --dry-run

# No git diff on generated files (zero-drift)
node scripts/generate.js && git diff --exit-code

# Repo-root startup for all runtimes
node -e "require('./mcp/maestro-server.js')" &
node -e "require('./claude/mcp/maestro-server.js')" &

# Verify no canonical-source copies remain
test ! -f hooks/canonical-source.js
test ! -f mcp/canonical-source.js
test ! -f claude/scripts/canonical-source.js
test ! -f claude/mcp/canonical-source.js
test ! -f plugins/maestro/mcp/canonical-source.js

# Verify no Codex agent stubs remain
test ! -d plugins/maestro/agents
```
