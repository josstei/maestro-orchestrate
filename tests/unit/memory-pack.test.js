import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleExportMemoryPack, handleImportMemoryPack } from '../../dist/src/mcp/handlers/memory-pack.js';
import { handleGetProjectProfile } from '../../dist/src/mcp/handlers/project-profile.js';
import { handleQueryArchitectureMemory } from '../../dist/src/mcp/handlers/architecture-memory.js';
import { MemoryStore } from '../../dist/src/mcp/memory/memory-store.js';
import { appendAgentPerformance } from '../../dist/src/mcp/memory/agent-performance-store.js';
import { appendPlanAccuracy } from '../../dist/src/mcp/memory/jsonl-ledgers.js';
import { resolveStateDirPath } from '../../dist/src/state/session-state.js';

function listFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        out.push(path.relative(root, fullPath));
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return out.sort();
}

function seedMemory(workspace) {
  const store = new MemoryStore(workspace);
  store.writeProfile({
    build_commands: ['npm run build'],
    test_commands: ['node --test tests/unit/*.test.js'],
    conventions: ['src-first handlers'],
    do_not_touch: ['generated runtime output'],
    preferred_agents: ['coder'],
  });
  appendAgentPerformance(workspace, [
    { session_id: 'session-1', agent: 'coder', phase_id: 1, retry_count: 0 },
  ]);
  appendPlanAccuracy(workspace, { session_id: 'session-1', precision: 1, recall: 1 });
  store.writeArchitectureMemory({
    schema_version: 1,
    interfaces: [{ value: 'MemoryStore.forProjectRoot', session_id: 'session-1' }],
    patterns: [],
    integration_points: [],
    assumptions: [],
    warnings: [],
  });
}

describe('memory-pack handlers', () => {
  let roots;
  let savedStateDirEnv;

  beforeEach(() => {
    roots = [];
    savedStateDirEnv = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
  });

  afterEach(() => {
    if (savedStateDirEnv == null) {
      delete process.env.MAESTRO_STATE_DIR;
    } else {
      process.env.MAESTRO_STATE_DIR = savedStateDirEnv;
    }
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeWorkspace(label) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `maestro-pack-${label}-`));
    roots.push(root);
    return root;
  }

  it('exports durable memory into one committable memory-pack.json artifact', () => {
    const workspace = makeWorkspace('export');
    seedMemory(workspace);
    const stateDir = resolveStateDirPath(workspace);
    const before = listFiles(stateDir);

    const result = handleExportMemoryPack({}, workspace);

    assert.equal(result.path, path.join(stateDir, 'memory-pack.json'));
    assert.deepEqual(
      listFiles(stateDir).filter((file) => !before.includes(file)),
      ['memory-pack.json']
    );
    const pack = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    assert.equal(pack.schema_version, 1);
    assert.equal(typeof pack.exported_at, 'string');
    assert.deepEqual(pack.profile.build_commands, ['npm run build']);
    assert.equal(pack.agent_performance.records.length, 1);
    assert.deepEqual(pack.plan_accuracy, [
      { session_id: 'session-1', precision: 1, recall: 1 },
    ]);
    assert.deepEqual(pack.architecture_memory.interfaces, [
      { value: 'MemoryStore.forProjectRoot', session_id: 'session-1' },
    ]);
    assert.deepEqual(result.pack, pack);
  });

  it('imports a pack into a fresh workspace and is idempotent', () => {
    const source = makeWorkspace('source');
    seedMemory(source);
    const exported = handleExportMemoryPack({}, source);

    const target = makeWorkspace('target');
    const targetPackPath = path.join(resolveStateDirPath(target), 'memory-pack.json');
    fs.mkdirSync(path.dirname(targetPackPath), { recursive: true });
    fs.copyFileSync(exported.path, targetPackPath);

    const firstImport = handleImportMemoryPack({}, target);
    const secondImport = handleImportMemoryPack({}, target);

    assert.deepEqual(handleGetProjectProfile({}, target).profile.build_commands, [
      'npm run build',
    ]);
    assert.deepEqual(
      handleQueryArchitectureMemory({ query: 'MemoryStore' }, target).interfaces,
      [{ value: 'MemoryStore.forProjectRoot', session_id: 'session-1' }]
    );
    assert.deepEqual(new MemoryStore(target).readArchitectureMemory().interfaces, [
      { value: 'MemoryStore.forProjectRoot', session_id: 'session-1' },
    ]);
    assert.equal(firstImport.imported, true);
    assert.equal(secondImport.imported, true);
    assert.deepEqual(secondImport.counts.architecture_memory.interfaces, 0);
  });
});
