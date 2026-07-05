import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expandEntryPoints, expandCoreCommands } from '../../src/generator/entry-point-expander.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');
const SRC = path.join(ROOT, 'src');

function assertByteIdentical(outputs) {
  for (const { outputPath, content } of outputs) {
    const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
    assert.equal(content, committed, outputPath);
  }
}

describe('entry-point-expander reproduces committed command surfaces byte-for-byte', () => {
  for (const runtime of ['gemini', 'claude', 'codex']) {
    it(`${runtime} entry points`, async () => {
      const outputs = await expandEntryPoints(runtime, SRC);
      assert.ok(outputs.length > 0, `${runtime} should emit entry points`);
      assertByteIdentical(outputs);
    });
    it(`${runtime} core commands`, async () => {
      const outputs = await expandCoreCommands(runtime, SRC);
      assert.ok(outputs.length > 0, `${runtime} should emit core commands`);
      assertByteIdentical(outputs);
    });
  }

  it('qwen emits no command surface', async () => {
    assert.deepEqual(await expandEntryPoints('qwen', SRC), []);
    assert.deepEqual(await expandCoreCommands('qwen', SRC), []);
  });

  it('an unknown runtime raises the registry error', async () => {
    await assert.rejects(expandEntryPoints('definitely-not-a-runtime', SRC), /Unknown runtime "definitely-not-a-runtime"/);
    await assert.rejects(expandCoreCommands('definitely-not-a-runtime', SRC), /Unknown runtime "definitely-not-a-runtime"/);
  });
});
