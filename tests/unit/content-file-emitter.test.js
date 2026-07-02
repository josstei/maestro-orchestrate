'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildContentFileOutputs } = require('../../src/generator/content-file-emitter');
const gemini = require('../../src/platforms/gemini/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const packageMetadata = require('../../package.json');

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, output.content]));
}

describe('content-file-emitter', () => {
  it('emits GEMINI.md, QWEN.md, and claude/README.md', () => {
    const outputs = buildContentFileOutputs({ gemini, qwen, claude }, SRC, packageMetadata);
    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      ['GEMINI.md', 'QWEN.md', 'claude/README.md']
    );
  });

  it('leaves no unresolved placeholders in any output', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen, claude }, SRC, packageMetadata));
    for (const [outputPath, content] of outputs) {
      assert.ok(!content.includes('{{'), `${outputPath}: contains unresolved {{placeholder}}`);
      assert.ok(!content.includes('<!-- @roster -->'), `${outputPath}: unresolved roster marker`);
    }
  });

  it('GEMINI.md references Gemini CLI and not Qwen Code outside the roster', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    const content = outputs.get('GEMINI.md');
    assert.ok(content.includes('Gemini CLI'), 'GEMINI.md missing "Gemini CLI"');
    assert.ok(!content.includes('Qwen Code'), 'GEMINI.md unexpectedly references "Qwen Code"');
  });

  it('QWEN.md includes the Qwen Tool Name Mapping section', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    const content = outputs.get('QWEN.md');
    assert.ok(content.includes('## Qwen Tool Name Mapping'), 'QWEN.md missing tool mapping section');
  });

  it('both Gemini-family outputs include the roster header and the zos_sysprog row', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    for (const [outputPath, content] of outputs) {
      assert.ok(
        content.includes('| Agent | Focus | Capability Tier |'),
        `${outputPath}: missing roster header`
      );
      assert.ok(content.includes('`zos_sysprog`'), `${outputPath}: missing zos_sysprog row`);
    }
  });

  it('claude/README.md includes the roster header and the kebab-case zos-sysprog row', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ claude }, SRC, packageMetadata));
    const content = outputs.get('claude/README.md');
    assert.ok(
      content.includes('| Agent | Focus | Capability Tier |'),
      'claude/README.md: missing roster header'
    );
    assert.ok(content.includes('| `zos-sysprog` |'), 'claude/README.md: missing kebab-case zos-sysprog row');
    assert.ok(!content.includes('`zos_sysprog`'), 'claude/README.md: roster row unexpectedly uses snake_case');
  });

  it('claude/README.md substitutes the package version into the version badge', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ claude }, SRC, packageMetadata));
    const content = outputs.get('claude/README.md');
    assert.ok(
      content.includes(`badge/version-${packageMetadata.version}-blue`),
      'claude/README.md: version badge not substituted from package.json'
    );
  });

  it('reproduces the committed context files byte-for-byte', () => {
    const fs = require('node:fs');
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen, claude }, SRC, packageMetadata));
    for (const [outputPath, content] of outputs) {
      const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
      assert.equal(content, committed, outputPath);
    }
  });

  it('skips runtimes without contextFile metadata and without a claude entry', () => {
    const outputs = buildContentFileOutputs({ gemini }, SRC);
    assert.deepEqual(outputs.map((output) => output.outputPath), ['GEMINI.md']);
  });
});
