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
  setFakeHome,
} = require('./helpers');

const DISPATCH_SCRIPT = scriptPath('parallel-dispatch.js');

const GEMINI_STUB = `#!/usr/bin/env node
'use strict';
const fs = require('fs');

const argvFile = process.env.MAESTRO_TEST_ARGV_CAPTURE;
const args = process.argv.slice(2);
const entry = '---\\n' + args.join('\\n') + '\\n';
fs.appendFileSync(argvFile, entry);

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  process.stdout.write('{"status":"ok"}\\n');
});
`;

describe('parallel-dispatch extension .env config fallback', () => {
  let tempDir;
  let dispatchDir;
  let binDir;
  let fakeHome;
  let argvCaptureFile;

  before(() => {
    tempDir = createTempDir('maestro-test-dispatch-fallback-');
    dispatchDir = path.join(tempDir, '.maestro-parallel');
    binDir = path.join(tempDir, 'bin');
    fakeHome = path.join(tempDir, 'home');
    argvCaptureFile = path.join(tempDir, 'gemini-argv.log');

    fs.mkdirSync(path.join(dispatchDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(dispatchDir, 'prompts', 'architect.txt'),
      'Analyze architecture and return a concise summary.'
    );
    fs.writeFileSync(
      path.join(dispatchDir, 'prompts', 'coder.txt'),
      'Implement a focused code update and report changes.'
    );

    const extEnvDir = path.join(fakeHome, '.gemini', 'extensions', 'maestro');
    fs.mkdirSync(extEnvDir, { recursive: true });
    fs.writeFileSync(
      path.join(extEnvDir, '.env'),
      [
        'MAESTRO_DEFAULT_MODEL=gemini-ext-fallback-model',
        'MAESTRO_AGENT_TIMEOUT=2',
        'MAESTRO_MAX_CONCURRENT=0',
        'MAESTRO_STAGGER_DELAY=1',
      ].join('\n') + '\n'
    );

    createGeminiStub(binDir, GEMINI_STUB);
  });

  after(() => {
    removeTempDir(tempDir);
  });

  it('reads model and stagger delay from extension .env when not set in environment', () => {
    const existingPath = process.env.PATH || '';

    const env = { ...process.env };
    delete env.MAESTRO_DEFAULT_MODEL;
    delete env.MAESTRO_AGENT_TIMEOUT;
    delete env.MAESTRO_MAX_CONCURRENT;
    delete env.MAESTRO_STAGGER_DELAY;

    env.PATH = `${binDir}${path.delimiter}${existingPath}`;
    setFakeHome(env, fakeHome);
    env.MAESTRO_TEST_ARGV_CAPTURE = argvCaptureFile;

    const { stdout, stderr, exitCode } = runScriptWithExit(
      DISPATCH_SCRIPT,
      [dispatchDir],
      { env, timeout: 60000 }
    );

    assert.equal(exitCode, 0, `Expected exit 0 but got ${exitCode}.\nstderr: ${stderr}`);

    assert.ok(
      stderr.includes('Model: gemini-ext-fallback-model'),
      `Expected stderr to contain "Model: gemini-ext-fallback-model".\nstderr: ${stderr}`
    );

    assert.ok(
      stderr.includes('Stagger Delay: 1s'),
      `Expected stderr to contain "Stagger Delay: 1s".\nstderr: ${stderr}`
    );

    assert.ok(
      !stderr.includes('bad array subscript'),
      `Unexpected bash compatibility error in stderr.\nstderr: ${stderr}`
    );

    const capturedRaw = fs.readFileSync(argvCaptureFile, 'utf8');
    const invocations = capturedRaw
      .split('---')
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => block.split('\n').filter((line) => line.length > 0));

    assert.equal(
      invocations.length,
      2,
      `Expected 2 gemini invocations but got ${invocations.length}.\nRaw capture:\n${capturedRaw}`
    );

    for (let idx = 0; idx < invocations.length; idx++) {
      const args = invocations[idx];

      assert.ok(
        args.includes('--approval-mode=yolo'),
        `Invocation #${idx + 1} missing --approval-mode=yolo.\nArgs: ${JSON.stringify(args)}`
      );

      const modelFlagIdx = args.indexOf('-m');
      assert.notEqual(
        modelFlagIdx,
        -1,
        `Invocation #${idx + 1} missing -m flag.\nArgs: ${JSON.stringify(args)}`
      );
      assert.equal(
        args[modelFlagIdx + 1],
        'gemini-ext-fallback-model',
        `Invocation #${idx + 1} model mismatch.\nArgs: ${JSON.stringify(args)}`
      );
    }
  });
});
