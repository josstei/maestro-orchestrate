'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  scriptPath,
  runScriptWithExit,
  createTempDir,
  createGeminiStub,
  removeTempDir,
} = require('./helpers');

const DISPATCH_SCRIPT = scriptPath('parallel-dispatch.js');

const GEMINI_STUB = `#!/usr/bin/env node
'use strict';
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  process.stderr.write('simulated failure\\n');
  process.exit(2);
});
`;

describe('parallel-dispatch exit code propagation', () => {
  let tempDir;
  let dispatchDir;
  let binDir;

  before(() => {
    tempDir = createTempDir('maestro-test-dispatch-exit-');
    dispatchDir = path.join(tempDir, '.maestro-parallel');
    binDir = path.join(tempDir, 'bin');

    fs.mkdirSync(path.join(dispatchDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(dispatchDir, 'prompts', 'coder.txt'),
      'Perform a task that intentionally fails for test validation.'
    );

    createGeminiStub(binDir, GEMINI_STUB);
  });

  after(() => {
    removeTempDir(tempDir);
  });

  it('exits with count of failed agents and persists agent exit code in result files', () => {
    const existingPath = process.env.PATH || '';
    const { stdout, stderr, exitCode } = runScriptWithExit(
      DISPATCH_SCRIPT,
      [dispatchDir],
      {
        env: {
          PATH: `${binDir}${path.delimiter}${existingPath}`,
          MAESTRO_AGENT_TIMEOUT: '2',
        },
        timeout: 30000,
      }
    );

    assert.equal(exitCode, 1, `Expected dispatch exit code 1 (one failed agent) but got ${exitCode}.\nstderr: ${stderr}`);

    const agentExitFile = path.join(dispatchDir, 'results', 'coder.exit');
    assert.ok(
      fs.existsSync(agentExitFile),
      `Expected per-agent exit file to exist at: ${agentExitFile}`
    );
    assert.equal(
      fs.readFileSync(agentExitFile, 'utf8').trim(),
      '2',
      `Expected coder.exit to contain "2"`
    );

    const summaryFile = path.join(dispatchDir, 'results', 'summary.json');
    assert.ok(
      fs.existsSync(summaryFile),
      `Expected summary.json to exist at: ${summaryFile}`
    );

    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const coderEntry = summary.agents.find((a) => a.name === 'coder');
    assert.ok(coderEntry, `Expected coder entry in summary.agents.\nsummary: ${JSON.stringify(summary)}`);
    assert.equal(
      coderEntry.exit_code,
      2,
      `Expected coder exit_code 2 in summary but got: ${coderEntry.exit_code}`
    );

    assert.ok(
      stderr.includes('coder: FAILED (exit 2)'),
      `Expected stderr to contain "coder: FAILED (exit 2)".\nstderr: ${stderr}`
    );
  });
});
