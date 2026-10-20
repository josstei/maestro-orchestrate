'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveVersion } = require('../../src/core/version');
const { makeTempDir, writeJson } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

/** A copy of version.js (and the lib/io it needs) in a temp src/ tree with no package.json above it. */
function detachedResolveVersion(stampedVersion) {
  const srcDir = path.join(makeTempDir('maestro-version-'), 'src');
  for (const file of ['core/version.js', 'lib/io.js']) {
    fs.mkdirSync(path.join(srcDir, path.dirname(file)), { recursive: true });
    fs.copyFileSync(path.join(SRC_ROOT, file), path.join(srcDir, file));
  }
  if (stampedVersion) writeJson(path.join(srcDir, 'version.json'), { version: stampedVersion });
  return require(path.join(srcDir, 'core', 'version.js')).resolveVersion();
}

describe('resolveVersion', () => {
  it('resolves the version from the package.json above src/', () => {
    const pkg = require('../../package.json');
    assert.equal(resolveVersion(), pkg.version);
  });

  it('reads <src>/version.json when no package.json is found', () => {
    assert.equal(detachedResolveVersion('9.9.9'), '9.9.9');
  });

  it('returns unknown when neither package.json nor version.json is found', () => {
    assert.equal(detachedResolveVersion(null), 'unknown');
  });
});
