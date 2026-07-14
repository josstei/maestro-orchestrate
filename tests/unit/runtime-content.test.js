import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib, { gzipSync } from 'node:zlib';

import {
  DEFAULT_RUNTIME_NAME,
  RESOURCE_ALLOWLIST,
  AGENT_ALLOWLIST,
  applyReplacePaths,
  applySkillMetadata,
  applyReplaceAgentNames,
  applyStripFeature,
  stripFrontmatter,
  stripFeatureBlocks,
  parseInlineArray,
  parseFrontmatter,
  mapTools,
} from '../../dist/src/mcp/content/runtime-content.js';
import { createRuntimeContentSnapshot } from '../../dist/src/mcp/content/runtime-content-snapshot.js';
import * as runtimeContentModule from '../../dist/src/mcp/content/runtime-content.js';

function createSnapshotFixture(t, registry, payload) {
  const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-runtime-snapshot-'));
  const generatedDir = path.join(srcRoot, 'generated');
  const registryPath = path.join(generatedDir, 'runtime-content-registry.json');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 2,
      storage: 'inline',
      resources: {},
      agents: {},
      agentProfiles: {},
      blueprints: {},
      ...registry,
    })}\n`,
    'utf8'
  );
  if (payload !== undefined) {
    fs.writeFileSync(
      path.join(generatedDir, registry.payload || 'runtime-content-registry.txt.gz'),
      payload
    );
  }
  t.after(() => fs.rmSync(srcRoot, { recursive: true, force: true }));
  return { srcRoot, registryPath };
}

function inline(relativePath, content) {
  return { kind: 'inline', relativePath, content };
}

function profile(agentName, body) {
  return [
    '1',
    'T|basic|r|R|1|0|1|general',
    `A|${agentName}|basic|blue|focus`,
    'D|description',
    'E|first context',
    'U|first user',
    'S|first assistant',
    'C|first commentary',
    'E|second context',
    'U|second user',
    'S|second assistant',
    'C|second commentary',
    'B',
    body,
    '.',
    '',
  ].join('\n');
}

describe('DEFAULT_RUNTIME_NAME', () => {
  it('equals gemini', () => {
    assert.equal(DEFAULT_RUNTIME_NAME, 'gemini');
  });
});

describe('RESOURCE_ALLOWLIST', () => {
  it('is frozen with 15 entries', () => {
    assert.equal(Object.isFrozen(RESOURCE_ALLOWLIST), true);
    assert.equal(Object.keys(RESOURCE_ALLOWLIST).length, 15);
  });
});

describe('AGENT_ALLOWLIST', () => {
  it('is frozen with 39 entries, all kebab-case strings', () => {
    assert.equal(Object.isFrozen(AGENT_ALLOWLIST), true);
    assert.equal(AGENT_ALLOWLIST.length, 39);

    for (const name of AGENT_ALLOWLIST) {
      assert.equal(typeof name, 'string');
      assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('applyReplacePaths', () => {
  it('replaces ${extensionPath} with ${ENV_VAR_NAME} from runtimeConfig.env.extensionPath', () => {
    const content = 'load from ${extensionPath}/foo';
    const result = applyReplacePaths(content, { env: { extensionPath: 'EXTENSION_DIR' } });
    assert.equal(result, 'load from ${EXTENSION_DIR}/foo');
  });

  it('replaces ${workspacePath} with ${ENV_VAR_NAME} from runtimeConfig.env.workspacePath', () => {
    const content = 'root is ${workspacePath}/bar';
    const result = applyReplacePaths(content, { env: { workspacePath: 'WORKSPACE_DIR' } });
    assert.equal(result, 'root is ${WORKSPACE_DIR}/bar');
  });

  it('passes through extensionPath that already starts with ${ as-is', () => {
    const content = 'path is ${extensionPath}/baz';
    const result = applyReplacePaths(content, { env: { extensionPath: '${ALREADY_WRAPPED}' } });
    assert.equal(result, 'path is ${ALREADY_WRAPPED}/baz');
  });

  it('returns content unchanged when no placeholders present', () => {
    const content = 'no placeholders here';
    const result = applyReplacePaths(content, { env: { extensionPath: 'EXT', workspacePath: 'WS' } });
    assert.equal(result, content);
  });
});

describe('applySkillMetadata', () => {
  it('adds user-invocable: false for claude runtime and SKILL.md path', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'claude' }, 'skills/shared/delegation/SKILL.md');
    assert.ok(result.includes('user-invocable: false'));
  });

  it('returns unchanged for non-claude runtimes', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'gemini' }, 'skills/shared/delegation/SKILL.md');
    assert.equal(result, content);
  });

  it('returns unchanged for non-SKILL.md paths', () => {
    const content = '---\nname: delegation\n---\nbody text\n';
    const result = applySkillMetadata(content, { name: 'claude' }, 'references/architecture.md');
    assert.equal(result, content);
  });
});

describe('applyReplaceAgentNames', () => {
  it('replaces kebab-case agent names with snake_case for snake_case runtime', () => {
    const content = 'delegate to code-reviewer for review';
    const result = applyReplaceAgentNames(content, { agentNaming: 'snake_case' });
    assert.equal(result, 'delegate to code_reviewer for review');
  });

  it('returns unchanged for non-snake_case runtimes', () => {
    const content = 'delegate to code-reviewer for review';
    const result = applyReplaceAgentNames(content, { agentNaming: 'kebab-case' });
    assert.equal(result, content);
  });

  it('replaces multiple different agent names in one pass', () => {
    const content = 'ask devops-engineer and security-engineer to verify';
    const result = applyReplaceAgentNames(content, { agentNaming: 'snake_case' });
    assert.equal(result, 'ask devops_engineer and security_engineer to verify');
  });
});

describe('applyStripFeature', () => {
  it('keeps feature block content when feature flag is true', () => {
    const content = '<!-- @feature mcp -->\nsome content\n<!-- @end-feature -->\n';
    const result = applyStripFeature(content, { features: { mcp: true } });
    assert.ok(result.includes('some content'));
  });

  it('removes feature block content when feature flag is false', () => {
    const content = '<!-- @feature mcp -->\nsome content\n<!-- @end-feature -->\n';
    const result = applyStripFeature(content, { features: { mcp: false } });
    assert.equal(result.includes('some content'), false);
  });

  it('throws on unknown feature flag', () => {
    const content = '<!-- @feature unknown -->\nsome content\n<!-- @end-feature -->\n';
    assert.throws(
      () => applyStripFeature(content, { features: {} }),
      /Unknown feature flag: "unknown"/
    );
  });

  it('collapses triple newlines to double', () => {
    const content = 'before\n\n<!-- @feature mcp -->\nblock\n<!-- @end-feature -->\n\nafter\n';
    const result = applyStripFeature(content, { features: { mcp: false } });
    assert.equal(result.includes('\n\n\n'), false);
  });
});

describe('stripFrontmatter', () => {
  it('removes --- delimited frontmatter', () => {
    const content = '---\nname: foo\n---\nbody text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, 'body text\n');
  });

  it('returns content unchanged when no frontmatter', () => {
    const content = 'just body text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, content);
  });

  it('returns content unchanged when frontmatter not closed', () => {
    const content = '---\nname: foo\nbody text\n';
    const result = stripFrontmatter(content);
    assert.equal(result, content);
  });
});

describe('stripFeatureBlocks', () => {
  it('strips feature blocks and returns empty result for unknown flags', () => {
    const content = '<!-- @feature unknown -->\nsome content\n<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { features: {} });
    assert.equal(result.includes('some content'), false);
  });

  it('keeps content for known true flags', () => {
    const content = '<!-- @feature mcp -->\nkept content\n<!-- @end-feature -->\n';
    const result = stripFeatureBlocks(content, { features: { mcp: true } });
    assert.ok(result.includes('kept content'));
  });
});

describe('parseInlineArray', () => {
  it('parses "[a, b, c]" into array of trimmed strings', () => {
    const result = parseInlineArray('[a, b, c]');
    assert.deepEqual(result, ['a', 'b', 'c']);
  });

  it('returns [] for null, undefined, and empty string', () => {
    assert.deepEqual(parseInlineArray(null), []);
    assert.deepEqual(parseInlineArray(undefined), []);
    assert.deepEqual(parseInlineArray(''), []);
  });

  it('returns [] for non-bracket strings', () => {
    assert.deepEqual(parseInlineArray('a, b, c'), []);
  });

  it('filters out empty entries', () => {
    const result = parseInlineArray('[a, , b]');
    assert.deepEqual(result, ['a', 'b']);
  });
});

describe('parseFrontmatter', () => {
  it('parses key: value pairs from frontmatter', () => {
    const content = '---\nname: foo\ntier: full\n---\nbody\n';
    const result = parseFrontmatter(content);
    assert.equal(result.name, 'foo');
    assert.equal(result.tier, 'full');
  });

  it('returns {} for content without frontmatter', () => {
    const result = parseFrontmatter('just body text\n');
    assert.deepEqual(result, {});
  });

  it('returns {} for unclosed frontmatter', () => {
    const result = parseFrontmatter('---\nname: foo\nbody\n');
    assert.deepEqual(result, {});
  });

  it('retains raw strings and strict closing-delimiter compatibility', () => {
    const result = parseFrontmatter('---\ntools: [read_file, write_file]\n---\n');
    assert.equal(result.tools, '[read_file, write_file]');
    assert.deepEqual(parseFrontmatter('---\ntools: [read_file, write_file]\n---'), {});
  });
});

describe('mapTools', () => {
  it('maps canonical tool names through runtimeConfig.tools', () => {
    const frontmatter = { tools: '[read_file, write_file]' };
    const runtimeConfig = { name: 'gemini', tools: { read_file: 'ReadFile', write_file: 'WriteFile' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['ReadFile', 'WriteFile']);
  });

  it('uses per-runtime tool override when present', () => {
    const frontmatter = {
      tools: '[read_file, write_file]',
      'tools.claude': '[Read, Write]',
    };
    const runtimeConfig = { name: 'claude', tools: { Read: 'Read', Write: 'Write' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Read', 'Write']);
  });

  it('flattens array tool mappings', () => {
    const frontmatter = { tools: '[bash]' };
    const runtimeConfig = { name: 'gemini', tools: { bash: ['Bash', 'Terminal'] } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Bash', 'Terminal']);
  });

  it('keeps unmapped tool names as-is', () => {
    const frontmatter = { tools: '[custom_tool]' };
    const runtimeConfig = { name: 'gemini', tools: {} };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['custom_tool']);
  });

  it('maps canonical parsed tool arrays without reparsing bracket strings', () => {
    const frontmatter = {
      tools: ['read_file'],
      'tools.claude': ['Read', 'Write'],
    };
    const runtimeConfig = { name: 'claude', tools: { Read: 'Read', Write: 'Write' } };
    assert.deepEqual(mapTools(frontmatter, runtimeConfig), ['Read', 'Write']);
  });
});

describe('createRuntimeContentSnapshot', () => {
  it('retires raw reader and representation-selector compatibility exports', () => {
    for (const name of [
      'runtimeContentRegistryPath',
      'hasRuntimeContentRegistry',
      'readRuntimeContentRegistry',
      'readRawResourceFromFilesystem',
      'readRawResourceFromRegistry',
      'readResourceFromFilesystem',
      'readResourceFromRegistry',
      'readRawAgentFromFilesystem',
      'readRawAgentFromRegistry',
      'readAgentFromFilesystem',
      'readAgentFromRegistry',
      'listBlueprintsFromRegistry',
      'readBlueprintFromRegistry',
    ]) {
      assert.equal(runtimeContentModule[name], undefined, name);
    }
  });

  it('does not read the manifest during construction or unknown lookups', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {});
    fs.writeFileSync(registryPath, '{ malformed json', 'utf8');
    const originalReadFileSync = fs.readFileSync;
    let manifestReads = 0;
    t.mock.method(fs, 'readFileSync', function (...args) {
      if (String(args[0]) === registryPath) manifestReads += 1;
      return originalReadFileSync.apply(this, args);
    });

    const snapshot = createRuntimeContentSnapshot(srcRoot);
    assert.match(snapshot.readResource('__proto__').error, /^Unknown resource identifier/);
    assert.match(snapshot.readAgent('unknown-agent').error, /^Unknown agent identifier/);
    assert.equal(manifestReads, 0);
    assert.equal(
      snapshot.readResource('delegation').code,
      'UNKNOWN'
    );
    assert.equal(manifestReads, 1);
  });

  it('serves explicit inline resources, agents, and blueprints', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      resources: {
        delegation: inline('skills/shared/delegation/SKILL.md', 'Inline skill.\n'),
      },
      agents: { coder: inline('agents/coder.md', 'Inline agent.\n') },
      blueprints: {
        demo: inline('templates/session-blueprints/demo.md', 'Inline blueprint.\n'),
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readResource('delegation').content, 'Inline skill.\n');
    assert.equal(snapshot.readAgent('coder').content, 'Inline agent.\n');
    assert.equal(snapshot.readBlueprint('demo').content, 'Inline blueprint.\n');
    assert.deepEqual(snapshot.listBlueprints().map(({ id }) => id), ['demo']);
  });

  it('performs uncached file reads for resources and composed profiles', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      storage: 'file',
      resources: { delegation: 'skills/shared/delegation/SKILL.md' },
      agentProfiles: { agents: 'agent-profiles/agents.profile' },
    });
    const resourcePath = path.join(srcRoot, 'skills/shared/delegation/SKILL.md');
    const profilePath = path.join(srcRoot, 'agent-profiles/agents.profile');
    fs.mkdirSync(path.dirname(resourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(resourcePath, 'First resource.\n');
    fs.writeFileSync(profilePath, profile('coder', 'First profile body.'));
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readResource('delegation').content, 'First resource.\n');
    assert.match(snapshot.readAgent('coder').content, /First profile body/);
    fs.writeFileSync(resourcePath, 'Second resource.\n');
    fs.writeFileSync(profilePath, profile('coder', 'Second profile body.'));
    assert.equal(snapshot.readResource('delegation').content, 'Second resource.\n');
    assert.match(snapshot.readAgent('coder').content, /Second profile body/);
  });

  it('rejects unsafe file paths before reading content', (t) => {
    const cases = [
      ['/tmp/content.md', 'ERR_RUNTIME_CONTENT_PATH_ABSOLUTE'],
      ['C:/content.md', 'ERR_RUNTIME_CONTENT_PATH_ABSOLUTE'],
      ['skills\\content.md', 'ERR_RUNTIME_CONTENT_PATH_BACKSLASH'],
      ['../content.md', 'ERR_RUNTIME_CONTENT_PATH_TRAVERSAL'],
      ['skills/../content.md', 'ERR_RUNTIME_CONTENT_PATH_TRAVERSAL'],
      ['skills/content\0.md', 'ERR_RUNTIME_CONTENT_PATH_NUL'],
    ];

    for (const [relativePath, code] of cases) {
      const { srcRoot } = createSnapshotFixture(t, {
        storage: 'file',
        resources: { delegation: relativePath },
      });
      assert.equal(createRuntimeContentSnapshot(srcRoot).readResource('delegation').code, code);
    }
  });

  it('rejects symlink escape and reports missing file paths', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      storage: 'file',
      resources: {
        delegation: 'skills/shared/delegation/SKILL.md',
        architecture: 'references/architecture.md',
      },
    });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
    const outsideFile = path.join(outside, 'SKILL.md');
    const linkedFile = path.join(srcRoot, 'skills/shared/delegation/SKILL.md');
    fs.writeFileSync(outsideFile, 'outside\n');
    fs.mkdirSync(path.dirname(linkedFile), { recursive: true });
    fs.symlinkSync(outsideFile, linkedFile);
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readResource('delegation').code, 'ERR_RUNTIME_CONTENT_PATH_ESCAPE');
    const missing = snapshot.readResource('architecture');
    assert.equal(missing.code, 'ENOENT');
    assert.equal(missing.path, path.join(srcRoot, 'references/architecture.md'));
  });

  it('rejects unsupported storage, corrupt JSON, malformed sections, and legacy entries', (t) => {
    const unsupported = createSnapshotFixture(t, { storage: 'legacy' });
    assert.equal(
      createRuntimeContentSnapshot(unsupported.srcRoot).readResource('delegation').code,
      'ERR_RUNTIME_CONTENT_STORAGE'
    );

    const legacy = createSnapshotFixture(t, { schemaVersion: 1 });
    assert.equal(
      createRuntimeContentSnapshot(legacy.srcRoot).readResource('delegation').code,
      'ERR_RUNTIME_CONTENT_MANIFEST'
    );

    const corrupt = createSnapshotFixture(t, {});
    fs.writeFileSync(corrupt.registryPath, '{bad json', 'utf8');
    assert.equal(
      createRuntimeContentSnapshot(corrupt.srcRoot).readResource('delegation').code,
      'UNKNOWN'
    );

    const malformedSection = createSnapshotFixture(t, { resources: [] });
    assert.equal(
      createRuntimeContentSnapshot(malformedSection.srcRoot).readResource('delegation').code,
      'ERR_RUNTIME_CONTENT_MANIFEST'
    );

    const legacyEntry = createSnapshotFixture(t, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Implicit legacy entry.\n',
        },
      },
    });
    assert.equal(
      createRuntimeContentSnapshot(legacyEntry.srcRoot).readResource('delegation').code,
      'ERR_RUNTIME_CONTENT_ENTRY'
    );
  });

  it('caches one packed manifest, payload read, and decompression with UTF-16 offsets', (t) => {
    const prefix = '😀';
    const content = 'Delegation after π.\n';
    const payloadName = 'content.gz';
    const { srcRoot, registryPath } = createSnapshotFixture(t, {
      storage: 'packed',
      payload: payloadName,
      payloadEncoding: 'gzip',
      resources: {
        delegation: ['skills/shared/delegation/SKILL.md', prefix.length, content.length],
      },
    }, gzipSync(prefix + content));
    const payloadPath = path.join(srcRoot, 'generated', payloadName);
    const realPayloadPath = fs.realpathSync(payloadPath);
    const originalReadFileSync = fs.readFileSync;
    const originalGunzipSync = zlib.gunzipSync;
    let manifestReads = 0;
    let payloadReads = 0;
    let decompressions = 0;
    t.mock.method(fs, 'readFileSync', function (...args) {
      if (String(args[0]) === registryPath) manifestReads += 1;
      if (String(args[0]) === realPayloadPath) payloadReads += 1;
      return originalReadFileSync.apply(this, args);
    });
    t.mock.method(zlib, 'gunzipSync', function (...args) {
      decompressions += 1;
      return originalGunzipSync.apply(this, args);
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readResource('delegation').content, content);
    assert.equal(snapshot.readResource('delegation').content, content);
    assert.deepEqual([manifestReads, payloadReads, decompressions], [1, 1, 1]);
  });

  it('isolates packed failures from explicit inline entries', (t) => {
    const fixtures = [
      { payload: 'missing.gz', encoding: 'gzip', expected: 'ENOENT' },
      { payload: 'content.bin', encoding: 'brotli', body: Buffer.from('data'), expected: 'UNKNOWN' },
      { payload: 'content.gz', encoding: 'gzip', body: Buffer.from('not-gzip'), expected: 'Z_DATA_ERROR' },
    ];

    for (const fixture of fixtures) {
      const { srcRoot, registryPath } = createSnapshotFixture(t, {
        storage: 'packed',
        payload: fixture.payload,
        payloadEncoding: fixture.encoding,
        resources: {
          delegation: ['skills/shared/delegation/SKILL.md', 0, 4],
          architecture: inline('references/architecture.md', 'Healthy inline.\n'),
        },
      }, fixture.body);
      const snapshot = createRuntimeContentSnapshot(srcRoot);
      const failure = snapshot.readResource('delegation');
      assert.equal(failure.code, fixture.expected);
      assert.equal(failure.path, registryPath);
      assert.equal(snapshot.readResource('architecture').content, 'Healthy inline.\n');
    }
  });

  it('rejects invalid packed ranges without slicing or reading unrelated sections', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      storage: 'packed',
      payload: 'content.gz',
      payloadEncoding: 'gzip',
      resources: {
        delegation: ['skills/shared/delegation/SKILL.md', 0, Number.MAX_SAFE_INTEGER],
      },
      blueprints: {
        demo: inline('templates/session-blueprints/demo.md', 'Healthy blueprint.\n'),
      },
    }, gzipSync('tiny'));
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readResource('delegation').code, 'ERR_RUNTIME_CONTENT_RANGE');
    assert.equal(snapshot.readBlueprint('demo').content, 'Healthy blueprint.\n');
  });

  it('isolates malformed profiles from resources and blueprints', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      resources: {
        delegation: inline('skills/shared/delegation/SKILL.md', 'Healthy resource.\n'),
      },
      agents: { coder: inline('agents/coder.md', 'Fallback agent.\n') },
      agentProfiles: {
        broken: inline('agent-profiles/broken.profile', 'not a profile'),
      },
      blueprints: {
        demo: inline('templates/session-blueprints/demo.md', 'Healthy blueprint.\n'),
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readAgent('coder').code, 'UNKNOWN');
    assert.equal(snapshot.readResource('delegation').content, 'Healthy resource.\n');
    assert.equal(snapshot.readBlueprint('demo').content, 'Healthy blueprint.\n');
  });

  it('filters malformed blueprint entries and preserves deterministic order', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      blueprints: {
        malformed: { kind: 'inline', relativePath: 42, content: 'bad' },
        zeta: inline('templates/session-blueprints/zeta.md', 'Zeta.\n'),
        alpha: inline('templates/session-blueprints/alpha.md', 'Alpha.\n'),
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readBlueprint('missing'), null);
    assert.equal(snapshot.readBlueprint('malformed'), null);
    assert.deepEqual(snapshot.listBlueprints().map(({ id }) => id), ['alpha', 'zeta']);
  });
});
