import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ValidationError } from '../../dist/src/lib/errors/index.js';
import { appendAgentMemory, readAgentMemory } from '../../dist/src/mcp/memory/agent-memory-store.js';
import { handleAppendAgentMemory, handleGetAgentMemory } from '../../dist/src/mcp/handlers/agent-memory.js';
const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-memory-'));
  tmpRoots.push(dir);
  return dir;
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('agent-memory store', () => {
  it('appends agent notes and reads them in order', () => {
    const workspace = makeWorkspace();

    appendAgentMemory(workspace, 'coder', 'Prefer focused source-first changes.');
    appendAgentMemory(workspace, 'coder', 'Run just ci before commit.');

    const memory = readAgentMemory(workspace, 'coder');
    assert.match(memory, /Prefer focused source-first changes\./);
    assert.match(memory, /Run just ci before commit\./);
    assert.ok(
      memory.indexOf('Prefer focused source-first changes.') <
        memory.indexOf('Run just ci before commit.')
    );
  });

  it('returns an empty string for unseen agent memory', () => {
    assert.equal(readAgentMemory(makeWorkspace(), 'coder'), '');
  });

  it('rejects traversal and nested agent ids for reads and appends', () => {
    const workspace = makeWorkspace();
    const invalidAgents = ['../evil', 'a/b', '.', '..'];

    for (const agent of invalidAgents) {
      assert.throws(() => readAgentMemory(workspace, agent), ValidationError);
      assert.throws(
        () => appendAgentMemory(workspace, agent, 'must not write'),
        ValidationError
      );
    }

    assert.equal(
      fs.existsSync(path.join(workspace, 'docs', 'maestro', 'knowledge', 'evil.md')),
      false
    );
  });
});

describe('agent-memory handlers', () => {
  it('round-trips append and get through handlers', () => {
    const workspace = makeWorkspace();

    assert.deepEqual(
      handleAppendAgentMemory(
        { agent: 'coder', note: 'Reuse focused stores for durable ledgers.' },
        workspace
      ),
      { agent: 'coder', appended: true }
    );
    assert.deepEqual(handleGetAgentMemory({ agent: 'coder' }, workspace), {
      agent: 'coder',
      memory: 'Reuse focused stores for durable ledgers.\n',
    });
  });

  it('rejects invalid handler input before touching storage', () => {
    const workspace = makeWorkspace();

    assert.throws(
      () => handleAppendAgentMemory({ agent: 'coder', note: '' }, workspace),
      ValidationError
    );
    assert.throws(
      () => handleGetAgentMemory({ agent: '../evil' }, workspace),
      ValidationError
    );
  });

  it('rejects a whitespace-only note consistently with the other memory handlers', () => {
    const workspace = makeWorkspace();

    assert.throws(
      () => handleAppendAgentMemory({ agent: 'coder', note: '   ' }, workspace),
      ValidationError
    );
  });
});
