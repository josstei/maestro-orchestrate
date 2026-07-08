import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../../dist/src/mcp/memory/memory-store.js';
import { recordArchitectureMemory, handleQueryArchitectureMemory } from '../../dist/src/mcp/handlers/architecture-memory.js';
const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-arch-memory-'));
  tmpRoots.push(dir);
  return dir;
}

function emptyGraph() {
  return {
    schema_version: 1,
    interfaces: [],
    patterns: [],
    integration_points: [],
    assumptions: [],
    warnings: [],
  };
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('MemoryStore architecture-memory graph', () => {
  it('returns an empty graph when no architecture memory exists', () => {
    const store = new MemoryStore(makeWorkspace());
    assert.deepEqual(store.readArchitectureMemory(), emptyGraph());
  });

  it('round-trips the structured architecture-memory object', () => {
    const workspace = makeWorkspace();
    const store = new MemoryStore(workspace);
    const graph = {
      ...emptyGraph(),
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      warnings: [{ value: 'ttl assumed', session_id: 'session-1' }],
    };

    store.writeArchitectureMemory(graph);

    assert.deepEqual(store.readArchitectureMemory(), graph);
    const raw = fs.readFileSync(
      path.join(workspace, 'docs', 'maestro', 'knowledge', 'architecture-memory.json'),
      'utf8'
    );
    assert.deepEqual(JSON.parse(raw), graph);
  });
});

describe('recordArchitectureMemory', () => {
  it('folds downstream context into provenance entries and de-dupes by value', () => {
    const workspace = makeWorkspace();
    const state = {
      session_id: 'session-1',
      phases: [
        {
          downstream_context: {
            key_interfaces_introduced: ['refreshToken()', 'refreshToken()'],
            warnings: ['ttl assumed'],
          },
        },
        {
          downstream_context: {
            key_interfaces_introduced: ['refreshToken()'],
            patterns_established: ['MemoryStore facade'],
            integration_points: ['handleArchiveSession'],
            assumptions: ['state_dir exists'],
            warnings: ['ttl assumed'],
          },
        },
      ],
    };

    recordArchitectureMemory(state, workspace);
    recordArchitectureMemory(state, workspace);

    assert.deepEqual(new MemoryStore(workspace).readArchitectureMemory(), {
      schema_version: 1,
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      patterns: [{ value: 'MemoryStore facade', session_id: 'session-1' }],
      integration_points: [{ value: 'handleArchiveSession', session_id: 'session-1' }],
      assumptions: [{ value: 'state_dir exists', session_id: 'session-1' }],
      warnings: [{ value: 'ttl assumed', session_id: 'session-1' }],
    });
  });
});

describe('handleQueryArchitectureMemory', () => {
  it('filters entries by case-insensitive substring and returns the full graph without a query', () => {
    const workspace = makeWorkspace();
    const graph = {
      schema_version: 1,
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      patterns: [{ value: 'MemoryStore facade', session_id: 'session-1' }],
      integration_points: [{ value: 'Token vault integration', session_id: 'session-1' }],
      assumptions: [{ value: 'Cache TTL exists', session_id: 'session-1' }],
      warnings: [{ value: 'ttl assumed', session_id: 'session-1' }],
    };
    new MemoryStore(workspace).writeArchitectureMemory(graph);

    assert.deepEqual(handleQueryArchitectureMemory({ query: 'token' }, workspace), {
      query: 'token',
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      patterns: [],
      integration_points: [{ value: 'Token vault integration', session_id: 'session-1' }],
      assumptions: [],
      warnings: [],
    });
    assert.deepEqual(handleQueryArchitectureMemory({}, workspace), {
      query: null,
      interfaces: graph.interfaces,
      patterns: graph.patterns,
      integration_points: graph.integration_points,
      assumptions: graph.assumptions,
      warnings: graph.warnings,
    });
  });
});
