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
const fs = require('fs');

const argvFile = process.env.MAESTRO_TEST_ARGV_CAPTURE;
const stdinFile = process.env.MAESTRO_TEST_STDIN_CAPTURE;

fs.writeFileSync(argvFile, JSON.stringify(process.argv.slice(2)));

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(stdinFile, data);
  process.stdout.write('{"status":"ok"}\\n');
});
`;

describe('parallel-dispatch argument forwarding', () => {
  let tempDir;
  let dispatchDir;
  let binDir;
  let argvCaptureFile;
  let stdinCaptureFile;

  before(() => {
    tempDir = createTempDir('maestro-test-dispatch-args-');
    dispatchDir = path.join(tempDir, '.maestro-parallel');
    binDir = path.join(tempDir, 'bin');
    argvCaptureFile = path.join(tempDir, 'gemini-argv.json');
    stdinCaptureFile = path.join(tempDir, 'gemini-stdin.txt');

    fs.mkdirSync(path.join(dispatchDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(dispatchDir, 'prompts', 'architect.txt'),
      'Review the project architecture and produce a concise summary.'
    );

    createGeminiStub(binDir, GEMINI_STUB);
  });

  after(() => {
    removeTempDir(tempDir);
  });

  it('enforces concurrency gate when MAESTRO_MAX_CONCURRENT is set', () => {
    const concurrencyTempDir = createTempDir('maestro-test-dispatch-concurrency-');
    const concurrencyDispatchDir = path.join(concurrencyTempDir, '.maestro-parallel');
    const concurrencyBinDir = path.join(concurrencyTempDir, 'bin');
    const concurrencyLogFile = path.join(concurrencyTempDir, 'concurrency-log.txt');

    fs.mkdirSync(path.join(concurrencyDispatchDir, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(concurrencyDispatchDir, 'prompts', 'architect.txt'),
      'Task for architect agent.'
    );
    fs.writeFileSync(
      path.join(concurrencyDispatchDir, 'prompts', 'coder.txt'),
      'Task for coder agent.'
    );
    fs.writeFileSync(
      path.join(concurrencyDispatchDir, 'prompts', 'tester.txt'),
      'Task for tester agent.'
    );

    const concurrencyStub = `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const logFile = process.env.MAESTRO_TEST_CONCURRENCY_LOG;
