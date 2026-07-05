import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ValidationError } from '../../src/lib/errors/index.js';
import { MemoryStore } from '../../src/mcp/memory/memory-store.js';
import { handleAppendAgentMemory, handleGetAgentMemory } from '../../src/mcp/handlers/agent-memory.js';
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

describe('MemoryStore agent-memory ledger', () => {
  it('appends agent notes and reads them in order', () => {
    const store = new MemoryStore(makeWorkspace());

    store.appendAgentMemory('coder', 'Prefer focused source-first changes.');
    store.appendAgentMemory('coder', 'Run just ci before commit.');

    const memory = store.readAgentMemory('coder');
    assert.match(memory, /Prefer focused source-first changes\./);
    assert.match(memory, /Run just ci before commit\./);
    assert.ok(
      memory.indexOf('Prefer focused source-first changes.') <
        memory.indexOf('Run just ci before commit.')
    );
  });

  it('returns an empty string for unseen agent memory', () => {
    const store = new MemoryStore(makeWorkspace());

    assert.equal(store.readAgentMemory('coder'), '');
  });

  it('rejects traversal and nested agent ids for reads and appends', () => {
    const workspace = makeWorkspace();
    const store = new MemoryStore(workspace);
    const invalidAgents = ['../evil', 'a/b'];

    for (const agent of invalidAgents) {
      assert.throws(() => store.readAgentMemory(agent), ValidationError);
      assert.throws(
        () => store.appendAgentMemory(agent, 'must not write'),
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
        { agent: 'coder', note: 'Reuse MemoryStore for durable ledgers.' },
        workspace
      ),
      { agent: 'coder', appended: true }
    );
    assert.deepEqual(handleGetAgentMemory({ agent: 'coder' }, workspace), {
      agent: 'coder',
      memory: 'Reuse MemoryStore for durable ledgers.\n',
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
});
