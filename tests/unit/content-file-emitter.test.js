import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildContentFileOutputs } from '../../dist/src/generator/content-file-emitter.js';
import { buildRegistryModel } from '../../dist/src/generator/registry-scanner.js';
import gemini from '../../dist/src/platforms/gemini/runtime-config.js';
import qwen from '../../dist/src/platforms/qwen/runtime-config.js';
import claude from '../../dist/src/platforms/claude/runtime-config.js';
import codex from '../../dist/src/platforms/codex/runtime-config.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');
const SRC = path.join(ROOT, 'src');
const packageMetadata = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url)));
const agents = buildRegistryModel(SRC).agents;

function buildOutputs(runtimes, metadata = packageMetadata, agentData = agents) {
  return buildContentFileOutputs(runtimes, SRC, metadata, agentData);
}

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, output.content]));
}

describe('content-file-emitter', () => {
  it('emits GEMINI.md, QWEN.md, claude/README.md, and the per-runtime docs', () => {
    const outputs = buildOutputs({ gemini, qwen, claude, codex });
    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      [
        'GEMINI.md',
        'QWEN.md',
        'claude/README.md',
        'docs/runtime-claude.md',
        'docs/runtime-codex.md',
        'docs/runtime-gemini.md',
        'docs/runtime-qwen.md',
      ]
    );
  });

  it('expands the feature-flags marker into a table sourced from runtime.features', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen, claude, codex }));
    for (const [runtime, config, expected] of [
      ['gemini', gemini, { exampleBlocks: false, mcpStateContract: true }],
      ['claude', claude, { exampleBlocks: true, mcpStateContract: true }],
      ['codex', codex, { exampleBlocks: false, mcpStateContract: true }],
      ['qwen', qwen, { exampleBlocks: false, mcpStateContract: true }],
    ]) {
      const outputPath = `docs/runtime-${runtime}.md`;
      const content = outputs.get(outputPath);
      assert.deepEqual(config.features, expected, `${outputPath}: unexpected runtime.features fixture`);
      assert.ok(!content.includes('<!-- @feature-flags -->'), `${outputPath}: unresolved feature-flags marker`);
      for (const [flag, value] of Object.entries(expected)) {
        assert.ok(content.includes(`| \`${flag}\` | \`${value}\` |`), `${outputPath}: missing ${flag} row`);
      }
    }
  });

  it('leaves no unresolved placeholders in any output', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen, claude, codex }));
    for (const [outputPath, content] of outputs) {
      assert.ok(!content.includes('{{'), `${outputPath}: contains unresolved {{placeholder}}`);
      assert.ok(!content.includes('<!-- @roster -->'), `${outputPath}: unresolved roster marker`);
      assert.ok(!content.includes('<!-- @feature-flags -->'), `${outputPath}: unresolved feature-flags marker`);
    }
  });

  it('GEMINI.md references Gemini CLI and not Qwen Code outside the roster', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen }));
    const content = outputs.get('GEMINI.md');
    assert.ok(content.includes('Gemini CLI'), 'GEMINI.md missing "Gemini CLI"');
    assert.ok(!content.includes('Qwen Code'), 'GEMINI.md unexpectedly references "Qwen Code"');
  });

  it('QWEN.md includes the Qwen Tool Name Mapping section', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen }));
    const content = outputs.get('QWEN.md');
    assert.ok(content.includes('## Qwen Tool Name Mapping'), 'QWEN.md missing tool mapping section');
  });

  it('both Gemini-family context files include the roster header and the zos_sysprog row', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen }));
    for (const outputPath of ['GEMINI.md', 'QWEN.md']) {
      const content = outputs.get(outputPath);
      assert.ok(
        content.includes('| Agent | Focus | Capability Tier |'),
        `${outputPath}: missing roster header`
      );
      assert.ok(content.includes('`zos_sysprog`'), `${outputPath}: missing zos_sysprog row`);
    }
  });

  it('claude/README.md includes the roster header and the kebab-case zos-sysprog row', () => {
    const outputs = outputsByPath(buildOutputs({ claude }));
    const content = outputs.get('claude/README.md');
    assert.ok(
      content.includes('| Agent | Focus | Capability Tier |'),
      'claude/README.md: missing roster header'
    );
    assert.ok(content.includes('| `zos-sysprog` |'), 'claude/README.md: missing kebab-case zos-sysprog row');
    assert.ok(!content.includes('`zos_sysprog`'), 'claude/README.md: roster row unexpectedly uses snake_case');
  });

  it('claude/README.md substitutes the package version into the version badge', () => {
    const outputs = outputsByPath(buildOutputs({ claude }));
    const content = outputs.get('claude/README.md');
    assert.ok(
      content.includes(`badge/version-${packageMetadata.version}-blue`),
      'claude/README.md: version badge not substituted from package.json'
    );
  });

  it('reproduces the committed context files and runtime docs byte-for-byte', () => {
    const outputs = outputsByPath(buildOutputs({ gemini, qwen, claude, codex }));
    for (const [outputPath, content] of outputs) {
      const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
      assert.equal(content, committed, outputPath);
    }
  });

  it('skips runtimes without contextFile metadata and without a claude entry', () => {
    const outputs = buildOutputs({ gemini });
    assert.deepEqual(
      outputs.map((output) => output.outputPath),
      ['GEMINI.md', 'docs/runtime-gemini.md']
    );
  });

  it('renders injected agent data without reading a generated registry projection', () => {
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = function (...args) {
      if (String(args[0]).endsWith(path.join('src', 'generated', 'agent-registry.json'))) {
        throw new Error('generated registry projection must not be read');
      }
      return originalReadFileSync.apply(fs, args);
    };

    try {
      const outputs = outputsByPath(buildOutputs({ gemini }, packageMetadata, [{
        name: 'injected-agent',
        capabilities: 'read_only',
        tools: [],
        focus: 'Injected registry data',
      }]));
      assert.match(outputs.get('GEMINI.md'), /`injected_agent`.*Injected registry data/);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  });
});
