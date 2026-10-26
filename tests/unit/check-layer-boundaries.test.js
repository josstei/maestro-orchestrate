'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');
const { runNode } = require('../support/process');

const SCRIPT = 'scripts/check-layer-boundaries.js';

/**
 * Build a scratch repo that mirrors the expected layout so the script's
 * hardcoded source root resolves onto
 * a directory we control.
 */
function makeFixtureRepo() {
  const root = makeTempDir('maestro-lint-');
  fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
  for (const file of [SCRIPT, 'src/generator/build-only.js', 'src/generator/dependency-graph.js']) {
    writeTree(root, file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
  return root;
}

function runScript(root) {
  return runNode(path.join(root, SCRIPT), [], {
    cwd: root,
    env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
  });
}

describe('check-layer-boundaries (real repo smoke test)', () => {
  it('passes against the real src/lib tree', () => {
    const result = runScript(ROOT);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Layer boundaries clean: \d+ files scanned, 0 violations\./);
  });
});

describe('check-layer-boundaries (fixture cases)', () => {
  it('does not report success when the required lib root is missing', () => {
    const root = makeFixtureRepo();
    fs.rmdirSync(path.join(root, 'src', 'lib'));
    const result = runScript(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/);
  });

  // Each case writes `files` (repo-relative) into a fresh fixture repo and expects
  // the exit `status`; `matches` must match, and `omits` must not appear in, stdout
  // on success and stderr on failure.
  for (const [name, files, status, matches = [], omits = []] of [
    ['exits 0 and reports the analyzer only for an empty lib directory', {}, 0, [/2 files scanned, 0 violations/]],
    ['allows relative imports that stay inside src/lib', {
      'src/lib/index.js': "const x = require('./helper');\nmodule.exports = x;\n",
      'src/lib/helper.js': 'module.exports = 1;\n',
    }, 0, [/4 files scanned, 0 violations/]],
    ['allows node: built-in imports', {
      'src/lib/fs-user.js': "const fs = require('node:fs');\nmodule.exports = fs;\n",
    }, 0],
    ['flags relative imports that escape the lib boundary', {
      'src/core/logger.js': '',
      'src/lib/leaky.js': "const x = require('../core/logger');\n",
    }, 1, [/Layer boundary violations/, /leaky\.js/, /'\.\.\/core\/logger'/]],
    ['flags relative imports into a sibling directory that shares the lib prefix', {
      'src/lib-extra/x.js': '',
      'src/lib/sneaky.js': "const x = require('../lib-extra/x');\n",
    }, 1, [/sneaky\.js: require\('\.\.\/lib-extra\/x'\)/]],
    ['allows relative imports that resolve to the lib directory itself', {
      'src/lib/index.js': 'module.exports = 1;\n',
      'src/lib/nested/user.js': "const lib = require('..');\nmodule.exports = lib;\n",
    }, 0, [/4 files scanned, 0 violations/]],
    ['flags non-relative, non-node imports as violations', {
      'src/lib/depender.js': "const lodash = require('lodash');\n",
    }, 1, [/non-relative, non-node import/, /'lodash'/]],
    ['recurses into nested lib subdirectories', {
      'src/lib/a/b/c/deep.js': "const x = require('lodash');\n",
    }, 1, [/deep\.js/]],
    ['reports multiple violations across several files', {
      'src/lib/one.js': "require('lodash');\n",
      'src/core/x.js': '',
      'src/lib/two.js': "require('../core/x');\n",
      'src/lib/three.js': "require('./three-helper');\n",
      'src/lib/three-helper.js': 'module.exports = 1;\n',
    }, 1, [/one\.js/, /two\.js/], ['three.js:']],
    ['ignores non-.js files in lib', {
      'src/lib/README.md': "require('lodash')\n",
      'src/lib/ok.js': "require('./other');\n",
      'src/lib/other.js': 'module.exports = 1;\n',
    }, 0, [/4 files scanned, 0 violations/]],
    ['allows lower layers to depend on their declared shared layers', {
      'src/core/agent-registry.js': "require('../lib/naming');\nrequire('../generated/agent-registry.json');",
      'src/config/setting-resolver.js': "require('../core/env-file-parser');",
      'src/state/design-gate.js': "require('../lib/io');\nrequire('../core/markdown-state');\n" +
        "require('../config/setting-resolver');\nrequire('./session-state');",
      'src/hooks/logic/before-agent-logic.js': "require('../../state/session-state');\n" +
        "require('../../core/logger');\nrequire('./hook-state');",
      ...Object.fromEntries(['lib/naming', 'lib/io', 'core/env-file-parser', 'core/markdown-state', 'core/logger',
        'state/session-state', 'hooks/logic/hook-state'].map((file) => [`src/${file}.js`, ''])),
      'src/generated/agent-registry.json': '[]',
    }, 0, [/13 files scanned, 0 violations/]],
  ]) {
    it(name, () => {
      const root = makeFixtureRepo();
      for (const [file, content] of Object.entries(files)) writeTree(root, file, content);
      const result = runScript(root);
      assert.equal(result.status, status, result.stderr);
      const output = status === 0 ? result.stdout : result.stderr;
      for (const pattern of matches) assert.match(output, pattern);
      for (const text of omits) assert.ok(!output.includes(text), `${text} should be clean`);
    });
  }

  it('rejects reverse dependencies into handlers, host adapters and generation', () => {
    const root = makeFixtureRepo();
    for (const [file, dependency] of Object.entries({
      'core/leaky.js': '../config/setting-resolver',
      'config/leaky.js': '../state/session-state',
      'state/leaky.js': '../mcp/handlers/design-gate',
      'hooks/logic/leaky.js': '../../platforms/claude/hook-adapter',
      'state/build.js': '../generator/file-writer',
      'state/prefix.js': '../state-extra/store',
    })) {
      writeTree(path.join(root, 'src'), file, `require('${dependency}');\n`);
      writeTree(root, path.relative(root, path.resolve(root, 'src', path.dirname(file), dependency)) + '.js');
    }
    const result = runScript(root);
    assert.equal(result.status, 1);
    assert.equal((result.stderr.match(/ — resolves to /g) || []).length, 6);
  });
});
