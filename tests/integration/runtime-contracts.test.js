'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'runtime-contracts');

const RUNTIMES = [
  {
    name: 'claude',
    probeModule: '../../src/platforms/claude/contract-probe',
    probeName: 'probeClaudeContract',
    configModule: '../../src/platforms/claude/runtime-config',
  },
  {
    name: 'codex',
    probeModule: '../../src/platforms/codex/contract-probe',
    probeName: 'probeCodexContract',
    configModule: '../../src/platforms/codex/runtime-config',
  },
  {
    name: 'gemini',
    probeModule: '../../src/platforms/gemini/contract-probe',
    probeName: 'probeGeminiContract',
    configModule: '../../src/platforms/gemini/runtime-config',
  },
  {
    name: 'qwen',
    probeModule: '../../src/platforms/qwen/contract-probe',
    probeName: 'probeQwenContract',
    configModule: '../../src/platforms/qwen/runtime-config',
  },
];

const {
  verifyConfigAgainstContract,
} = require('../../src/platforms/shared/contract-probes/verify-config');

for (const r of RUNTIMES) {
  describe(`runtime contract: ${r.name}`, () => {
    const fixturePath = path.join(FIXTURE_DIR, r.name, 'request-payload.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const probeFn = require(r.probeModule)[r.probeName];
    const config = require(r.configModule);

    if (fixture.stub === true) {
      it.skip(`${r.name}: fixture is stub — real probe pending follow-up PR`);
      return;
    }

    it(`${r.name}: probe extracts contract from fixture`, () => {
      assert.doesNotThrow(() => probeFn(fixture));
    });

    it(`${r.name}: runtime-config matches captured contract`, () => {
      const contract = probeFn(fixture);
      assert.doesNotThrow(
        () => verifyConfigAgainstContract(config, contract),
        `${r.name} runtime-config drifted from captured contract`
      );
    });
  });
}
