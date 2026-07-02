'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildContentFileOutputs } = require('../../src/generator/content-file-emitter');
const gemini = require('../../src/platforms/gemini/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, output.content]));
}

describe('content-file-emitter', () => {
  it('emits GEMINI.md and QWEN.md', () => {
    const outputs = buildContentFileOutputs({ gemini, qwen }, SRC);
    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      ['GEMINI.md', 'QWEN.md']
    );
  });

  it('leaves no unresolved placeholders in either output', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    for (const [outputPath, content] of outputs) {
      assert.ok(!content.includes('{{'), `${outputPath}: contains unresolved {{placeholder}}`);
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

  it('both outputs include the roster header and the zos_sysprog row', () => {
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    for (const [outputPath, content] of outputs) {
      assert.ok(
        content.includes('| Agent | Focus | Capability Tier |'),
        `${outputPath}: missing roster header`
      );
      assert.ok(content.includes('`zos_sysprog`'), `${outputPath}: missing zos_sysprog row`);
    }
  });

  it('reproduces the committed context files byte-for-byte', () => {
    const fs = require('node:fs');
    const outputs = outputsByPath(buildContentFileOutputs({ gemini, qwen }, SRC));
    for (const [outputPath, content] of outputs) {
      const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
      assert.equal(content, committed, outputPath);
    }
  });

  it('skips runtimes without contextFile metadata', () => {
    const outputs = buildContentFileOutputs({ gemini }, SRC);
    assert.deepEqual(outputs.map((output) => output.outputPath), ['GEMINI.md']);
  });
});
