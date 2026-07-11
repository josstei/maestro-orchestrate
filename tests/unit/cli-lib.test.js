import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { moduleDirname } from '../../dist/src/core/package-root.js';
import { resolvePackageRoot as resolveCorePackageRoot } from '../../dist/src/core/package-root.js';
import { readJson, resolvePackageRoot, runAsMain } from '../../dist/src/tooling/lib/cli.js';
import { STABLE_SEMVER_RE, isStable } from '../../dist/src/tooling/lib/semver.js';
import { pathToFileURL } from 'node:url';
const TEST_DIR = moduleDirname(import.meta.url);
const CLI_LIB_PATH = path.resolve(TEST_DIR, '../../dist/src/tooling/lib/cli.js');
const CLI_LIB_URL = pathToFileURL(CLI_LIB_PATH).href;

function writeTempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-lib-'));
  const filePath = path.join(dir, 'fixture.json');
  fs.writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

function runFixtureScript(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-lib-fixture-'));
  const fixturePath = path.join(dir, 'fixture.mjs');
  fs.writeFileSync(fixturePath, script, 'utf8');

  try {
    return execFileSync(process.execPath, [fixturePath], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('src/tooling/lib/cli readJson', () => {
  it('re-exports the core package-root resolver for tooling compatibility', () => {
    assert.equal(resolvePackageRoot, resolveCorePackageRoot);
  });

  it('parses a well-formed JSON file', () => {
    const { dir, filePath } = writeTempFile('{"name":"maestro","version":"1.2.3"}\n');

    try {
      assert.deepEqual(readJson(filePath), { name: 'maestro', version: '1.2.3' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a SyntaxError for malformed JSON', () => {
    const { dir, filePath } = writeTempFile('{not json');

    try {
      assert.throws(() => readJson(filePath), SyntaxError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when the file does not exist', () => {
    assert.throws(() => readJson('/nonexistent/path/does-not-exist.json'));
  });
});

describe('src/tooling/lib/semver isStable', () => {
  it('accepts stable semver strings', () => {
    assert.equal(isStable('1.2.3'), true);
    assert.equal(isStable('0.0.1'), true);
    assert.equal(isStable('10.20.30'), true);
  });

  it('rejects prerelease semver strings', () => {
    assert.equal(isStable('1.2.3-rc.1'), false);
    assert.equal(isStable('1.2.3-preview.abcdef0'), false);
    assert.equal(isStable('1.2.3-nightly.20260101'), false);
  });

  it('rejects garbage input', () => {
    assert.equal(isStable('not-a-version'), false);
    assert.equal(isStable('1.2'), false);
    assert.equal(isStable('1.2.3.4'), false);
    assert.equal(isStable(''), false);
  });

  it('exposes STABLE_SEMVER_RE consistent with isStable', () => {
    assert.equal(STABLE_SEMVER_RE.test('1.2.3'), true);
    assert.equal(STABLE_SEMVER_RE.test('1.2.3-rc.1'), false);
  });
});

describe('src/tooling/lib/cli runAsMain', () => {
  it('does not invoke fn when moduleUrl is not the main module', () => {
    let called = false;

    runAsMain('file:///not-the-main-module.js', 'demo', () => {
      called = true;
    });

    assert.equal(called, false);
  });

  it('invokes fn and reports success when moduleUrl is the main module', async () => {
    let called = false;

    runAsMain(pathToFileURL(process.argv[1]).href, 'demo', () => {
      called = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(called, true);
  });

  it('prints "<label> failed: <message>" and exits 1 when fn throws', () => {
    const script = [
      `import { runAsMain } from ${JSON.stringify(CLI_LIB_URL)};`,
      "runAsMain(import.meta.url, 'demo', () => { throw new Error('boom'); });",
    ].join('\n');

    assert.throws(
      () => runFixtureScript(script),
      (error) => {
        assert.equal(error.status, 1);
        assert.equal(error.stderr.toString('utf8').trim(), 'demo failed: boom');
        return true;
      }
    );
  });

  it('prints "<label> failed: <message>" and exits 1 when fn rejects', () => {
    const script = [
      `import { runAsMain } from ${JSON.stringify(CLI_LIB_URL)};`,
      "runAsMain(import.meta.url, 'demo', () => Promise.reject(new Error('async boom')));",
    ].join('\n');

    assert.throws(
      () => runFixtureScript(script),
      (error) => {
        assert.equal(error.status, 1);
        assert.equal(error.stderr.toString('utf8').trim(), 'demo failed: async boom');
        return true;
      }
    );
  });

  it('runs fn to completion without exiting when fn succeeds', () => {
    const script = [
      `import { runAsMain } from ${JSON.stringify(CLI_LIB_URL)};`,
      "runAsMain(import.meta.url, 'demo', () => { console.log('ran'); });",
    ].join('\n');

    const stdout = runFixtureScript(script);
    assert.equal(stdout.trim(), 'ran');
  });
});
