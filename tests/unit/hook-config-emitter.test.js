import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildHookConfigOutputs } from '../../src/generator/hook-config-emitter.js';
import gemini from '../../src/platforms/gemini/runtime-config.js';
import qwen from '../../src/platforms/qwen/runtime-config.js';
import codex from '../../src/platforms/codex/runtime-config.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [output.outputPath, output.content]));
}

describe('hook-config-emitter', () => {
  it('reproduces the committed hook configs byte-for-byte', () => {
    const outputs = outputsByPath(buildHookConfigOutputs({ gemini, qwen }));

    assert.deepEqual([...outputs.keys()].sort(), [
      'claude/hooks/claude-hooks.json',
      'hooks/hooks.json',
      'qwen/hooks.json',
    ]);

    for (const outputPath of outputs.keys()) {
      const committed = fs.readFileSync(path.join(ROOT, outputPath), 'utf8');
      assert.equal(outputs.get(outputPath), committed, outputPath);
    }
  });

  it('always emits the claude hook config even when no gemini-family runtime is enabled', () => {
    const outputs = buildHookConfigOutputs({});
    assert.deepEqual(outputs.map((output) => output.outputPath), ['claude/hooks/claude-hooks.json']);
  });

  it('emits only the enabled gemini-family runtime alongside claude', () => {
    const outputs = buildHookConfigOutputs({ qwen });
    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      ['claude/hooks/claude-hooks.json', 'qwen/hooks.json']
    );
  });
});

describe('hook-config-emitter is descriptor-driven', () => {
  it('emits a hook config for any gemini-family runtime named by its descriptor', () => {
    const synthetic = {
      name: 'acme',
      hooks: {
        events: {
          'session-start': 'SessionStart',
          'before-agent': 'BeforeAgent',
          'after-agent': 'AfterAgent',
          'session-end': 'SessionEnd',
        },
        nameSuffix: '-acme',
        descriptionSuffix: ' (Acme)',
      },
      generation: {
        entryPoint: null,
        coreCommand: null,
        hooks: { family: 'gemini-family', configOutputPath: 'acme/hooks.json' },
      },
    };
    const outputs = buildHookConfigOutputs({ acme: synthetic });
    const paths = outputs.map((o) => o.outputPath).sort();
    assert.deepEqual(paths, ['acme/hooks.json', 'claude/hooks/claude-hooks.json']);
    const acme = outputs.find((o) => o.outputPath === 'acme/hooks.json');
    assert.ok(acme.content.includes('maestro-session-start-acme'));
  });

  it('emits no hook config for a runtime whose descriptor declares hooks: null (codex)', () => {
    const outputs = buildHookConfigOutputs({ codex });
    assert.deepEqual(outputs.map((o) => o.outputPath), ['claude/hooks/claude-hooks.json']);
  });
});