const agent = process.env.MAESTRO_CURRENT_AGENT || 'unknown';
fs.appendFileSync(logFile, 'START:' + agent + ':' + Date.now() + '\\n');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  setTimeout(() => {
    fs.appendFileSync(logFile, 'END:' + agent + ':' + Date.now() + '\\n');
    process.stdout.write('{"status":"ok"}\\n');
  }, 200);
});
`;
    createGeminiStub(concurrencyBinDir, concurrencyStub);

    try {
      const existingPath = process.env.PATH || '';
      const { exitCode } = runScriptWithExit(
        DISPATCH_SCRIPT,
        [concurrencyDispatchDir],
        {
          env: {
            PATH: `${concurrencyBinDir}${path.delimiter}${existingPath}`,
            MAESTRO_AGENT_TIMEOUT: '2',
            MAESTRO_MAX_CONCURRENT: '1',
            MAESTRO_STAGGER_DELAY: '0',
            MAESTRO_TEST_CONCURRENCY_LOG: concurrencyLogFile,
          },
          timeout: 30000,
        }
      );

      assert.equal(exitCode, 0);

      const logContent = fs.readFileSync(concurrencyLogFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(Boolean);
      const events = lines.map((line) => {
        const [type, agent, ts] = line.split(':');
        return { type, agent, ts: Number(ts) };
      });

      const starts = events.filter((e) => e.type === 'START');
      const ends = events.filter((e) => e.type === 'END');

      assert.equal(starts.length, 3, `Expected 3 START events but got ${starts.length}`);
      assert.equal(ends.length, 3, `Expected 3 END events but got ${ends.length}`);

      for (let i = 1; i < starts.length; i++) {
        const prevEnd = ends[i - 1].ts;
        const currStart = starts[i].ts;
        assert.ok(
          currStart >= prevEnd,
          `Agent ${starts[i].agent} started at ${currStart} before previous agent ended at ${prevEnd} — concurrency gate violated`
        );
      }
    } finally {
      removeTempDir(concurrencyTempDir);
    }
  });

  it('forwards all expected args and streams prompt payload over stdin', () => {
    const existingPath = process.env.PATH || '';
    const { stdout, exitCode } = runScriptWithExit(
      DISPATCH_SCRIPT,
      [dispatchDir],
      {
        env: {
          PATH: `${binDir}${path.delimiter}${existingPath}`,
          MAESTRO_TEST_ARGV_CAPTURE: argvCaptureFile,
          MAESTRO_TEST_STDIN_CAPTURE: stdinCaptureFile,
          MAESTRO_DEFAULT_MODEL: 'gemini-2.5-pro',
          MAESTRO_GEMINI_EXTRA_ARGS: '--sandbox --policy .gemini/policies/maestro.toml',
          MAESTRO_AGENT_TIMEOUT: '2',
          MAESTRO_MAX_CONCURRENT: '1',
          MAESTRO_STAGGER_DELAY: '0',
        },
        timeout: 30000,
      }
    );

    assert.equal(exitCode, 0, `Expected exit 0 but got ${exitCode}.\nstdout: ${stdout}`);

    const capturedArgv = JSON.parse(fs.readFileSync(argvCaptureFile, 'utf8'));

    assert.ok(
      capturedArgv.includes('--approval-mode=yolo'),
      `Missing --approval-mode=yolo in argv: ${JSON.stringify(capturedArgv)}`
    );

    const outputFormatIdx = capturedArgv.indexOf('--output-format');
    assert.notEqual(outputFormatIdx, -1, `Missing --output-format in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[outputFormatIdx + 1],
      'json',
      `Expected --output-format json but got: ${capturedArgv[outputFormatIdx + 1]}`
    );

    const modelFlagIdx = capturedArgv.indexOf('-m');
    assert.notEqual(modelFlagIdx, -1, `Missing -m flag in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[modelFlagIdx + 1],
      'gemini-2.5-pro',
      `Expected model gemini-2.5-pro but got: ${capturedArgv[modelFlagIdx + 1]}`
    );

    assert.ok(
      capturedArgv.includes('--sandbox'),
      `Missing --sandbox in argv: ${JSON.stringify(capturedArgv)}`
    );

    const policyIdx = capturedArgv.indexOf('--policy');
    assert.notEqual(policyIdx, -1, `Missing --policy in argv: ${JSON.stringify(capturedArgv)}`);
    assert.equal(
      capturedArgv[policyIdx + 1],
      '.gemini/policies/maestro.toml',
      `Expected policy path .gemini/policies/maestro.toml but got: ${capturedArgv[policyIdx + 1]}`
    );

    assert.ok(
      !capturedArgv.includes('--prompt'),
      `Unexpected deprecated --prompt flag found in argv: ${JSON.stringify(capturedArgv)}`
    );

    const stdinPayload = fs.readFileSync(stdinCaptureFile, 'utf8');
    assert.ok(
      stdinPayload.includes('PROJECT ROOT:'),
      `Expected stdin to contain PROJECT ROOT preamble.\nstdin: ${stdinPayload}`
    );
    assert.ok(
      stdinPayload.includes('Review the project architecture'),
      `Expected stdin to contain prompt file content.\nstdin: ${stdinPayload}`
    );

    const resultFile = path.join(dispatchDir, 'results', 'architect.json');
    assert.ok(
      fs.existsSync(resultFile),
      `Expected result file to exist at: ${resultFile}`
    );
  });

  it('rejects non-numeric values for numeric settings', () => {
    const existingPath = process.env.PATH || '';
    const baseEnv = {
      PATH: `${binDir}${path.delimiter}${existingPath}`,
      MAESTRO_AGENT_TIMEOUT: '2',
      MAESTRO_MAX_CONCURRENT: '1',
      MAESTRO_STAGGER_DELAY: '0',
    };

    const cases = [
      {
        key: 'MAESTRO_AGENT_TIMEOUT',
        value: '1minutes',
        expectedMessage: 'MAESTRO_AGENT_TIMEOUT must be a positive integer',
      },
      {
        key: 'MAESTRO_MAX_CONCURRENT',
        value: '2workers',
        expectedMessage: 'MAESTRO_MAX_CONCURRENT must be a non-negative integer',
      },
      {
        key: 'MAESTRO_STAGGER_DELAY',
        value: '5s',
        expectedMessage: 'MAESTRO_STAGGER_DELAY must be a non-negative integer',
      },
    ];

    for (const testCase of cases) {
      const env = { ...baseEnv, [testCase.key]: testCase.value };
      const { exitCode, stderr } = runScriptWithExit(
        DISPATCH_SCRIPT,
        [dispatchDir],
        { env, timeout: 30000 }
      );

      assert.notEqual(
        exitCode,
        0,
        `Expected non-zero exit for ${testCase.key}=${testCase.value}`
      );
      assert.ok(
        stderr.includes(testCase.expectedMessage),
        `Expected stderr to include "${testCase.expectedMessage}".\nstderr: ${stderr}`
      );
      assert.ok(
        stderr.includes(testCase.value),
        `Expected stderr to include rejected value "${testCase.value}".\nstderr: ${stderr}`
      );
    }
  });
});
