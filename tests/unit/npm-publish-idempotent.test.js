'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { parseArgs, publishIfNeeded } = require('../../scripts/npm-publish-idempotent');
const { makeTempDir, writeJson } = require('../support/fs');

function withPackageRoot(version, fn) {
  const root = makeTempDir('maestro-publish-');
  writeJson(path.join(root, 'package.json'), { name: '@josstei/maestro', version });
  return fn(root);
}

function npmError(stderr) {
  const error = new Error('Command failed');
  error.stderr = Buffer.from(stderr);
  return error;
}

/**
 * A fake npm for publishIfNeeded's execFileSync option. It records every call,
 * answers through `respond(args)`, and fails the test on `npm dist-tag rm`:
 * the publish workflows must never remove the latest dist-tag.
 */
function fakeNpm(respond) {
  const calls = [];
  return {
    calls,
    execFileSync: (cmd, args) => {
      calls.push([cmd, args]);
      assert.ok(!(args[0] === 'dist-tag' && args[1] === 'rm'), `unexpected npm ${args.join(' ')}`);
      return respond(args);
    },
  };
}

function recordingLogger() {
  const logs = [];
  const warnings = [];
  return {
    logs,
    warnings,
    log: (message) => logs.push(message),
    warn: (message) => warnings.push(message),
  };
}

