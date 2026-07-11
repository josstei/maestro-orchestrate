import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

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
  runtimeContentRegistryPath,
  hasRuntimeContentRegistry,
  readRuntimeContentRegistry,
  readRawResourceFromRegistry,
  readResourceFromRegistry,
  readRawAgentFromRegistry,
  readAgentFromRegistry,
  listBlueprintsFromRegistry,
  readBlueprintFromRegistry,
} from '../../dist/src/mcp/content/runtime-content.js';
import { createRuntimeContentSnapshot } from '../../dist/src/mcp/content/runtime-content-snapshot.js';

function createSnapshotFixture(t, registry, payload) {
  const srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-runtime-snapshot-'));
  const generatedDir = path.join(srcRoot, 'generated');
  const registryPath = path.join(generatedDir, 'runtime-content-registry.json');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      resources: {},
      agents: {},
      blueprints: {},
      ...registry,
    })}\n`,
    'utf8'
  );
  if (payload !== undefined) {
    fs.writeFileSync(
      path.join(generatedDir, registry.payload || 'runtime-content-registry.txt'),
      payload
    );
  }
  t.after(() => fs.rmSync(srcRoot, { recursive: true, force: true }));
  return { srcRoot, registryPath };
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
  it('preserves snapshot-backed registry compatibility exports', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Use ${workspacePath}.\n',
        },
      },
      agents: {
        coder: {
          relativePath: 'agents/coder.md',
          content: '---\nname: coder\ntools: [read_file]\n---\nCompatibility agent.\n',
        },
      },
      blueprints: {
        demo: {
          relativePath: 'templates/session-blueprints/demo.md',
          content: 'Compatibility blueprint.\n',
        },
      },
    });
    const runtimeConfig = {
      name: 'codex',
      agentNaming: 'kebab-case',
      env: { workspacePath: 'WORKSPACE_ROOT' },
      features: {},
      tools: { read_file: 'Read' },
    };
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(runtimeContentRegistryPath(srcRoot), registryPath);
    assert.equal(hasRuntimeContentRegistry(srcRoot), true);
    assert.equal(readRuntimeContentRegistry(srcRoot).schemaVersion, 1);

    const rawResource = readRawResourceFromRegistry('delegation', srcRoot);
    assert.deepEqual(rawResource, snapshot.readResource('delegation'));
    assert.equal(Object.isFrozen(rawResource), false);
    const rawError = readRawResourceFromRegistry('unknown-resource', srcRoot);
    assert.match(rawError.error, /^Unknown resource identifier/);
    assert.equal(Object.isFrozen(rawError), false);
    assert.equal(
      readResourceFromRegistry('delegation', runtimeConfig, srcRoot).content,
      'Use ${WORKSPACE_ROOT}.\n'
    );

    const rawAgent = readRawAgentFromRegistry('coder', srcRoot);
    assert.deepEqual(rawAgent, snapshot.readAgent('coder'));
    assert.equal(Object.isFrozen(rawAgent), false);
    assert.deepEqual(readAgentFromRegistry('coder', runtimeConfig, srcRoot), {
      agent: {
        body: 'Compatibility agent.\n',
        tools: ['Read'],
      },
    });

    const blueprints = listBlueprintsFromRegistry(srcRoot);
    assert.deepEqual(blueprints.map(({ id }) => id), ['demo']);
    assert.equal(Object.isFrozen(blueprints), false);
    assert.equal(Object.isFrozen(blueprints[0]), false);
    const blueprint = readBlueprintFromRegistry('demo', srcRoot);
    assert.deepEqual(blueprint, snapshot.readBlueprint('demo'));
    assert.equal(Object.isFrozen(blueprint), false);
  });

  it('performs no runtime registry read during construction or unknown lookups', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {});
    fs.writeFileSync(registryPath, '{ malformed json', 'utf8');
    const originalReadFileSync = fs.readFileSync;
    let registryReads = 0;
    t.mock.method(fs, 'readFileSync', function (...args) {
      if (String(args[0]) === registryPath) registryReads += 1;
      return originalReadFileSync.apply(this, args);
    });

    const snapshot = createRuntimeContentSnapshot(srcRoot);
    assert.equal(registryReads, 0);
    assert.match(snapshot.readResource('unknown-resource').error, /^Unknown resource identifier/);
    assert.match(snapshot.readResource('constructor').error, /^Unknown resource identifier/);
    assert.match(snapshot.readResource('toString').error, /^Unknown resource identifier/);
    assert.match(snapshot.readResource('__proto__').error, /^Unknown resource identifier/);
    assert.match(snapshot.readAgent('unknown-agent').error, /^Unknown agent identifier/);
    assert.equal(registryReads, 0);

    assert.deepEqual(snapshot.readResource('delegation'), {
      error: 'Failed to read resource "delegation": UNKNOWN',
      code: 'UNKNOWN',
      path: registryPath,
    });
    assert.deepEqual(snapshot.readAgent('coder'), {
      error: 'Failed to read agent "coder": UNKNOWN',
      code: 'UNKNOWN',
      path: registryPath,
    });
    assert.equal(registryReads, 1);
  });

  it('serves inline resources, agents, and blueprints without a payload file', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Inline skill.\n',
        },
      },
      agents: {
        coder: {
          relativePath: 'agents/coder.md',
          content: 'Inline agent.\n',
        },
      },
      blueprints: {
        demo: {
          relativePath: 'templates/session-blueprints/demo.md',
          content: 'Inline blueprint.\n',
        },
      },
    });

    const snapshot = createRuntimeContentSnapshot(srcRoot);
    assert.equal(snapshot.readResource('delegation').content, 'Inline skill.\n');
    assert.equal(snapshot.readAgent('coder').content, 'Inline agent.\n');
    assert.equal(snapshot.readBlueprint('demo').content, 'Inline blueprint.\n');
    assert.deepEqual(snapshot.listBlueprints().map(({ id }) => id), ['demo']);
  });

  it('attributes missing, unsupported, and corrupt payload failures to the registry', (t) => {
    const cases = [
      {
        name: 'missing',
        registry: {
          payload: 'missing.gz',
          payloadEncoding: 'gzip',
          resources: { delegation: ['skills/shared/delegation/SKILL.md', 0, 4] },
        },
        expectedCode: 'ENOENT',
      },
      {
        name: 'unsupported',
        registry: {
          payload: 'content.bin',
          payloadEncoding: 'brotli',
          resources: { delegation: ['skills/shared/delegation/SKILL.md', 0, 4] },
        },
        payload: Buffer.from('data'),
        expectedCode: 'UNKNOWN',
      },
      {
        name: 'corrupt',
        registry: {
          payload: 'content.gz',
          payloadEncoding: 'gzip',
          resources: { delegation: ['skills/shared/delegation/SKILL.md', 0, 4] },
        },
        payload: Buffer.from([0x6e, 0x6f, 0x74, 0x2d, 0x67, 0x7a, 0x69, 0x70]),
        expectedCode: 'Z_DATA_ERROR',
      },
    ];

    for (const fixture of cases) {
      const { srcRoot, registryPath } = createSnapshotFixture(
        t,
        fixture.registry,
        fixture.payload
      );
      const result = createRuntimeContentSnapshot(srcRoot).readResource('delegation');
      assert.deepEqual(result, {
        error: `Failed to read resource "delegation": ${fixture.expectedCode}`,
        code: fixture.expectedCode,
        path: registryPath,
      }, fixture.name);
    }
  });

  it('keeps packed agent failures in the agent-specific registry envelope', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {
      payload: 'missing-agents.gz',
      payloadEncoding: 'gzip',
      agents: {
        coder: ['agents/coder.md', 0, 10],
      },
    });

    assert.deepEqual(createRuntimeContentSnapshot(srcRoot).readAgent('coder'), {
      error: 'Failed to read agent "coder": ENOENT',
      code: 'ENOENT',
      path: registryPath,
    });
  });

  it('does not let a cached packed-payload failure poison later inline entries', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {
      payload: 'missing.gz',
      payloadEncoding: 'gzip',
      resources: {
        delegation: ['skills/shared/delegation/SKILL.md', 0, 4],
        architecture: {
          relativePath: 'references/architecture.md',
          content: 'Inline architecture.\n',
        },
        validation: ['skills/shared/validation/SKILL.md', 4, 4],
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.deepEqual(snapshot.readResource('delegation'), {
      error: 'Failed to read resource "delegation": ENOENT',
      code: 'ENOENT',
      path: registryPath,
    });
    assert.equal(snapshot.readResource('architecture').content, 'Inline architecture.\n');
    assert.deepEqual(snapshot.readResource('validation'), {
      error: 'Failed to read resource "validation": ENOENT',
      code: 'ENOENT',
      path: registryPath,
    });
  });

  it('isolates malformed agent profiles from resources and blueprints', (t) => {
    const { srcRoot, registryPath } = createSnapshotFixture(t, {
      resources: {
        delegation: {
          relativePath: 'skills/shared/delegation/SKILL.md',
          content: 'Healthy resource.\n',
        },
      },
      agents: {
        coder: {
          relativePath: 'agents/coder.md',
          content: 'Fallback agent.\n',
        },
      },
      agentProfiles: {
        broken: {
          relativePath: 'agent-profiles/broken.profile',
          content: 'not a profile',
        },
      },
      blueprints: {
        demo: {
          relativePath: 'templates/session-blueprints/demo.md',
          content: 'Healthy blueprint.\n',
        },
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.deepEqual(snapshot.readAgent('coder'), {
      error: 'Failed to read agent "coder": UNKNOWN',
      code: 'UNKNOWN',
      path: registryPath,
    });
    assert.equal(snapshot.readResource('delegation').content, 'Healthy resource.\n');
    assert.equal(snapshot.readBlueprint('demo').content, 'Healthy blueprint.\n');
    assert.deepEqual(snapshot.listBlueprints().map(({ id }) => id), ['demo']);
  });

  it('preserves the first matching agent profile and caches the rendered index', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      agentProfiles: {
        first: {
          relativePath: 'agent-profiles/first.profile',
          content: profile('coder', 'First profile body.'),
        },
        second: {
          relativePath: 'agent-profiles/second.profile',
          content: profile('coder', 'Second profile body.'),
        },
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);
    const first = snapshot.readAgent('coder');
    const repeated = snapshot.readAgent('coder');

    assert.match(first.content, /First profile body/);
    assert.doesNotMatch(first.content, /Second profile body/);
    assert.equal(repeated, first);
  });

  it('returns null for missing or malformed blueprints and filters malformed entries', (t) => {
    const { srcRoot } = createSnapshotFixture(t, {
      blueprints: {
        malformed: ['templates/session-blueprints/malformed.md', 'bad-offset', 4],
        valid: {
          relativePath: 'templates/session-blueprints/valid.md',
          content: 'Valid.\n',
        },
      },
    });
    const snapshot = createRuntimeContentSnapshot(srcRoot);

    assert.equal(snapshot.readBlueprint('missing'), null);
    assert.equal(snapshot.readBlueprint('malformed'), null);
    assert.deepEqual(snapshot.listBlueprints().map(({ id }) => id), ['valid']);
  });

  it('uses JavaScript string offsets for packed non-ASCII payloads', (t) => {
    const content = 'Delegation after π.\n';
    const prefix = '😀';
    const { srcRoot } = createSnapshotFixture(
      t,
      {
        payload: 'content.gz',
        payloadEncoding: 'gzip',
        resources: {
          delegation: [
            'skills/shared/delegation/SKILL.md',
            prefix.length,
            content.length,
          ],
        },
      },
      gzipSync(prefix + content)
    );

    assert.equal(createRuntimeContentSnapshot(srcRoot).readResource('delegation').content, content);
  });
});
