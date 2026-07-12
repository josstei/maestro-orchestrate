import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readArchitectureMemory,
  writeArchitectureMemory,
} from '../../dist/src/mcp/memory/architecture-memory-store.js';
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

describe('architecture-memory store', () => {
  it('returns an empty graph when no architecture memory exists', () => {
    assert.deepEqual(readArchitectureMemory(makeWorkspace()), emptyGraph());
  });

  it('round-trips the structured architecture-memory object', () => {
    const workspace = makeWorkspace();
    const graph = {
      ...emptyGraph(),
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      warnings: [{ value: 'ttl assumed', session_id: 'session-1' }],
    };

    writeArchitectureMemory(workspace, graph);

    assert.deepEqual(readArchitectureMemory(workspace), graph);
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
            patterns_established: ['focused memory stores'],
            integration_points: ['handleArchiveSession'],
            assumptions: ['state_dir exists'],
            warnings: ['ttl assumed'],
          },
        },
      ],
    };

    recordArchitectureMemory(state, workspace);
    recordArchitectureMemory(state, workspace);

    assert.deepEqual(readArchitectureMemory(workspace), {
      schema_version: 1,
      interfaces: [{ value: 'refreshToken()', session_id: 'session-1' }],
      patterns: [{ value: 'focused memory stores', session_id: 'session-1' }],
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
      patterns: [{ value: 'focused memory stores', session_id: 'session-1' }],
      integration_points: [{ value: 'Token vault integration', session_id: 'session-1' }],
      assumptions: [{ value: 'Cache TTL exists', session_id: 'session-1' }],
      warnings: [{ value: 'ttl assumed', session_id: 'session-1' }],
    };
    writeArchitectureMemory(workspace, graph);

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
