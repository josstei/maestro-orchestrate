'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isNpmNotFoundError,
  parseArgs,
  publishIfNeeded,
} = require('../../scripts/npm-publish-idempotent');

function createPackageRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-publish-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: '@josstei/maestro', version: '1.2.3' }, null, 2)}\n`,
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
    const root = createPackageRoot();
    const calls = [];

    try {
      const result = publishIfNeeded({
        root,
        tag: 'rc',
        execFileSync: (cmd, args) => {
          calls.push([cmd, args]);
          return '1.2.3\n';
        },
      });

      assert.deepEqual(result, {
        packageSpec: '@josstei/maestro@1.2.3',
        published: false,
      });
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], ['npm', ['view', '@josstei/maestro@1.2.3', 'version']]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes when npm reports the exact version missing', () => {
    const root = createPackageRoot();
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
          return '';
        },
      });

      assert.deepEqual(result, {
        packageSpec: '@josstei/maestro@1.2.3',
        published: true,
      });
      assert.deepEqual(calls[1], ['npm', ['publish', '--tag', 'preview', '--access', 'public']]);
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
});