describe('idempotent npm publish', () => {
  it('skips publish when the exact version already exists', () => {
    withPackageRoot('1.2.3-rc.1', (root) => {
      const npm = fakeNpm((args) => (args[0] === 'dist-tag' ? 'rc: 1.2.3-rc.1\n' : '1.2.3-rc.1\n'));
      const result = publishIfNeeded({ root, logger: recordingLogger(), tag: 'rc', execFileSync: npm.execFileSync });

      assert.deepEqual(result, { packageSpec: '@josstei/maestro@1.2.3-rc.1', published: false });
      assert.deepEqual(npm.calls, [
        ['npm', ['view', '@josstei/maestro@1.2.3-rc.1', 'version']],
        ['npm', ['dist-tag', 'ls', '@josstei/maestro']],
      ]);
    });
  });

  it('publishes when npm reports the exact version missing', () => {
    withPackageRoot('1.2.3-preview.abcdef0', (root) => {
      const npm = fakeNpm((args) => {
        if (args[0] === 'view') {
          throw npmError('npm ERR! code E404\nnpm ERR! 404 Not Found');
        }
        return args[0] === 'dist-tag' ? 'preview: 1.2.3-preview.abcdef0\n' : '';
      });
      const result = publishIfNeeded({
        root,
        logger: recordingLogger(),
        tag: 'preview',
        access: 'public',
        execFileSync: npm.execFileSync,
      });

      assert.deepEqual(result, { packageSpec: '@josstei/maestro@1.2.3-preview.abcdef0', published: true });
      assert.deepEqual(npm.calls, [
        ['npm', ['view', '@josstei/maestro@1.2.3-preview.abcdef0', 'version']],
        ['npm', ['publish', '--tag', 'preview', '--access', 'public']],
        ['npm', ['dist-tag', 'ls', '@josstei/maestro']],
      ]);
    });
  });

  it('publishes stable versions with public access and no explicit tag, and ensures latest', () => {
    withPackageRoot('1.2.3', (root) => {
      const logger = recordingLogger();
      const npm = fakeNpm((args) => {
        if (args[0] === 'view') {
          throw npmError('npm ERR! code E404\nnpm ERR! 404 Not Found');
        }
        return args[0] === 'dist-tag' && args[1] === 'ls' ? 'latest: 1.2.2\n' : '';
      });
      const result = publishIfNeeded({ root, logger, execFileSync: npm.execFileSync });

      assert.deepEqual(result, { packageSpec: '@josstei/maestro@1.2.3', published: true });
      assert.deepEqual(npm.calls[1], ['npm', ['publish', '--access', 'public']]);
      assert.deepEqual(npm.calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.3', 'latest'],
      ]);
      assert.deepEqual(logger.logs, ['Moved npm latest dist-tag from 1.2.2 to stable 1.2.3.']);
    });
  });

  it('moves latest from a prerelease to stable when stable already exists', () => {
    withPackageRoot('1.2.3', (root) => {
      const logger = recordingLogger();
      const npm = fakeNpm((args) => {
        if (args[0] === 'view') {
          return '1.2.3\n';
        }
        return args[0] === 'dist-tag' && args[1] === 'ls' ? 'latest: 1.2.4-rc.1\nrc: 1.2.4-rc.1\n' : '';
      });
      const result = publishIfNeeded({ root, logger, execFileSync: npm.execFileSync });

      assert.deepEqual(result, { packageSpec: '@josstei/maestro@1.2.3', published: false });
      assert.deepEqual(npm.calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.3', 'latest'],
      ]);
      assert.deepEqual(logger.logs, ['Moved npm latest dist-tag from 1.2.4-rc.1 to stable 1.2.3.']);
    });
  });

  for (const [name, version, tag, pattern] of [
    [
      'rejects prerelease versions published without a prerelease tag',
      '1.2.3-rc.1',
      undefined,
      /Refusing to publish prerelease @josstei\/maestro@1\.2\.3-rc\.1 with the latest tag/,
    ],
    [
      'rejects prerelease versions published with latest',
      '1.2.3-rc.1',
      'latest',
      /Refusing to publish prerelease @josstei\/maestro@1\.2\.3-rc\.1 with the latest tag/,
    ],
    [
      'rejects stable versions published with prerelease tags',
      '1.2.3',
      'rc',
      /Refusing to publish stable @josstei\/maestro@1\.2\.3 with prerelease tag "rc"/,
    ],
  ]) {
    it(name, () => {
      withPackageRoot(version, (root) => {
        const npm = fakeNpm(() => '');
        assert.throws(() => publishIfNeeded({ root, tag, execFileSync: npm.execFileSync }), pattern);
        assert.deepEqual(npm.calls, []);
      });
    });
  }

  it('defers latest repair when it points to a prerelease and no stable exists', () => {
    withPackageRoot('1.2.3-rc.1', (root) => {
      const logger = recordingLogger();
      const npm = fakeNpm((args) => {
        if (args[0] === 'view' && args[1] === '@josstei/maestro@1.2.3-rc.1') {
          return '1.2.3-rc.1\n';
        }
        if (args[0] === 'dist-tag' && args[1] === 'ls') {
          return 'latest: 1.2.3-rc.1\nrc: 1.2.3-rc.1\n';
        }
        return args[0] === 'view' && args[1] === '@josstei/maestro' ? '["1.2.3-rc.1"]\n' : '';
      });
      publishIfNeeded({ root, logger, tag: 'rc', execFileSync: npm.execFileSync });

      assert.deepEqual(logger.warnings, [
        'Warning: latest points to prerelease 1.2.3-rc.1, but no stable versions are published; stable release must move latest.',
      ]);
      assert.equal(npm.calls.some(([, args]) => args[0] === 'dist-tag' && args[1] === 'add'), false);
    });
  });

  it('moves latest back to the highest stable version when a prerelease owns it', () => {
    withPackageRoot('2.0.0-rc.1', (root) => {
      const logger = recordingLogger();
      const npm = fakeNpm((args) => {
        if (args[0] === 'view' && args[1] === '@josstei/maestro@2.0.0-rc.1') {
          return '2.0.0-rc.1\n';
        }
        if (args[0] === 'dist-tag' && args[1] === 'ls') {
          return 'latest: 2.0.0-rc.1\nrc: 2.0.0-rc.1\n';
        }
        // Numeric, not lexical, order: 1.10.0 is newer than 1.2.9.
        return args[0] === 'view' && args[1] === '@josstei/maestro' ? '["1.2.9","1.10.0","2.0.0-rc.1"]\n' : '';
      });
      publishIfNeeded({ root, logger, tag: 'rc', execFileSync: npm.execFileSync });

      assert.deepEqual(npm.calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.10.0', 'latest'],
      ]);
      assert.deepEqual(logger.logs, ['Moved npm latest dist-tag from 2.0.0-rc.1 to stable 1.10.0.']);
    });
  });

  it('fails on npm errors other than a missing version', () => {
    withPackageRoot('1.2.3', (root) => {
      const npm = fakeNpm(() => {
        throw npmError('npm ERR! code E401\nnpm ERR! Incorrect or missing password');
      });

      assert.throws(() => publishIfNeeded({ root, execFileSync: npm.execFileSync }), /Command failed/);
      assert.deepEqual(npm.calls, [['npm', ['view', '@josstei/maestro@1.2.3', 'version']]]);
    });
  });

  it('parses optional tag and access arguments', () => {
    assert.deepEqual(parseArgs(['--tag', 'nightly', '--access', 'public']), {
      access: 'public',
      tag: 'nightly',
    });
  });

  it('rejects a flag without a value and an explicitly empty access', () => {
    assert.throws(() => parseArgs(['--tag']), { message: 'Missing value for --tag' });
    assert.throws(() => parseArgs(['--tag', 'rc', '--access']), { message: 'Missing value for --access' });
    assert.throws(() => parseArgs(['--access', '']), { message: 'Missing value for --access' });
  });
});
