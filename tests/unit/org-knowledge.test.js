'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { KnowledgeStore } = require('../../src/mcp/memory/knowledge-store');
const {
  handleQueryKnowledge,
  handleRecordKnowledge,
} = require('../../src/mcp/handlers/org-knowledge');

describe('org knowledge handlers', () => {
  let tmpRoot;
  let knowledgeDir;
  let savedKnowledgeDirEnv;
  let realKnowledgeFile;
  let realKnowledgeSnapshot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-org-knowledge-'));
    knowledgeDir = path.join(tmpRoot, 'knowledge');
    savedKnowledgeDirEnv = process.env.MAESTRO_KNOWLEDGE_DIR;
    process.env.MAESTRO_KNOWLEDGE_DIR = knowledgeDir;
    realKnowledgeFile = path.join(os.homedir(), '.maestro', 'knowledge', 'knowledge.jsonl');
    realKnowledgeSnapshot = fs.existsSync(realKnowledgeFile)
      ? fs.readFileSync(realKnowledgeFile, 'utf8')
      : null;
  });

  afterEach(() => {
    if (savedKnowledgeDirEnv === undefined) {
      delete process.env.MAESTRO_KNOWLEDGE_DIR;
    } else {
      process.env.MAESTRO_KNOWLEDGE_DIR = savedKnowledgeDirEnv;
    }
    if (realKnowledgeSnapshot === null) {
      assert.equal(fs.existsSync(realKnowledgeFile), false);
    } else {
      assert.equal(fs.readFileSync(realKnowledgeFile, 'utf8'), realKnowledgeSnapshot);
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('records and queries knowledge through a temp out-of-tree store', () => {
    assert.deepEqual(
      handleRecordKnowledge({ topic: 'testing', note: 'use node --test' }, tmpRoot),
      { recorded: true }
    );

    const result = handleQueryKnowledge({ query: 'node' }, tmpRoot);

    assert.equal(result.query, 'node');
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].topic, 'testing');
    assert.equal(result.entries[0].note, 'use node --test');
    assert.equal(typeof result.entries[0].at, 'string');
    assert.equal(fs.existsSync(path.join(knowledgeDir, 'knowledge.jsonl')), true);
  });

  it('returns every entry for an empty query', () => {
    handleRecordKnowledge({ topic: 'testing', note: 'use node --test' }, tmpRoot);
    handleRecordKnowledge({ topic: 'builds', note: 'run just ci before commit' }, tmpRoot);

    const result = handleQueryKnowledge({}, tmpRoot);

    assert.equal(result.query, '');
    assert.deepEqual(
      result.entries.map((entry) => entry.topic),
      ['testing', 'builds']
    );
  });

  it('creates the resolved knowledge directory with 0700 permissions', () => {
    const resolved = new KnowledgeStore(tmpRoot).resolveDir();
    const mode = fs.statSync(resolved).mode & 0o777;

    assert.equal(resolved, knowledgeDir);
    assert.equal(mode, 0o700);
  });

  it('rejects a symlink at the resolved knowledge directory path', () => {
    const target = path.join(tmpRoot, 'target');
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    fs.symlinkSync(target, knowledgeDir);

    assert.throws(
      () => new KnowledgeStore(tmpRoot).resolveDir(),
      /MAESTRO_KNOWLEDGE_DIR must not be a symlink/
    );
  });
});
