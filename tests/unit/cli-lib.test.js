'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { readJson, runAsMain } = require('../../scripts/lib/cli');
const { STABLE_SEMVER_RE, isStable } = require('../../scripts/lib/semver');

const CLI_LIB_PATH = path.resolve(__dirname, '../../scripts/lib/cli.js');

function writeTempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-lib-'));
  const filePath = path.join(dir, 'fixture.json');
  fs.writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

function runFixtureScript(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cli-lib-fixture-'));
  const fixturePath = path.join(dir, 'fixture.js');
  fs.writeFileSync(fixturePath, script, 'utf8');

  try {
    return execFileSync(process.execPath, [fixturePath], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('scripts/lib/cli readJson', () => {
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

describe('scripts/lib/semver isStable', () => {
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

describe('scripts/lib/cli runAsMain', () => {
  it('does not invoke fn when currentModule is not require.main', () => {
    let called = false;

    runAsMain({}, 'demo', () => {
      called = true;
    });

    assert.equal(called, false);
  });

  it('invokes fn and reports success when currentModule is require.main', async () => {
    let called = false;

    runAsMain(require.main, 'demo', () => {
      called = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(called, true);
  });

  it('prints "<label> failed: <message>" and exits 1 when fn throws', () => {
    const script = [
      `const { runAsMain } = require(${JSON.stringify(CLI_LIB_PATH)});`,
      "runAsMain(module, 'demo', () => { throw new Error('boom'); });",
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
      `const { runAsMain } = require(${JSON.stringify(CLI_LIB_PATH)});`,
      "runAsMain(module, 'demo', () => Promise.reject(new Error('async boom')));",
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
      `const { runAsMain } = require(${JSON.stringify(CLI_LIB_PATH)});`,
      "runAsMain(module, 'demo', () => { console.log('ran'); });",
    ].join('\n');

    const stdout = runFixtureScript(script);
    assert.equal(stdout.trim(), 'ran');
  });
});
