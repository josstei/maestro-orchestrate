'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  highestStableVersion,
  isNpmNotFoundError,
  parseArgs,
  parseDistTagOutput,
  publishIfNeeded,
} = require('../../scripts/npm-publish-idempotent');

function createPackageRoot(version = '1.2.3') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-publish-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: '@josstei/maestro', version }, null, 2)}\n`,
    'utf8'
  );
  return root;
}

function npmError(stderr) {
  const error = new Error('Command failed');
  error.stderr = Buffer.from(stderr);
  return error;
}

describe('idempotent npm publish', () => {
  it('skips publish when the exact version already exists', () => {
    const root = createPackageRoot('1.2.3-rc.1');
    const calls = [];

    try {
      const result = publishIfNeeded({
        root,
        tag: 'rc',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          if (args[0] === 'dist-tag') {
            return 'rc: 1.2.3-rc.1\n';
          }
          return '1.2.3-rc.1\n';
        },
      });

      assert.deepEqual(result, {
        packageSpec: '@josstei/maestro@1.2.3-rc.1',
        published: false,
      });
      assert.deepEqual(calls, [
        ['npm', ['view', '@josstei/maestro@1.2.3-rc.1', 'version']],
        ['npm', ['dist-tag', 'ls', '@josstei/maestro']],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes when npm reports the exact version missing', () => {
    const root = createPackageRoot('1.2.3-preview.abcdef0');
    const calls = [];

    try {
      const result = publishIfNeeded({
        root,
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

      assert.deepEqual(result, {
        packageSpec: '@josstei/maestro@1.2.3-preview.abcdef0',
        published: true,
      });
      assert.deepEqual(calls[1], ['npm', ['publish', '--tag', 'preview', '--access', 'public']]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes stable versions without an explicit tag and ensures latest', () => {
    const root = createPackageRoot('1.2.3');
    const calls = [];

    try {
      const result = publishIfNeeded({
        root,
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

      assert.deepEqual(result, {
        packageSpec: '@josstei/maestro@1.2.3',
        published: true,
      });
      assert.deepEqual(calls[1], ['npm', ['publish', '--access', 'public']]);
      assert.deepEqual(calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.3', 'latest'],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects prerelease versions published without a prerelease tag', () => {
    const root = createPackageRoot('1.2.3-rc.1');

    try {
      assert.throws(
        () => publishIfNeeded({ root, execFileSync: () => '' }),
        /Refusing to publish prerelease @josstei\/maestro@1\.2\.3-rc\.1 with the latest tag/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects prerelease versions published with latest', () => {
    const root = createPackageRoot('1.2.3-rc.1');

    try {
      assert.throws(
        () => publishIfNeeded({ root, tag: 'latest', execFileSync: () => '' }),
        /Refusing to publish prerelease @josstei\/maestro@1\.2\.3-rc\.1 with the latest tag/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects stable versions published with prerelease tags', () => {
    const root = createPackageRoot('1.2.3');

    try {
      assert.throws(
        () => publishIfNeeded({ root, tag: 'rc', execFileSync: () => '' }),
        /Refusing to publish stable @josstei\/maestro@1\.2\.3 with prerelease tag "rc"/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes latest when it points to a prerelease and no stable exists', () => {
    const root = createPackageRoot('1.2.3-rc.1');
    const calls = [];

    try {
      publishIfNeeded({
        root,
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

      assert.deepEqual(calls.at(-1), ['npm', ['dist-tag', 'rm', '@josstei/maestro', 'latest']]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('moves latest back to the highest stable version when a prerelease owns it', () => {
    const root = createPackageRoot('1.3.0-rc.1');
    const calls = [];

    try {
      publishIfNeeded({
        root,
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

      assert.deepEqual(calls.at(-1), [
        'npm',
        ['dist-tag', 'add', '@josstei/maestro@1.2.0', 'latest'],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on npm errors other than a missing version', () => {
    const root = createPackageRoot();

    try {
      assert.throws(
        () => publishIfNeeded({
          root,
          execFileSync: () => {
            throw npmError('npm ERR! code E401\nnpm ERR! Incorrect or missing password');
          },
        }),
        /Command failed/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses optional tag and access arguments', () => {
    assert.deepEqual(parseArgs(['--tag', 'nightly', '--access', 'public']), {
      access: 'public',
      tag: 'nightly',
    });
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
});
