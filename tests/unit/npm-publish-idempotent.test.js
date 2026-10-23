'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  highestStableVersion,
  isNpmNotFoundError,
  parseArgs,
  parseDistTagOutput,
  publishIfNeeded,
} = require('../../scripts/npm-publish-idempotent');
const { makeTempDir, writeJson } = require('../support/fs');
const { ROOT } = require('../support/paths');

const SILENT_LOGGER = { log() {}, warn() {} };

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

describe('idempotent npm publish', () => {
  it('skips publish when the exact version already exists', () => {
    withPackageRoot('1.2.3-rc.1', (root) => {
      const calls = [];
      const result = publishIfNeeded({
        root,
        logger: SILENT_LOGGER,
        tag: 'rc',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'dist-tag') {
            return 'rc: 1.2.3-rc.1\n';
          }
          return '1.2.3-rc.1\n';
        },
      });

      assert.equal(result.packageSpec, '@josstei/maestro@1.2.3-rc.1');
      assert.equal(result.published, false);
      assert.equal(result.latestPolicy.status, 'ok');
      assert.deepEqual(calls, [
        ['npm', ['view', '@josstei/maestro@1.2.3-rc.1', 'version']],
        ['npm', ['dist-tag', 'ls', '@josstei/maestro']],
      ]);
    });
  });

  it('publishes when npm reports the exact version missing', () => {
    withPackageRoot('1.2.3-preview.abcdef0', (root) => {
      const calls = [];
      const result = publishIfNeeded({
        root,
        logger: SILENT_LOGGER,
        tag: 'preview',
        access: 'public',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'view') {
            throw npmError('npm ERR! code E404\nnpm ERR! 404 Not Found');
          }
          if (args[0] === 'dist-tag') {
            return 'preview: 1.2.3-preview.abcdef0\n';
          }
          return '';
        },
      });

      assert.equal(result.packageSpec, '@josstei/maestro@1.2.3-preview.abcdef0');
      assert.equal(result.published, true);
      assert.equal(result.latestPolicy.status, 'ok');
      assert.deepEqual(calls[1], ['npm', ['publish', '--tag', 'preview', '--access', 'public']]);
    });
  });

  it('publishes stable versions without an explicit tag and ensures latest', () => {
    withPackageRoot('1.2.3', (root) => {
      const calls = [];
      const result = publishIfNeeded({
        root,
        logger: SILENT_LOGGER,
        access: 'public',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'view') {
            throw npmError('npm ERR! code E404\nnpm ERR! 404 Not Found');
          }
          if (args[0] === 'dist-tag' && args[1] === 'ls') {
            return 'latest: 1.2.2\n';
          }
          return '';
        },
      });

      assert.equal(result.packageSpec, '@josstei/maestro@1.2.3');
      assert.equal(result.published, true);
      assert.equal(result.latestPolicy.status, 'moved');
      assert.equal(result.latestPolicy.latest, '1.2.2');
      assert.equal(result.latestPolicy.target, '1.2.3');
      assert.deepEqual(calls[1], ['npm', ['publish', '--access', 'public']]);
      assert.deepEqual(calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.3', 'latest'],
      ]);
    });
  });

  it('moves latest from a prerelease to stable when stable already exists', () => {
    withPackageRoot('1.2.3', (root) => {
      const calls = [];
      const result = publishIfNeeded({
        root,
        logger: SILENT_LOGGER,
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'view') {
            return '1.2.3\n';
          }
          if (args[0] === 'dist-tag' && args[1] === 'ls') {
            return 'latest: 1.2.4-rc.1\nrc: 1.2.4-rc.1\n';
          }
          return '';
        },
      });

      assert.equal(result.packageSpec, '@josstei/maestro@1.2.3');
      assert.equal(result.published, false);
      assert.equal(result.latestPolicy.status, 'moved');
      assert.equal(result.latestPolicy.latest, '1.2.4-rc.1');
      assert.equal(result.latestPolicy.target, '1.2.3');
      assert.deepEqual(calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.3', 'latest'],
      ]);
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
        assert.throws(() => publishIfNeeded({ root, tag, execFileSync: () => '' }), pattern);
      });
    });
  }

  it('defers latest repair when it points to a prerelease and no stable exists', () => {
    withPackageRoot('1.2.3-rc.1', (root) => {
      const calls = [];
      const warnings = [];
      const result = publishIfNeeded({
        root,
        logger: { log: () => {}, warn: (message) => warnings.push(message) },
        tag: 'rc',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'view' && args[1] === '@josstei/maestro@1.2.3-rc.1') {
            return '1.2.3-rc.1\n';
          }
          if (args[0] === 'dist-tag' && args[1] === 'ls') {
            return 'latest: 1.2.3-rc.1\nrc: 1.2.3-rc.1\n';
          }
          if (args[0] === 'view' && args[1] === '@josstei/maestro') {
            return '["1.2.3-rc.1"]\n';
          }
          return '';
        },
      });

      assert.equal(result.latestPolicy.status, 'deferred');
      assert.equal(result.latestPolicy.latest, '1.2.3-rc.1');
      assert.equal(result.latestPolicy.target, null);
      assert.match(result.latestPolicy.reason, /no stable versions are published/);
      assert.match(warnings[0], /stable release must move latest/);
      assert.equal(
        calls.some(([, args]) => args[0] === 'dist-tag' && args[1] === 'rm'),
        false
      );
    });
  });

  it('moves latest back to the highest stable version when a prerelease owns it', () => {
    withPackageRoot('1.3.0-rc.1', (root) => {
      const calls = [];
      const result = publishIfNeeded({
        root,
        logger: SILENT_LOGGER,
        tag: 'rc',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'view' && args[1] === '@josstei/maestro@1.3.0-rc.1') {
            return '1.3.0-rc.1\n';
          }
          if (args[0] === 'dist-tag' && args[1] === 'ls') {
            return 'latest: 1.3.0-rc.1\nrc: 1.3.0-rc.1\n';
          }
          if (args[0] === 'view' && args[1] === '@josstei/maestro') {
            return '["1.1.9","1.2.0","1.3.0-rc.1"]\n';
          }
          return '';
        },
      });

      assert.equal(result.latestPolicy.status, 'moved');
      assert.equal(result.latestPolicy.latest, '1.3.0-rc.1');
      assert.equal(result.latestPolicy.target, '1.2.0');
      assert.deepEqual(calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.0', 'latest'],
      ]);
    });
  });

  it('fails on npm errors other than a missing version', () => {
    withPackageRoot('1.2.3', (root) => {
      assert.throws(
        () => publishIfNeeded({
          root,
          execFileSync: () => {
            throw npmError('npm ERR! code E401\nnpm ERR! Incorrect or missing password');
          },
        }),
        /Command failed/
      );
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

  it('detects npm not-found errors', () => {
    assert.equal(isNpmNotFoundError(npmError('npm ERR! code E404')), true);
    assert.equal(isNpmNotFoundError(npmError('npm ERR! code E401')), false);
  });

  it('parses dist-tag output and picks the highest stable version', () => {
    assert.deepEqual(parseDistTagOutput('latest: 1.2.3\nrc: 1.3.0-rc.1\n'), {
      latest: '1.2.3',
      rc: '1.3.0-rc.1',
    });
    assert.equal(highestStableVersion(['1.2.9', '1.10.0', '2.0.0-rc.1']), '1.10.0');
  });

  it('selects stable releases without mutating registry order and preserves equivalent-version ties', () => {
    const versions = Object.freeze(['2.0.0', '1.99.99', '02.0.0', '9.0.0-preview.1']);
    assert.equal(highestStableVersion(versions), '02.0.0');
    assert.equal(highestStableVersion([]), null);
    assert.equal(highestStableVersion(['1.0.0-rc.1', 'invalid']), null);
  });

  it('does not remove latest through npm dist-tag policy', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'scripts', 'npm-publish-idempotent.js'),
      'utf8'
    );

    assert.doesNotMatch(source, /dist-tag['"],\s*['"]rm/);
    assert.doesNotMatch(source, /dist-tag rm/);
  });
});
