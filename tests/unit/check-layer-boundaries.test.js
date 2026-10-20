'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { findLayerViolations } = require('../../scripts/check-layer-boundaries');
const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

/**
 * Creates an empty lib directory named `lib`, so a sibling such as `lib-extra`
 * shares its path prefix, and writes `files` ({ relPath: contents }) into it.
 */
function makeLibDir(files = {}) {
  const libDir = path.join(makeTempDir('maestro-lint-'), 'lib');
  fs.mkdirSync(libDir);
  for (const [relPath, contents] of Object.entries(files)) {
    writeTree(libDir, relPath, contents);
  }
  return libDir;
}

const fromCwd = (filePath) => path.relative(process.cwd(), filePath);

const SCRIPT = path.join(ROOT, 'scripts', 'check-layer-boundaries.js');

function runCheck(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'check-layer-boundaries.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

describe('check-layer-boundaries CLI', () => {
  it('passes against the real src/lib tree', () => {
    const result = runCheck(ROOT);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /Layer boundaries clean: \d+ files scanned, 0 violations\./);
  });

  it('lists every violation on stderr and exits 1', () => {
    // The CLI checks the src/lib beside its own scripts/ dir, so run a copy inside a fixture repo.
    const root = makeTempDir('maestro-lint-');
    writeTree(root, 'scripts/check-layer-boundaries.js', fs.readFileSync(SCRIPT, 'utf8'));
    writeTree(root, 'src/lib/leaky.js', "require('lodash');\nrequire('../core/x');\n");
    const leaky = path.join('src', 'lib', 'leaky.js');

    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, [
      'Layer boundary violations in src/lib/:',
      `  ${leaky}: require('lodash') — non-relative, non-node import`,
      `  ${leaky}: require('../core/x') — resolves to ${path.join('src', 'core', 'x')}`,
      '',
    ].join('\n'));
  });
});

describe('findLayerViolations', () => {
  it('scans no files in an empty lib directory', () => {
    assert.deepEqual(findLayerViolations(makeLibDir()), { files: [], violations: [] });
  });

  it('allows relative imports that stay inside the lib directory', () => {
    const { files, violations } = findLayerViolations(makeLibDir({
      'index.js': "const x = require('./helper');\nmodule.exports = x;\n",
      'helper.js': 'module.exports = 1;\n',
    }));
    assert.equal(files.length, 2);
    assert.deepEqual(violations, []);
  });

  it('allows node: built-in imports', () => {
    const { violations } = findLayerViolations(makeLibDir({
      'fs-user.js': "const fs = require('node:fs');\nmodule.exports = fs;\n",
    }));
    assert.deepEqual(violations, []);
  });

  it('flags relative imports that escape the lib boundary', () => {
    const libDir = makeLibDir({ 'leaky.js': "const x = require('../core/logger');\n" });

    assert.deepEqual(findLayerViolations(libDir).violations, [
      `${fromCwd(path.join(libDir, 'leaky.js'))}: require('../core/logger') — resolves to ${fromCwd(path.join(libDir, '..', 'core', 'logger'))}`,
    ]);
  });

  it('flags relative imports into a sibling directory that shares the lib prefix', () => {
    const libDir = makeLibDir({ 'sneaky.js': "const x = require('../lib-extra/x');\n" });

    assert.deepEqual(findLayerViolations(libDir).violations, [
      `${fromCwd(path.join(libDir, 'sneaky.js'))}: require('../lib-extra/x') — resolves to ${fromCwd(path.join(libDir, '..', 'lib-extra', 'x'))}`,
    ]);
  });

  it('allows relative imports that resolve to the lib directory itself', () => {
    const { files, violations } = findLayerViolations(makeLibDir({
      'index.js': 'module.exports = 1;\n',
      'nested/user.js': "const lib = require('..');\nmodule.exports = lib;\n",
    }));
    assert.equal(files.length, 2);
    assert.deepEqual(violations, []);
  });

  it('flags non-relative, non-node imports, including in nested directories', () => {
    const libDir = makeLibDir({ 'a/b/c/deep.js': "const lodash = require('lodash');\n" });

    assert.deepEqual(findLayerViolations(libDir).violations, [
      `${fromCwd(path.join(libDir, 'a', 'b', 'c', 'deep.js'))}: require('lodash') — non-relative, non-node import`,
    ]);
  });

  it('reports every violation across several files', () => {
    const { violations } = findLayerViolations(makeLibDir({
      'one.js': "require('lodash');\n",
      'two.js': "require('../core/x');\n",
      'three.js': "require('./three-helper');\n",
      'three-helper.js': 'module.exports = 1;\n',
    }));

    assert.equal(violations.length, 2);
    assert.ok(violations.some((violation) => violation.includes("one.js: require('lodash')")));
    assert.ok(violations.some((violation) => violation.includes("two.js: require('../core/x')")));
  });

  it('ignores non-.js files', () => {
    const { files, violations } = findLayerViolations(makeLibDir({
      'README.md': "require('lodash')\n",
      'ok.js': "require('./other');\n",
      'other.js': 'module.exports = 1;\n',
    }));
    assert.equal(files.length, 2);
    assert.deepEqual(violations, []);
  });
});
