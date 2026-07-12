import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { withEnv, withEnvSync } from '../support/environment.js';
import { makeTempDir, writeFixtureFile } from '../support/filesystem.js';
import { connectInMemory } from '../support/mcp.js';
import { REPO_ROOT, repoPath, resolveFrom } from '../support/paths.js';

describe('test support', () => {
  describe('withEnv', () => {
    it('restores supplied keys after a synchronous return', async () => {
      const replacedKey = 'MAESTRO_TEST_SUPPORT_REPLACED';
      const deletedKey = 'MAESTRO_TEST_SUPPORT_DELETED';
      process.env[replacedKey] = 'before';
      process.env[deletedKey] = 'also-before';

      const result = await withEnv({ [replacedKey]: 'during', [deletedKey]: null }, () => {
        assert.equal(process.env[replacedKey], 'during');
        assert.equal(process.env[deletedKey], undefined);
        return 'result';
      });

      assert.equal(result, 'result');
      assert.equal(process.env[replacedKey], 'before');
      assert.equal(process.env[deletedKey], 'also-before');
      delete process.env[replacedKey];
      delete process.env[deletedKey];
    });

    it('restores supplied keys after a synchronous throw', async () => {
      const key = 'MAESTRO_TEST_SUPPORT_SYNC_THROW';
      process.env[key] = 'before';

      await assert.rejects(
        withEnv({ [key]: 'during' }, () => {
          throw new Error('sync failure');
        }),
        /sync failure/
      );

      assert.equal(process.env[key], 'before');
      delete process.env[key];
    });

    it('withEnvSync restores supplied keys after a throw', () => {
      const key = 'MAESTRO_TEST_SUPPORT_SYNC_WRAPPER_THROW';
      process.env[key] = 'before';

      assert.throws(
        () => withEnvSync({ [key]: 'during' }, () => {
          assert.equal(process.env[key], 'during');
          throw new Error('sync wrapper failure');
        }),
        /sync wrapper failure/
      );

      assert.equal(process.env[key], 'before');
      delete process.env[key];
    });

    it('restores supplied keys after asynchronous resolve and reject', async () => {
      const resolvedKey = 'MAESTRO_TEST_SUPPORT_ASYNC_RESOLVE';
      const rejectedKey = 'MAESTRO_TEST_SUPPORT_ASYNC_REJECT';
      delete process.env[resolvedKey];
      process.env[rejectedKey] = 'before';

      await withEnv({ [resolvedKey]: 'during' }, async () => {
        await Promise.resolve();
        assert.equal(process.env[resolvedKey], 'during');
      });
      assert.equal(process.env[resolvedKey], undefined);

      await assert.rejects(
        withEnv({ [rejectedKey]: undefined }, async () => {
          await Promise.resolve();
          assert.equal(process.env[rejectedKey], undefined);
          throw new Error('async failure');
        }),
        /async failure/
      );
      assert.equal(process.env[rejectedKey], 'before');
      delete process.env[rejectedKey];
    });
  });

  it('creates nested fixture files and registers recursive cleanup', async () => {
    let cleanup;
    const root = makeTempDir({
      after(callback) {
        cleanup = callback;
      },
    }, 'maestro-test-support-');
    const fixturePath = writeFixtureFile(root, 'nested/fixture.txt', 'fixture body');

    assert.equal(fixturePath, path.join(root, 'nested', 'fixture.txt'));
    assert.equal(fs.readFileSync(fixturePath, 'utf8'), 'fixture body');
    assert.equal(typeof cleanup, 'function');

    await cleanup();
    assert.equal(fs.existsSync(root), false);
  });

  it('resolves repository and module-relative paths without import.meta.dirname', () => {
    assert.equal(repoPath('package.json'), path.join(REPO_ROOT, 'package.json'));
    assert.equal(fs.existsSync(repoPath('package.json')), true);
    assert.equal(
      resolveFrom(import.meta.url, '..'),
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    );
  });

  it('connects an in-memory client and registers connection cleanup', async () => {
    const events = [];
    const cleanupCallbacks = [];
    const testContext = {
      after(callback) {
        cleanupCallbacks.push(callback);
      },
    };
    const server = {
      async connect(transport) {
        assert.ok(transport);
        events.push('server-connect');
      },
      async close() {
        events.push('server-close');
      },
    };
    const client = {
      async connect(transport) {
        assert.ok(transport);
        events.push('client-connect');
      },
      async close() {
        events.push('client-close');
      },
    };

    const connectedClient = await connectInMemory(testContext, server, { client });

    assert.equal(connectedClient, client);
    assert.deepEqual(events, ['server-connect', 'client-connect']);
    assert.equal(cleanupCallbacks.length, 1);

    await cleanupCallbacks[0]();
    assert.deepEqual(events, [
      'server-connect',
      'client-connect',
      'client-close',
      'server-close',
    ]);
  });

  it('immediately closes both sides when either in-memory connection rejects', async () => {
    for (const failingSide of ['server', 'client']) {
      const events = [];
      const cleanupCallbacks = [];
      const testContext = {
        after(callback) {
          cleanupCallbacks.push(callback);
        },
      };
      const server = {
        async connect() {
          events.push('server-connect');
          if (failingSide === 'server') throw new Error('server connect failure');
          await new Promise((resolve) => setImmediate(resolve));
          events.push('server-connected');
        },
        async close() {
          events.push('server-close');
        },
      };
      const client = {
        async connect() {
          events.push('client-connect');
          if (failingSide === 'client') throw new Error('client connect failure');
          await new Promise((resolve) => setImmediate(resolve));
          events.push('client-connected');
        },
        async close() {
          events.push('client-close');
        },
      };

      await assert.rejects(
        connectInMemory(testContext, server, { client }),
        new RegExp(`${failingSide} connect failure`)
      );
      assert.equal(cleanupCallbacks.length, 0);
      const siblingConnected = failingSide === 'server' ? 'client-connected' : 'server-connected';
      assert.ok(events.indexOf(siblingConnected) < events.indexOf('client-close'));
      assert.deepEqual(events.slice(-2), ['client-close', 'server-close']);
    }
  });
});
