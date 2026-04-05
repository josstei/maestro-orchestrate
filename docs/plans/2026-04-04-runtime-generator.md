# Runtime Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a config-driven transformation pipeline that generates all Gemini and Claude runtime files from a single source of truth in `src/`, reproducing the current output with zero diff.

**Architecture:** A Node.js generator reads a declarative manifest (`src/manifest.js`) that maps source files to output paths through composable transform functions. Runtime configs (`src/runtimes/*.js`) encode all per-runtime differences. Source files in `src/` use canonical names and feature-flag markers for conditional content.

**Tech Stack:** Node.js (no dependencies — uses built-in `node:test`, `node:fs`, `node:path`, `node:child_process`)

**Spec:** `docs/specs/2026-04-04-runtime-generator-design.md`

---

### Task 1: Project Scaffolding and Test Infrastructure

**Files:**
- Create: `src/runtimes/.gitkeep` (placeholder to establish directory)
- Create: `scripts/generate.js` (entry point)
- Create: `src/transforms/index.js` (transform registry)
- Create: `src/transforms/copy.js` (simplest transform)
- Create: `tests/transforms/copy.test.js`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/runtimes src/transforms src/agents src/skills/shared src/lib src/scripts src/templates src/references src/mcp src/hooks/shared src/hooks/runtime-only/gemini src/hooks/runtime-only/claude src/hooks/hook-configs src/runtime-only/gemini src/runtime-only/claude tests/transforms tests/integration
```

- [ ] **Step 2: Write the copy transform test**

Create `tests/transforms/copy.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const copy = require('../../src/transforms/copy');

describe('copy transform', () => {
  it('returns content unchanged', () => {
    const content = '# Hello\nSome content here.';
    const runtime = { name: 'gemini' };
    assert.equal(copy(content, runtime, {}), content);
  });

  it('preserves empty content', () => {
    assert.equal(copy('', { name: 'claude' }, {}), '');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/transforms/copy.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Write the copy transform**

Create `src/transforms/copy.js`:

```js
/**
 * Pass-through transform — returns content unchanged.
 * @param {string} content
 * @returns {string}
 */
function copy(content) {
  return content;
}

module.exports = copy;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/transforms/copy.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the transform registry**

Create `src/transforms/index.js`:

```js
const copy = require('./copy');

const transforms = {
  copy,
};

/**
 * Resolve a transform name to its function.
 * Supports parameterized transforms like 'strip-feature:flagName'.
 * @param {string} name
 * @returns {{ fn: Function, param: string|null }}
 */
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

- [ ] **Step 7: Write the generator entry point skeleton**

Create `scripts/generate.js`:

```js
#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');

async function main() {
  console.log('Runtime generator — not yet implemented');
  process.exit(0);
}

main().catch((err) => {
  console.error('Generator failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 8: Verify skeleton runs**

Run: `node scripts/generate.js`
Expected: prints "Runtime generator — not yet implemented" and exits 0

- [ ] **Step 9: Commit**

```bash
git add src/ scripts/generate.js tests/
git commit -m "feat: scaffold generator with copy transform and test infrastructure"
```

---

### Task 2: Feature Flag Transform (strip-feature)

**Files:**
- Create: `src/transforms/strip-feature.js`
- Create: `tests/transforms/strip-feature.test.js`
- Modify: `src/transforms/index.js`

- [ ] **Step 1: Write the strip-feature tests**

Create `tests/transforms/strip-feature.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const stripFeature = require('../../src/transforms/strip-feature');

describe('strip-feature transform', () => {
  const mdContent = [
    'Shared line 1.',
    '',
    '<!-- @feature exampleBlocks -->',
    'This is example content.',
    '<!-- @end-feature -->',
    '',
    'Shared line 2.',
  ].join('\n');

  const jsContent = [
    '// Shared code',
    '',
    '// @feature mcpSkillContentHandler',
    'const handler = require("./handler");',
    '// @end-feature',
    '',
    '// More shared code',
  ].join('\n');

  it('keeps flagged content when feature is true (markdown)', () => {
    const runtime = { features: { exampleBlocks: true } };
    const result = stripFeature(mdContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(!result.includes('@end-feature'));
    assert.ok(result.includes('This is example content.'));
    assert.ok(result.includes('Shared line 1.'));
    assert.ok(result.includes('Shared line 2.'));
  });

  it('removes flagged content when feature is false (markdown)', () => {
    const runtime = { features: { exampleBlocks: false } };
    const result = stripFeature(mdContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(!result.includes('This is example content.'));
    assert.ok(result.includes('Shared line 1.'));
    assert.ok(result.includes('Shared line 2.'));
  });

  it('keeps flagged content when feature is true (js)', () => {
    const runtime = { features: { mcpSkillContentHandler: true } };
    const result = stripFeature(jsContent, runtime, {});
    assert.ok(!result.includes('@feature'));
    assert.ok(result.includes('const handler'));
  });

  it('removes flagged content when feature is false (js)', () => {
    const runtime = { features: { mcpSkillContentHandler: false } };
    const result = stripFeature(jsContent, runtime, {});
    assert.ok(!result.includes('const handler'));
    assert.ok(result.includes('// Shared code'));
    assert.ok(result.includes('// More shared code'));
  });

  it('handles nested features (innermost first)', () => {
    const nested = [
      'outer start',
      '<!-- @feature a -->',
      'a content',
      '<!-- @feature b -->',
      'b content',
      '<!-- @end-feature -->',
      'a after b',
      '<!-- @end-feature -->',
      'outer end',
    ].join('\n');
    const runtime = { features: { a: true, b: false } };
    const result = stripFeature(nested, runtime, {});
    assert.ok(result.includes('a content'));
    assert.ok(!result.includes('b content'));
    assert.ok(result.includes('a after b'));
  });

  it('errors on unknown feature names', () => {
    const content = '<!-- @feature unknownFlag -->\nstuff\n<!-- @end-feature -->';
    const runtime = { features: {} };
    assert.throws(() => stripFeature(content, runtime, {}), /Unknown feature flag: "unknownFlag"/);
  });

  it('handles multiple independent features', () => {
    const content = [
      'shared',
      '<!-- @feature a -->',
      'a content',
      '<!-- @end-feature -->',
      'middle',
      '<!-- @feature b -->',
      'b content',
      '<!-- @end-feature -->',
      'end',
    ].join('\n');
    const runtime = { features: { a: true, b: false } };
    const result = stripFeature(content, runtime, {});
    assert.ok(result.includes('a content'));
    assert.ok(!result.includes('b content'));
    assert.ok(result.includes('middle'));
  });

  it('cleans up blank lines left by removed blocks', () => {
    const content = 'before\n\n<!-- @feature x -->\nremoved\n<!-- @end-feature -->\n\nafter';
    const runtime = { features: { x: false } };
    const result = stripFeature(content, runtime, {});
    // Should not have triple+ blank lines
    assert.ok(!result.includes('\n\n\n'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/transforms/strip-feature.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the strip-feature transform**

Create `src/transforms/strip-feature.js`:

```js
/**
 * Process feature-flagged blocks in content.
 * Markdown: <!-- @feature name --> ... <!-- @end-feature -->
 * JS:       // @feature name ... // @end-feature
 *
 * If runtime.features[name] is true, keep content and strip markers.
 * If false, remove content and markers.
 * Unknown feature names throw an error.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function stripFeature(content, runtime) {
  // Process innermost features first by repeating until stable
  let result = content;
  let changed = true;

  while (changed) {
    changed = false;

    // Markdown feature blocks
    result = result.replace(
      /^[ \t]*<!-- @feature (\S+) -->\s*?\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\s*?\n?/gm,
      (match, flagName, body) => {
        changed = true;
        if (!(flagName in runtime.features)) {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return runtime.features[flagName] ? body : '';
      }
    );

    // JS feature blocks
    result = result.replace(
      /^[ \t]*\/\/ @feature (\S+)\s*?\n([\s\S]*?)^[ \t]*\/\/ @end-feature\s*?\n?/gm,
      (match, flagName, body) => {
        changed = true;
        if (!(flagName in runtime.features)) {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return runtime.features[flagName] ? body : '';
      }
    );
  }

  // Clean up excessive blank lines (3+ → 2)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

module.exports = stripFeature;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/transforms/strip-feature.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Register in transform index**

Modify `src/transforms/index.js` — add after the `copy` require:

```js
const stripFeature = require('./strip-feature');
```

And add to the `transforms` object:

```js
const transforms = {
  copy,
  'strip-feature': stripFeature,
};
```

- [ ] **Step 6: Run all tests**

Run: `node --test tests/transforms/`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add src/transforms/strip-feature.js src/transforms/index.js tests/transforms/strip-feature.test.js
git commit -m "feat: add strip-feature transform for conditional content blocks"
```

---

### Task 3: Name and Path Replacement Transforms

**Files:**
- Create: `src/transforms/replace-agent-names.js`
- Create: `src/transforms/replace-tool-names.js`
- Create: `src/transforms/replace-paths.js`
- Create: `tests/transforms/replace-agent-names.test.js`
- Create: `tests/transforms/replace-tool-names.test.js`
- Create: `tests/transforms/replace-paths.test.js`
- Modify: `src/transforms/index.js`

- [ ] **Step 1: Write replace-agent-names tests**

Create `tests/transforms/replace-agent-names.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replaceAgentNames = require('../../src/transforms/replace-agent-names');

describe('replace-agent-names transform', () => {
  const shared = require('../../src/runtimes/shared');

  it('converts to snake_case for gemini', () => {
    const content = 'Use the code-reviewer agent or api-designer.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime, {});
    assert.ok(result.includes('code_reviewer'));
    assert.ok(result.includes('api_designer'));
  });

  it('keeps kebab-case for claude', () => {
    const content = 'Use the code-reviewer agent or api-designer.';
    const runtime = { agentNaming: 'kebab-case' };
    const result = replaceAgentNames(content, runtime, {});
    assert.ok(result.includes('code-reviewer'));
    assert.ok(result.includes('api-designer'));
  });

  it('does not alter names that are not agents', () => {
    const content = 'some-random-string and another_thing';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime, {});
    assert.ok(result.includes('some-random-string'));
  });

  it('handles agent names in backticks', () => {
    const content = '`code-reviewer` and `data-engineer`';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime, {});
    assert.ok(result.includes('`code_reviewer`'));
    assert.ok(result.includes('`data_engineer`'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/transforms/replace-agent-names.test.js`
Expected: FAIL

- [ ] **Step 3: Write replace-agent-names transform**

Create `src/transforms/replace-agent-names.js`:

```js
const shared = require('../runtimes/shared');

/**
 * Replace canonical agent names (kebab-case) with the runtime's naming convention.
 * Only replaces known agent names from the shared agent list.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function replaceAgentNames(content, runtime) {
  if (runtime.agentNaming === 'kebab-case') {
    return content; // Source already uses kebab-case
  }

  let result = content;
  for (const name of shared.agentNames) {
    if (!name.includes('-')) continue; // Only transform names with hyphens
    const snakeName = name.replace(/-/g, '_');
    // Replace whole-word occurrences (bounded by non-alphanumeric-dash-underscore)
    const pattern = new RegExp(escapeForRegex(name), 'g');
    result = result.replace(pattern, snakeName);
  }
  return result;
}

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = replaceAgentNames;
```

- [ ] **Step 4: Create shared.js with agent names**

Create `src/runtimes/shared.js`:

```js
/**
 * Shared constants used across all runtimes.
 * Agent names are in canonical kebab-case form.
 */
module.exports = {
  agentNames: [
    'accessibility-specialist',
    'analytics-engineer',
    'api-designer',
    'architect',
    'code-reviewer',
    'coder',
    'compliance-reviewer',
    'content-strategist',
    'copywriter',
    'data-engineer',
    'debugger',
    'design-system-engineer',
    'devops-engineer',
    'i18n-specialist',
    'performance-engineer',
    'product-manager',
    'refactor',
    'security-engineer',
    'seo-specialist',
    'technical-writer',
    'tester',
    'ux-designer',
  ],
};
```

- [ ] **Step 5: Run replace-agent-names tests**

Run: `node --test tests/transforms/replace-agent-names.test.js`
Expected: PASS

- [ ] **Step 6: Write replace-tool-names tests**

Create `tests/transforms/replace-tool-names.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replaceToolNames = require('../../src/transforms/replace-tool-names');

describe('replace-tool-names transform', () => {
  it('replaces canonical tool names with runtime equivalents', () => {
    const content = 'Do NOT call `ask_user` or use `write_file`.';
    const runtime = {
      tools: {
        ask_user: 'AskUserQuestion',
        write_file: 'Write',
      },
    };
    const result = replaceToolNames(content, runtime, {});
    assert.ok(result.includes('`AskUserQuestion`'));
    assert.ok(result.includes('`Write`'));
  });

  it('handles array tool mappings (write_todos -> TaskCreate/TaskUpdate/TaskList)', () => {
    const content = 'Use `write_todos` to track progress.';
    const runtime = {
      tools: {
        write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'],
      },
    };
    const result = replaceToolNames(content, runtime, {});
    assert.ok(result.includes('`TaskCreate`/`TaskUpdate`/`TaskList`'));
  });

  it('leaves identity-mapped tools unchanged', () => {
    const content = 'Use `read_file` to read.';
    const runtime = {
      tools: { read_file: 'read_file' },
    };
    const result = replaceToolNames(content, runtime, {});
    assert.ok(result.includes('`read_file`'));
  });
});
```

- [ ] **Step 7: Write replace-tool-names transform**

Create `src/transforms/replace-tool-names.js`:

```js
/**
 * Replace canonical tool names with the runtime's tool names.
 * Handles both string and array mappings.
 * Only replaces backtick-wrapped tool names to avoid false positives in prose.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function replaceToolNames(content, runtime) {
  let result = content;
  const tools = runtime.tools || {};

  for (const [canonical, mapped] of Object.entries(tools)) {
    if (canonical === mapped) continue; // Identity mapping

    const replacement = Array.isArray(mapped)
      ? mapped.map((t) => `\`${t}\``).join('/')
      : `\`${mapped}\``;

    // Replace `canonical_name` (backtick-wrapped)
    const pattern = new RegExp('`' + escapeForRegex(canonical) + '`', 'g');
    result = result.replace(pattern, replacement);

    // Replace bare canonical_name in YAML tool lists: - canonical_name
    const yamlPattern = new RegExp(
      '(^\\s*- )' + escapeForRegex(canonical) + '(\\s*$)',
      'gm'
    );
    if (!Array.isArray(mapped)) {
      result = result.replace(yamlPattern, `$1${mapped}$2`);
    }
  }
  return result;
}

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = replaceToolNames;
```

- [ ] **Step 8: Run replace-tool-names tests**

Run: `node --test tests/transforms/replace-tool-names.test.js`
Expected: PASS

- [ ] **Step 9: Write replace-paths tests and transform**

Create `tests/transforms/replace-paths.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replacePaths = require('../../src/transforms/replace-paths');

describe('replace-paths transform', () => {
  it('replaces canonical path variables with runtime equivalents', () => {
    const content = 'Load from `${extensionPath}/skills/` directory.';
    const runtime = {
      env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' },
      paths: { skills: '${CLAUDE_PLUGIN_ROOT}/skills/' },
    };
    const result = replacePaths(content, runtime, {});
    assert.ok(result.includes('${CLAUDE_PLUGIN_ROOT}/skills/'));
  });

  it('replaces workspace path variable', () => {
    const content = '${workspacePath}/docs/maestro';
    const runtime = {
      env: { workspacePath: 'CLAUDE_PROJECT_DIR', extensionPath: 'CLAUDE_PLUGIN_ROOT' },
      paths: {},
    };
    const result = replacePaths(content, runtime, {});
    assert.ok(result.includes('${CLAUDE_PROJECT_DIR}/docs/maestro'));
  });

  it('leaves gemini paths unchanged for gemini runtime', () => {
    const content = '${extensionPath}/skills/';
    const runtime = {
      env: { extensionPath: 'MAESTRO_EXTENSION_PATH' },
      paths: {},
    };
    const result = replacePaths(content, runtime, {});
    assert.ok(result.includes('${MAESTRO_EXTENSION_PATH}/skills/'));
  });
});
```

Create `src/transforms/replace-paths.js`:

```js
/**
 * Replace canonical path/env variable references with runtime equivalents.
 * Canonical form uses ${extensionPath} and ${workspacePath}.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function replacePaths(content, runtime) {
  let result = content;
  const env = runtime.env || {};

  // Replace ${extensionPath} -> ${RUNTIME_VAR}
  if (env.extensionPath) {
    result = result.replace(
      /\$\{extensionPath\}/g,
      '${' + env.extensionPath + '}'
    );
  }

  // Replace ${workspacePath} -> ${RUNTIME_VAR}
  if (env.workspacePath) {
    result = result.replace(
      /\$\{workspacePath\}/g,
      '${' + env.workspacePath + '}'
    );
  }

  return result;
}

module.exports = replacePaths;
```

- [ ] **Step 10: Run all replace-paths tests**

Run: `node --test tests/transforms/replace-paths.test.js`
Expected: PASS

- [ ] **Step 11: Register all new transforms**

Modify `src/transforms/index.js`:

```js
const copy = require('./copy');
const stripFeature = require('./strip-feature');
const replaceAgentNames = require('./replace-agent-names');
const replaceToolNames = require('./replace-tool-names');
const replacePaths = require('./replace-paths');

const transforms = {
  copy,
  'strip-feature': stripFeature,
  'replace-agent-names': replaceAgentNames,
  'replace-tool-names': replaceToolNames,
  'replace-paths': replacePaths,
};

/**
 * Resolve a transform name to its function.
 * Supports parameterized transforms like 'strip-feature:flagName'.
 * @param {string} name
 * @returns {{ fn: Function, param: string|null }}
 */
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

- [ ] **Step 12: Run all tests**

Run: `node --test tests/transforms/`
Expected: PASS (all tests)

- [ ] **Step 13: Commit**

```bash
git add src/transforms/ src/runtimes/shared.js tests/transforms/
git commit -m "feat: add replace-agent-names, replace-tool-names, replace-paths transforms"
```

---

### Task 4: Agent Frontmatter Injection Transform

**Files:**
- Create: `src/transforms/inject-frontmatter.js`
- Create: `tests/transforms/inject-frontmatter.test.js`
- Modify: `src/transforms/index.js`

- [ ] **Step 1: Write inject-frontmatter tests**

Create `tests/transforms/inject-frontmatter.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const injectFrontmatter = require('../../src/transforms/inject-frontmatter');

describe('inject-frontmatter transform', () => {
  const canonicalAgent = [
    '---',
    'name: code-reviewer',
    'description: "Code review specialist."',
    'color: blue',
    'tools: [read_file, glob, grep_search]',
    'max_turns: 15',
    'temperature: 0.2',
    'timeout_mins: 5',
    '---',
    '',
    '## Methodology',
    'Review code carefully.',
  ].join('\n');

  const geminiRuntime = {
    name: 'gemini',
    agentNaming: 'snake_case',
    agentFrontmatter: {
      kind: 'local',
      turnsField: 'max_turns',
      hasTemperature: true,
      hasTimeout: true,
    },
    tools: {
      read_file: 'read_file',
      glob: 'glob',
      grep_search: 'grep_search',
    },
  };

  const claudeRuntime = {
    name: 'claude',
    agentNaming: 'kebab-case',
    agentFrontmatter: {
      model: 'inherit',
      turnsField: 'maxTurns',
    },
    tools: {
      read_file: 'Read',
      glob: 'Glob',
      grep_search: 'Grep',
    },
  };

  it('produces gemini frontmatter with kind, temperature, timeout', () => {
    const result = injectFrontmatter(canonicalAgent, geminiRuntime, {});
    assert.ok(result.includes('name: code_reviewer'));
    assert.ok(result.includes('kind: local'));
    assert.ok(result.includes('temperature: 0.2'));
    assert.ok(result.includes('timeout_mins: 5'));
    assert.ok(result.includes('max_turns: 15'));
    assert.ok(!result.includes('color:'));
    assert.ok(result.includes('## Methodology'));
  });

  it('produces claude frontmatter with model, color, maxTurns', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    assert.ok(result.includes('name: code-reviewer'));
    assert.ok(result.includes('model: inherit'));
    assert.ok(result.includes('color: blue'));
    assert.ok(result.includes('maxTurns: 15'));
    assert.ok(!result.includes('temperature'));
    assert.ok(!result.includes('timeout_mins'));
    assert.ok(!result.includes('kind:'));
  });

  it('uses tools.<runtime> override when present', () => {
    const agentWithOverride = [
      '---',
      'name: architect',
      'description: "Architect."',
      'color: blue',
      'tools: [read_file, glob]',
      'tools.claude: [Read, Glob, Grep, WebSearch, WebFetch]',
      'max_turns: 15',
      'temperature: 0.3',
      'timeout_mins: 5',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = injectFrontmatter(agentWithOverride, claudeRuntime, {});
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- WebFetch'));
  });

  it('maps canonical tool names through runtime.tools when no override', () => {
    const result = injectFrontmatter(canonicalAgent, claudeRuntime, {});
    assert.ok(result.includes('- Read'));
    assert.ok(result.includes('- Glob'));
    assert.ok(result.includes('- Grep'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/transforms/inject-frontmatter.test.js`
Expected: FAIL

- [ ] **Step 3: Write the inject-frontmatter transform**

Create `src/transforms/inject-frontmatter.js`:

```js
/**
 * Parse canonical agent frontmatter, rebuild it per runtime config,
 * and prepend to the body content.
 *
 * @param {string} content - Full agent file with canonical --- frontmatter ---
 * @param {object} runtime
 * @returns {string}
 */
function injectFrontmatter(content, runtime) {
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = runtime.agentFrontmatter;

  // Resolve agent name
  const name =
    runtime.agentNaming === 'snake_case'
      ? frontmatter.name.replace(/-/g, '_')
      : frontmatter.name;

  // Resolve tools: use per-runtime override if it exists, otherwise map canonical
  const toolsKey = `tools.${runtime.name}`;
  let tools;
  if (frontmatter[toolsKey]) {
    tools = frontmatter[toolsKey];
  } else if (frontmatter.tools) {
    tools = frontmatter.tools.map((t) => {
      const mapped = runtime.tools[t];
      if (Array.isArray(mapped)) return mapped;
      return mapped || t;
    }).flat();
  } else {
    tools = [];
  }

  // Build output frontmatter
  const lines = ['---'];
  lines.push(`name: ${name}`);

  // Runtime-specific fields
  if (fm.kind) lines.push(`kind: ${fm.kind}`);
  if (fm.model) lines.push(`model: ${fm.model}`);

  // Description (always present)
  lines.push(`description: ${yamlQuote(frontmatter.description)}`);

  // Color (Claude only)
  if (runtime.name !== 'gemini' && frontmatter.color) {
    lines.push(`color: ${frontmatter.color}`);
  }

  // Turns
  const turnsField = fm.turnsField || 'max_turns';
  const turnsValue = frontmatter.max_turns || frontmatter.maxTurns;
  if (turnsValue) lines.push(`${turnsField}: ${turnsValue}`);

  // Temperature (Gemini only)
  if (fm.hasTemperature && frontmatter.temperature != null) {
    lines.push(`temperature: ${frontmatter.temperature}`);
  }

  // Timeout (Gemini only)
  if (fm.hasTimeout && frontmatter.timeout_mins != null) {
    lines.push(`timeout_mins: ${frontmatter.timeout_mins}`);
  }

  // Tools
  if (tools.length > 0) {
    lines.push('tools:');
    for (const tool of tools) {
      lines.push(`  - ${tool}`);
    }
  }

  lines.push('---');

  return lines.join('\n') + '\n' + body;
}

/**
 * Parse YAML-like frontmatter between --- delimiters.
 * Returns { frontmatter: object, body: string }.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('No frontmatter found in agent file');
  }

  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    // Handle YAML list items under a key
    if (line.match(/^\s+-\s/)) continue; // Skip list items (handled by array parsing below)

    const kvMatch = line.match(/^(\S[\w.]*?):\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();

    // Check if this is an inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === '') {
      // This is a key with block content below (like tools:)
      // Parse the following indented list
      const listItems = [];
      const lines = yamlBlock.split('\n');
      const keyLineIdx = lines.indexOf(line);
      for (let i = keyLineIdx + 1; i < lines.length; i++) {
        const itemMatch = lines[i].match(/^\s+-\s+(.+)$/);
        if (itemMatch) {
          listItems.push(itemMatch[1].trim());
        } else if (!lines[i].match(/^\s*$/)) {
          break; // Non-list, non-blank line ends the list
        }
      }
      if (listItems.length > 0) {
        frontmatter[key] = listItems;
      }
    } else {
      // Scalar value — strip quotes
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Parse numeric values
  for (const key of ['max_turns', 'maxTurns', 'temperature', 'timeout_mins']) {
    if (frontmatter[key] != null) {
      const num = Number(frontmatter[key]);
      if (!isNaN(num)) frontmatter[key] = num;
    }
  }

  return { frontmatter, body };
}

/**
 * Quote a YAML string value if it contains special characters.
 */
function yamlQuote(value) {
  if (typeof value !== 'string') return String(value);
  if (value.includes('"') || value.includes(':') || value.includes('#')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `"${value}"`;
}

module.exports = injectFrontmatter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/transforms/inject-frontmatter.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Register transform and run all tests**

Add to `src/transforms/index.js`:

```js
const injectFrontmatter = require('./inject-frontmatter');
```

And in the transforms object:

```js
'inject-frontmatter': injectFrontmatter,
```

Run: `node --test tests/transforms/`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/transforms/inject-frontmatter.js tests/transforms/inject-frontmatter.test.js src/transforms/index.js
git commit -m "feat: add inject-frontmatter transform for agent definitions"
```

---

### Task 5: Skill Metadata Transform

**Files:**
- Create: `src/transforms/skill-metadata.js`
- Create: `tests/transforms/skill-metadata.test.js`
- Modify: `src/transforms/index.js`

- [ ] **Step 1: Write skill-metadata tests**

Create `tests/transforms/skill-metadata.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const skillMetadata = require('../../src/transforms/skill-metadata');

describe('skill-metadata transform', () => {
  const skillContent = [
    '---',
    'name: execution',
    'description: Phase execution methodology.',
    '---',
    '',
    '## Content here',
  ].join('\n');

  it('adds user-invocable: false for claude', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(result.includes('user-invocable: false'));
  });

  it('does not add user-invocable for gemini', () => {
    const runtime = { name: 'gemini' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(!result.includes('user-invocable'));
  });

  it('preserves existing frontmatter fields', () => {
    const runtime = { name: 'claude' };
    const result = skillMetadata(skillContent, runtime, {});
    assert.ok(result.includes('name: execution'));
    assert.ok(result.includes('description: Phase execution methodology.'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/transforms/skill-metadata.test.js`
Expected: FAIL

- [ ] **Step 3: Write skill-metadata transform**

Create `src/transforms/skill-metadata.js`:

```js
/**
 * Add runtime-specific metadata to skill frontmatter.
 * For Claude: adds user-invocable: false.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function skillMetadata(content, runtime) {
  if (runtime.name === 'gemini') {
    return content; // No metadata changes for Gemini
  }

  // Insert user-invocable: false before the closing ---
  return content.replace(
    /^(---\n[\s\S]*?)(^---)/m,
    '$1user-invocable: false\n$2'
  );
}

module.exports = skillMetadata;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/transforms/skill-metadata.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Register and run all tests**

Add to `src/transforms/index.js`:

```js
const skillMetadata = require('./skill-metadata');
```

And in the transforms object:

```js
'skill-metadata': skillMetadata,
```

Run: `node --test tests/transforms/`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/transforms/skill-metadata.js tests/transforms/skill-metadata.test.js src/transforms/index.js
git commit -m "feat: add skill-metadata transform for runtime-specific skill frontmatter"
```

---

### Task 6: Runtime Configs

**Files:**
- Create: `src/runtimes/gemini.js`
- Create: `src/runtimes/claude.js`
- Modify: `src/runtimes/shared.js` (already exists from Task 3)

- [ ] **Step 1: Write the Gemini runtime config**

Create `src/runtimes/gemini.js` with the full config from the spec (Section 2). Include the complete tool map based on actual agent frontmatter gathered during research. All tool names are identity-mapped since Gemini uses the canonical names.

Refer to the spec at `docs/specs/2026-04-04-runtime-generator-design.md` lines 162-217 for the complete config. The implementer should read the actual Gemini agent files to build the exact tool list and copy the config verbatim from the spec.

- [ ] **Step 2: Write the Claude runtime config**

Create `src/runtimes/claude.js` with the full config from the spec (Section 2, lines 97-158). Include the complete tool map. The implementer should read actual Claude agent files to verify tool names.

- [ ] **Step 3: Verify configs load without error**

Run: `node -e "const g = require('./src/runtimes/gemini'); const c = require('./src/runtimes/claude'); console.log('Gemini:', g.name, '| Claude:', c.name);"`
Expected: `Gemini: gemini | Claude: claude`

- [ ] **Step 4: Commit**

```bash
git add src/runtimes/gemini.js src/runtimes/claude.js
git commit -m "feat: add gemini and claude runtime configs"
```

---

### Task 7: Generator Core

**Files:**
- Modify: `scripts/generate.js`
- Create: `tests/integration/generator.test.js`

- [ ] **Step 1: Write integration test for the generator**

Create `tests/integration/generator.test.js`:

```js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'tests', 'integration', '_tmp');

describe('generator integration', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('--dry-run produces no file writes', () => {
    const result = execSync('node scripts/generate.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.ok(result.includes('dry-run'));
  });
});
```

- [ ] **Step 2: Implement the generator core**

Rewrite `scripts/generate.js`:

```js
#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { resolve: resolveTransform } = require('../src/transforms');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');

async function main() {
  // Load manifest and runtimes
  const manifest = require(path.join(SRC, 'manifest'));
  const runtimeFiles = fs.readdirSync(path.join(SRC, 'runtimes'))
    .filter((f) => f.endsWith('.js') && f !== 'shared.js');

  const runtimes = {};
  for (const file of runtimeFiles) {
    const config = require(path.join(SRC, 'runtimes', file));
    runtimes[config.name] = config;
  }

  const stats = { written: 0, unchanged: 0, errors: 0 };
  const writtenFiles = new Set();

  // Clean mode: remove all generator-owned files before regenerating
  if (cleanMode && !dryRun) {
    for (const entry of manifest) {
      for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
        const absPath = resolveOutputPath(outputPath, runtimes[runtimeName]);
        if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath);
        }
      }
    }
    console.log('Cleaned all generator-owned files.');
  }

  // Process each manifest entry
  for (const entry of manifest) {
    const srcPath = path.join(SRC, entry.src);

    if (!fs.existsSync(srcPath)) {
      console.error(`ERROR: Source not found: ${entry.src}`);
      stats.errors++;
      continue;
    }

    const sourceContent = fs.readFileSync(srcPath, 'utf8');

    for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
      const runtime = runtimes[runtimeName];
      if (!runtime) {
        console.error(`ERROR: Unknown runtime "${runtimeName}" in manifest entry for ${entry.src}`);
        stats.errors++;
        continue;
      }

      try {
        // Apply transforms in order
        let content = sourceContent;
        for (const transformName of entry.transforms) {
          const { fn, param } = resolveTransform(transformName);
          content = fn(content, runtime, { src: entry.src, param });
        }

        const absOutputPath = resolveOutputPath(outputPath, runtime);

        if (diffMode) {
          showDiff(absOutputPath, content, outputPath);
        } else if (dryRun) {
          const exists = fs.existsSync(absOutputPath);
          const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;
          const status = !exists ? 'CREATE' : current === content ? 'UNCHANGED' : 'UPDATE';
          console.log(`[${status}] ${outputPath}`);
        } else {
          // Write file
          const dir = path.dirname(absOutputPath);
          fs.mkdirSync(dir, { recursive: true });

          const exists = fs.existsSync(absOutputPath);
          const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;

          if (current === content) {
            stats.unchanged++;
          } else {
            fs.writeFileSync(absOutputPath, content, 'utf8');
            stats.written++;
          }
        }

        writtenFiles.add(outputPath);
      } catch (err) {
        console.error(`ERROR processing ${entry.src} -> ${outputPath}: ${err.message}`);
        stats.errors++;
      }
    }
  }

  if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (stats.errors > 0) {
    process.exit(1);
  }
}

/**
 * Resolve an output path relative to the project root.
 */
function resolveOutputPath(outputPath, runtime) {
  return path.join(ROOT, outputPath);
}

/**
 * Show a unified diff between current file and new content.
 */
function showDiff(absPath, newContent, label) {
  if (!fs.existsSync(absPath)) {
    console.log(`+++ NEW: ${label}`);
    return;
  }
  const current = fs.readFileSync(absPath, 'utf8');
  if (current === newContent) return;

  // Write temp file and diff
  const tmpPath = absPath + '.gen-tmp';
  fs.writeFileSync(tmpPath, newContent, 'utf8');
  try {
    execSync(`diff -u "${absPath}" "${tmpPath}"`, { encoding: 'utf8' });
  } catch (err) {
    // diff exits 1 when files differ — that's expected
    console.log(`--- ${label}`);
    console.log(err.stdout);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

main().catch((err) => {
  console.error('Generator failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Create a minimal manifest for testing**

Create `src/manifest.js`:

```js
module.exports = [
  // Placeholder — will be populated in Task 12+
];
```

- [ ] **Step 4: Run integration test**

Run: `node --test tests/integration/generator.test.js`
Expected: PASS

- [ ] **Step 5: Run generator in dry-run mode**

Run: `node scripts/generate.js --dry-run`
Expected: prints "(dry-run — no files written)" with no errors

- [ ] **Step 6: Commit**

```bash
git add scripts/generate.js src/manifest.js tests/integration/
git commit -m "feat: implement generator core with manifest processing and CLI modes"
```

---

### Task 8: Extract Copy-Category Source Files

These files are byte-identical across runtimes: lib/, scripts/, templates/, orchestration-steps.md.

**Files:**
- Create: `src/lib/config/setting-resolver.js` (copy from root)
- Create: `src/lib/core/agent-registry.js` (copy from root)
- Create: `src/lib/core/atomic-write.js` (copy from root)
- Create: `src/lib/core/env-file-parser.js` (copy from root)
- Create: `src/lib/core/logger.js` (copy from root)
- Create: `src/lib/core/project-root-resolver.js` (copy from root)
- Create: `src/lib/core/stdin-reader.js` (copy from root)
- Create: `src/lib/hooks/after-agent-logic.js` (copy from root)
- Create: `src/lib/hooks/before-agent-logic.js` (copy from root)
- Create: `src/lib/hooks/hook-state.js` (copy from root)
- Create: `src/lib/hooks/session-end-logic.js` (copy from root)
- Create: `src/lib/hooks/session-start-logic.js` (copy from root)
- Create: `src/lib/mcp/handlers/get-skill-content.js` (Gemini-only, copy from root)
- Create: `src/lib/state/session-id-validator.js` (copy from root)
- Create: `src/lib/state/session-state.js` (copy from root)
- Create: `src/scripts/ensure-workspace.js` (copy from root)
- Create: `src/scripts/read-active-session.js` (copy from root)
- Create: `src/scripts/read-setting.js` (copy from root)
- Create: `src/scripts/read-state.js` (copy from root)
- Create: `src/scripts/write-state.js` (copy from root)
- Create: `src/templates/design-document.md` (copy from root)
- Create: `src/templates/implementation-plan.md` (copy from root)
- Create: `src/templates/session-state.md` (copy from root)
- Create: `src/references/orchestration-steps.md` (copy from root)
- Modify: `src/manifest.js` (add entries)

- [ ] **Step 1: Copy all byte-identical source files into src/**

```bash
# lib/ files (shared across both runtimes)
cp -r lib/config/ src/lib/config/
cp -r lib/core/ src/lib/core/
cp -r lib/hooks/ src/lib/hooks/
cp -r lib/state/ src/lib/state/
mkdir -p src/lib/mcp/handlers/
cp lib/mcp/handlers/get-skill-content.js src/lib/mcp/handlers/

# scripts/
cp scripts/ensure-workspace.js src/scripts/
cp scripts/read-active-session.js src/scripts/
cp scripts/read-setting.js src/scripts/
cp scripts/read-state.js src/scripts/
cp scripts/write-state.js src/scripts/

# templates/
cp -r templates/ src/templates/

# references/ (orchestration-steps is byte-identical)
cp references/orchestration-steps.md src/references/
```

- [ ] **Step 2: Add manifest entries for all copy files**

Update `src/manifest.js` with entries for every file listed above. Each follows this pattern:

```js
{ src: 'lib/core/atomic-write.js', transforms: ['copy'], outputs: { gemini: 'lib/core/atomic-write.js', claude: 'claude/lib/core/atomic-write.js' } },
```

For `lib/mcp/handlers/get-skill-content.js` — Gemini only:

```js
{ src: 'lib/mcp/handlers/get-skill-content.js', transforms: ['copy'], outputs: { gemini: 'lib/mcp/handlers/get-skill-content.js' } },
```

The implementer must add one entry per file. There are 25 files total in this category.

- [ ] **Step 3: Run generator and verify output matches current files**

```bash
node scripts/generate.js
# Verify zero diff for the copy-category files
git diff --name-only lib/ claude/lib/ scripts/ensure-workspace.js scripts/read-active-session.js scripts/read-setting.js scripts/read-state.js scripts/write-state.js templates/ references/orchestration-steps.md
```

Expected: no output (no differences)

- [ ] **Step 4: Commit**

```bash
git add src/lib/ src/scripts/ src/templates/ src/references/orchestration-steps.md src/manifest.js
git commit -m "feat: extract copy-category source files (lib, scripts, templates, orchestration-steps)"
```

---

### Task 9: Extract Reference Sources

**Files:**
- Create: `src/references/architecture.md` (canonical version with kebab-case agent names)
- Modify: `src/manifest.js`

- [ ] **Step 1: Copy architecture.md and canonicalize agent names**

The canonical form uses kebab-case (matching the Claude version). Copy `claude/references/architecture.md` to `src/references/architecture.md` and replace all runtime-specific path variables (`${CLAUDE_PLUGIN_ROOT}`) with canonical form (`${extensionPath}`).

```bash
cp claude/references/architecture.md src/references/architecture.md
```

Then edit `src/references/architecture.md` to replace `${CLAUDE_PLUGIN_ROOT}` with `${extensionPath}` and `${CLAUDE_PROJECT_DIR}` with `${workspacePath}`.

- [ ] **Step 2: Add manifest entry**

Add to `src/manifest.js`:

```js
{ src: 'references/architecture.md', transforms: ['replace-agent-names', 'replace-paths'], outputs: { gemini: 'references/architecture.md', claude: 'claude/references/architecture.md' } },
```

- [ ] **Step 3: Run generator and verify both outputs match**

```bash
node scripts/generate.js
diff references/architecture.md <(git show HEAD:references/architecture.md)
diff claude/references/architecture.md <(git show HEAD:claude/references/architecture.md)
```

Expected: no differences

- [ ] **Step 4: Commit**

```bash
git add src/references/architecture.md src/manifest.js
git commit -m "feat: extract architecture reference with canonical agent names"
```

---

### Task 10: Extract Agent Sources

This is the largest extraction task — 22 agents need canonical source files with feature-flagged example blocks and per-runtime tool overrides.

**Files:**
- Create: `src/agents/<name>.md` for each of the 22 agents
- Modify: `src/manifest.js`

- [ ] **Step 1: Build the extraction script**

Create a one-time helper script `scripts/extract-agents.js` that reads each Gemini agent and its Claude counterpart, merges them into a canonical source file with:

1. Canonical frontmatter (kebab-case name, description, color from Claude, base tools, `tools.gemini` and `tools.claude` overrides, max_turns, temperature, timeout_mins)
2. Feature-flagged `<example>` blocks (extracted from Claude's description field)
3. Shared methodology body (from Gemini, since it has no example blocks mixed in)

The implementer should read the actual agent files and build each canonical source. The pattern for every agent is the same:

```markdown
---
name: code-reviewer
description: "Code review specialist for identifying bugs, security vulnerabilities, and code quality issues."
color: blue
tools: [read_file, glob, grep_search]
tools.gemini: [read_file, list_directory, glob, grep_search, read_many_files, ask_user]
tools.claude: [Read, Glob, Grep]
max_turns: 15
temperature: 0.2
timeout_mins: 5
---

<!-- @feature exampleBlocks -->
<example>
Context: User wants a code review before merging or shipping.
user: "Review the authentication service implementation for correctness and quality"
assistant: "I'll review the implementation for correctness, SOLID principles, error handling, security concerns, and consistency with established patterns."
<commentary>
Code Reviewer is appropriate for review tasks — read-only analysis and recommendations.
</commentary>
</example>
<example>
Context: User needs a second opinion on implementation decisions.
user: "Can you check if our new API layer follows our conventions?"
assistant: "I'll read the existing codebase patterns and compare against the new API layer, identifying any deviations with specific line references."
<commentary>
Code Reviewer handles convention audits and targeted feedback.
</commentary>
</example>
<!-- @end-feature -->

## Methodology
[shared methodology content from Gemini version]
```

- [ ] **Step 2: Extract all 22 agents following the pattern**

For each agent, read both the Gemini and Claude versions, then create the canonical source in `src/agents/`. Use kebab-case filenames for all (matching canonical naming). The 22 agents are:

`accessibility-specialist.md`, `analytics-engineer.md`, `api-designer.md`, `architect.md`, `code-reviewer.md`, `coder.md`, `compliance-reviewer.md`, `content-strategist.md`, `copywriter.md`, `data-engineer.md`, `debugger.md`, `design-system-engineer.md`, `devops-engineer.md`, `i18n-specialist.md`, `performance-engineer.md`, `product-manager.md`, `refactor.md`, `security-engineer.md`, `seo-specialist.md`, `technical-writer.md`, `tester.md`, `ux-designer.md`

- [ ] **Step 3: Add manifest entries for all 22 agents**

Each agent follows this pattern in `src/manifest.js`:

```js
{
  src: 'agents/code-reviewer.md',
  transforms: ['inject-frontmatter', 'strip-feature', 'replace-tool-names', 'replace-agent-names'],
  outputs: {
    gemini: 'agents/code_reviewer.md',
    claude: 'claude/agents/code-reviewer.md',
  },
},
```

Note: Gemini output uses snake_case filenames. Claude output uses kebab-case. Agents without hyphens (architect, coder, copywriter, debugger, refactor, tester) have identical filenames in both runtimes.

- [ ] **Step 4: Run generator and verify agent output matches current files**

```bash
node scripts/generate.js
# Check a few agents
diff agents/architect.md <(git show HEAD:agents/architect.md)
diff claude/agents/architect.md <(git show HEAD:claude/agents/architect.md)
diff agents/code_reviewer.md <(git show HEAD:agents/code_reviewer.md)
diff claude/agents/code-reviewer.md <(git show HEAD:claude/agents/code-reviewer.md)
diff agents/debugger.md <(git show HEAD:agents/debugger.md)
diff claude/agents/debugger.md <(git show HEAD:claude/agents/debugger.md)
```

Expected: no differences for any agent

- [ ] **Step 5: Commit**

```bash
git add src/agents/ src/manifest.js
git commit -m "feat: extract 22 agent sources with canonical frontmatter and feature-flagged examples"
```

---

### Task 11: Extract Shared Skill Sources

7 shared skills + 2 delegation protocol files need canonical sources with feature flags for structural differences.

**Files:**
- Create: `src/skills/shared/code-review/SKILL.md`
- Create: `src/skills/shared/delegation/SKILL.md`
- Create: `src/skills/shared/delegation/protocols/agent-base-protocol.md`
- Create: `src/skills/shared/delegation/protocols/filesystem-safety-protocol.md`
- Create: `src/skills/shared/design-dialogue/SKILL.md`
- Create: `src/skills/shared/execution/SKILL.md`
- Create: `src/skills/shared/implementation-planning/SKILL.md`
- Create: `src/skills/shared/session-management/SKILL.md`
- Create: `src/skills/shared/validation/SKILL.md`
- Modify: `src/manifest.js`

- [ ] **Step 1: Extract shared skill sources with feature flags**

For each shared skill, create a canonical version that:

1. Uses Gemini frontmatter as the base (no `user-invocable` field — that's added by `skill-metadata` transform)
2. Uses canonical tool names (`ask_user`, `write_file`, etc.) and path variables (`${extensionPath}`)
3. Wraps runtime-divergent sections in feature flag markers:
   - Hook lifecycle descriptions: `<!-- @feature geminiHookModel -->` / `<!-- @feature claudeHookModel -->`
   - Delegation dispatch syntax: `<!-- @feature geminiDelegation -->` / `<!-- @feature claudeDelegation -->`
   - Tool restriction examples: `<!-- @feature geminiToolExamples -->` / `<!-- @feature claudeToolExamples -->`
   - Structured question format: `<!-- @feature geminiAskFormat -->`

The implementer must diff each Gemini/Claude skill pair to identify all divergent sections and wrap them appropriately. The shared content between the markers stays in canonical form.

- [ ] **Step 2: Add manifest entries for all shared skills**

Each shared skill follows this pattern:

```js
{
  src: 'skills/shared/execution/SKILL.md',
  transforms: ['skill-metadata', 'strip-feature', 'replace-tool-names', 'replace-paths', 'replace-agent-names'],
  outputs: {
    gemini: 'skills/execution/SKILL.md',
    claude: 'claude/skills/execution/SKILL.md',
  },
},
```

Protocol files follow a similar pattern:

```js
{
  src: 'skills/shared/delegation/protocols/agent-base-protocol.md',
  transforms: ['strip-feature', 'replace-tool-names', 'replace-paths', 'replace-agent-names'],
  outputs: {
    gemini: 'skills/delegation/protocols/agent-base-protocol.md',
    claude: 'claude/skills/delegation/protocols/agent-base-protocol.md',
  },
},
```

- [ ] **Step 3: Run generator and verify skill output matches**

```bash
node scripts/generate.js
diff skills/execution/SKILL.md <(git show HEAD:skills/execution/SKILL.md)
diff claude/skills/execution/SKILL.md <(git show HEAD:claude/skills/execution/SKILL.md)
diff skills/delegation/SKILL.md <(git show HEAD:skills/delegation/SKILL.md)
diff claude/skills/delegation/SKILL.md <(git show HEAD:claude/skills/delegation/SKILL.md)
```

Expected: no differences

- [ ] **Step 4: Commit**

```bash
git add src/skills/ src/manifest.js
git commit -m "feat: extract 7 shared skill sources with feature-flagged content blocks"
```

---

### Task 12: Extract Hook Sources

**Files:**
- Create: `src/hooks/shared/session-start.js`
- Create: `src/hooks/shared/session-end.js`
- Create: `src/hooks/shared/before-agent.js`
- Create: `src/hooks/runtime-only/gemini/hook-adapter.js`
- Create: `src/hooks/runtime-only/gemini/after-agent.js`
- Create: `src/hooks/runtime-only/claude/hook-adapter.js`
- Create: `src/hooks/hook-configs/gemini.json`
- Create: `src/hooks/hook-configs/claude.json`
- Modify: `src/manifest.js`

- [ ] **Step 1: Copy shared hook scripts**

The shared hook scripts (`session-start.js`, `session-end.js`, `before-agent.js`) have minor output format differences between runtimes (Claude adds `"decision": "approve"`). These need to be canonicalized with feature flags or handled as runtime-only files.

Read both versions of each file. If the only difference is the error response format, use the Gemini version as canonical and wrap the Claude-specific output in a feature flag.

If the differences are too structural for feature flags, treat both as runtime-only:

```bash
# Runtime-only hook scripts
cp hooks/session-start.js src/hooks/runtime-only/gemini/session-start.js
cp claude/scripts/session-start.js src/hooks/runtime-only/claude/session-start.js
# Repeat for session-end.js and before-agent.js
```

- [ ] **Step 2: Copy runtime-only hook files**

```bash
cp hooks/hook-adapter.js src/hooks/runtime-only/gemini/hook-adapter.js
cp hooks/after-agent.js src/hooks/runtime-only/gemini/after-agent.js
cp claude/scripts/hook-adapter.js src/hooks/runtime-only/claude/hook-adapter.js
cp hooks/hooks.json src/hooks/hook-configs/gemini.json
cp claude/hooks/claude-hooks.json src/hooks/hook-configs/claude.json
```

- [ ] **Step 3: Add manifest entries**

For runtime-only hooks, each entry outputs to only one runtime:

```js
// Gemini hooks
{ src: 'hooks/runtime-only/gemini/hook-adapter.js', transforms: ['copy'], outputs: { gemini: 'hooks/hook-adapter.js' } },
{ src: 'hooks/runtime-only/gemini/after-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/after-agent.js' } },
{ src: 'hooks/runtime-only/gemini/session-start.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-start.js' } },
{ src: 'hooks/runtime-only/gemini/session-end.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-end.js' } },
{ src: 'hooks/runtime-only/gemini/before-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/before-agent.js' } },
{ src: 'hooks/hook-configs/gemini.json', transforms: ['copy'], outputs: { gemini: 'hooks/hooks.json' } },

// Claude hooks
{ src: 'hooks/runtime-only/claude/hook-adapter.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/hook-adapter.js' } },
{ src: 'hooks/runtime-only/claude/session-start.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-start.js' } },
{ src: 'hooks/runtime-only/claude/session-end.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-end.js' } },
{ src: 'hooks/runtime-only/claude/before-agent.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/before-agent.js' } },
{ src: 'hooks/hook-configs/claude.json', transforms: ['copy'], outputs: { claude: 'claude/hooks/claude-hooks.json' } },
```

- [ ] **Step 4: Run generator and verify**

```bash
node scripts/generate.js
diff hooks/hooks.json <(git show HEAD:hooks/hooks.json)
diff claude/hooks/claude-hooks.json <(git show HEAD:claude/hooks/claude-hooks.json)
diff hooks/hook-adapter.js <(git show HEAD:hooks/hook-adapter.js)
diff claude/scripts/hook-adapter.js <(git show HEAD:claude/scripts/hook-adapter.js)
```

Expected: no differences

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ src/manifest.js
git commit -m "feat: extract hook sources (shared + runtime-only + configs)"
```

---

### Task 13: Extract MCP and Runtime-Only Sources

**Files:**
- Create: `src/mcp/maestro-server.js` (unified with feature flags)
- Create: `src/runtime-only/gemini/GEMINI.md`
- Create: `src/runtime-only/gemini/gemini-extension.json`
- Create: `src/runtime-only/gemini/.geminiignore`
- Create: `src/runtime-only/gemini/policies/maestro.toml`
- Create: `src/runtime-only/gemini/commands/maestro/*.toml` (12 files)
- Create: `src/runtime-only/claude/README.md`
- Create: `src/runtime-only/claude/.claude-plugin/plugin.json`
- Create: `src/runtime-only/claude/.mcp.json`
- Create: `src/runtime-only/claude/mcp-config.example.json`
- Create: `src/runtime-only/claude/scripts/policy-enforcer.js`
- Create: `src/runtime-only/claude/scripts/policy-enforcer.test.js`
- Create: `src/runtime-only/claude/skills/<name>/SKILL.md` (12 Claude-only skills)
- Modify: `src/manifest.js`

- [ ] **Step 1: Create unified MCP source with feature flags**

Copy the Gemini MCP server as the base (it has the `get-skill-content` handler). Wrap the handler section with `// @feature mcpSkillContentHandler` / `// @end-feature` markers.

The implementer must identify the exact lines in `mcp/maestro-server.js` that differ from `claude/mcp/maestro-server.js` and wrap them.

- [ ] **Step 2: Copy all Gemini-only files**

```bash
cp GEMINI.md src/runtime-only/gemini/
cp gemini-extension.json src/runtime-only/gemini/
cp .geminiignore src/runtime-only/gemini/
mkdir -p src/runtime-only/gemini/policies/
cp policies/maestro.toml src/runtime-only/gemini/policies/
mkdir -p src/runtime-only/gemini/commands/maestro/
cp commands/maestro/*.toml src/runtime-only/gemini/commands/maestro/
```

- [ ] **Step 3: Copy all Claude-only files**

```bash
cp claude/README.md src/runtime-only/claude/
mkdir -p src/runtime-only/claude/.claude-plugin/
cp claude/.claude-plugin/plugin.json src/runtime-only/claude/.claude-plugin/
cp claude/.mcp.json src/runtime-only/claude/
cp claude/mcp-config.example.json src/runtime-only/claude/
mkdir -p src/runtime-only/claude/scripts/
cp claude/scripts/policy-enforcer.js src/runtime-only/claude/scripts/
cp claude/scripts/policy-enforcer.test.js src/runtime-only/claude/scripts/

# Claude-only skills (12)
for skill in a11y-audit archive compliance-check debug execute orchestrate perf-check resume review security-audit seo-audit status; do
  mkdir -p "src/runtime-only/claude/skills/$skill/"
  cp "claude/skills/$skill/SKILL.md" "src/runtime-only/claude/skills/$skill/"
done
```

- [ ] **Step 4: Add manifest entries for MCP and all runtime-only files**

MCP entry:

```js
{ src: 'mcp/maestro-server.js', transforms: ['strip-feature'], outputs: { gemini: 'mcp/maestro-server.js', claude: 'claude/mcp/maestro-server.js' } },
```

Each runtime-only file gets a `copy` transform with output to its single runtime. The implementer must add one entry per file.

- [ ] **Step 5: Run generator and verify**

```bash
node scripts/generate.js
# Spot-check a few
diff GEMINI.md <(git show HEAD:GEMINI.md)
diff claude/README.md <(git show HEAD:claude/README.md)
diff claude/.claude-plugin/plugin.json <(git show HEAD:claude/.claude-plugin/plugin.json)
```

Expected: no differences

- [ ] **Step 6: Commit**

```bash
git add src/mcp/ src/runtime-only/ src/manifest.js
git commit -m "feat: extract MCP source and all runtime-only files"
```

---

### Task 14: Full Zero-Diff Validation

**Files:**
- Create: `tests/integration/zero-diff.test.js`

- [ ] **Step 1: Write comprehensive zero-diff test**

Create `tests/integration/zero-diff.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    // Run generator
    execSync('node scripts/generate.js', { cwd: ROOT, encoding: 'utf8' });

    // Check for any differences
    const diff = execSync('git diff --name-only', {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();

    if (diff) {
      const details = execSync('git diff --stat', { cwd: ROOT, encoding: 'utf8' });
      assert.fail(`Generator output differs from committed files:\n${diff}\n\n${details}`);
    }
  });
});
```

- [ ] **Step 2: Run the zero-diff validation**

```bash
node scripts/generate.js
git diff --name-only
```

Expected: no output (zero diff)

If there are differences, the implementer must fix the source files or transforms until the output matches exactly. Common issues:

- Trailing whitespace differences
- Line ending differences (ensure consistent LF)
- YAML serialization order differences in frontmatter
- Missing or extra blank lines

- [ ] **Step 3: Run the full zero-diff test**

Run: `node --test tests/integration/zero-diff.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/zero-diff.test.js
git commit -m "feat: add zero-diff validation test"
```

---

### Task 15: Stale File Detection

**Files:**
- Modify: `scripts/generate.js`

- [ ] **Step 1: Add stale file detection to the generator**

After the main generation loop in `scripts/generate.js`, add a function that scans the output directories for files that exist but aren't in the manifest. This warns about orphaned files from before the generator existed.

Add after the main loop, before the summary:

```js
// Stale file detection
if (!dryRun && !diffMode) {
  const manifestOutputs = new Set();
  for (const entry of manifest) {
    for (const outputPath of Object.values(entry.outputs)) {
      manifestOutputs.add(outputPath);
    }
  }

  const staleFiles = findStaleFiles(manifestOutputs);
  if (staleFiles.length > 0) {
    console.log(`\nWARNING: ${staleFiles.length} file(s) in output directories not in manifest:`);
    for (const f of staleFiles) {
      console.log(`  ${f}`);
    }
  }
}
```

The `findStaleFiles` function walks the generator-owned directories and compares against the manifest set. It must exclude the directories listed in the spec's "What the Generator Does NOT Own" section (CLAUDE.md, .gitignore, .github/, docs/, src/, package.json, scripts/generate.js, scripts/check-claude-lib-drift.sh).

- [ ] **Step 2: Test stale detection works**

Run: `node scripts/generate.js`
Expected: If any stale files exist, they're reported as warnings. If not, no warning.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate.js
git commit -m "feat: add stale file detection to generator"
```

---

### Task 16: CI Workflow and Documentation Update

**Files:**
- Create: `.github/workflows/generator-check.yml`
- Modify: `CLAUDE.md`
- Remove: `scripts/check-claude-lib-drift.sh` (superseded)

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/generator-check.yml`:

```yaml
name: Generator Drift Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-generator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run generator
        run: node scripts/generate.js

      - name: Check for drift
        run: |
          if ! git diff --exit-code --name-only; then
            echo "::error::Generated files are out of sync with source. Run 'node scripts/generate.js' and commit the changes."
            git diff --stat
            exit 1
          fi

      - name: Run tests
        run: node --test tests/
```

- [ ] **Step 2: Update CLAUDE.md development commands**

Add to the Development Commands section of `CLAUDE.md`:

```markdown
# Regenerate runtime files from source
node scripts/generate.js

# Preview what would change
node scripts/generate.js --dry-run

# Show unified diff of changes
node scripts/generate.js --diff

# Run generator tests
node --test tests/
```

Update the "When Editing" section to reference the new workflow:

```markdown
- Edit files in `src/`, not in root or `claude/` directly. Run `node scripts/generate.js` after changes. Commit both source and generated output together.
- The CI drift check will fail if generated output doesn't match source.
```

- [ ] **Step 3: Remove superseded drift check script**

```bash
git rm scripts/check-claude-lib-drift.sh
```

- [ ] **Step 4: Run all tests one final time**

```bash
node --test tests/
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/generator-check.yml CLAUDE.md
git commit -m "feat: add CI generator drift check, update docs, remove old drift script"
```

---

### Verification Checklist

After all tasks are complete, verify:

- [ ] `node scripts/generate.js` runs without errors
- [ ] `git diff --name-only` shows no changes after running the generator
- [ ] `node --test tests/` passes all tests
- [ ] `node scripts/generate.js --dry-run` shows all files as UNCHANGED
- [ ] `node scripts/generate.js --diff` shows no output
- [ ] Every file in `agents/`, `claude/agents/`, `skills/`, `claude/skills/`, `lib/`, `claude/lib/`, `scripts/`, `claude/scripts/`, `templates/`, `claude/templates/`, `references/`, `claude/references/`, `hooks/`, `claude/hooks/`, `mcp/`, `claude/mcp/`, and all runtime-only files are accounted for in the manifest
