#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { resolveSetting } = require('../src/lib/settings');
const { runWithTimeout } = require('../src/lib/process');
const { log } = require('../src/lib/logger');
const { DEFAULT_TIMEOUT_MINS, DEFAULT_STAGGER_DELAY_SECS, MAX_PROMPT_SIZE_BYTES } = require('../src/lib/constants');

const SCRIPT_DIR = __dirname;
const EXTENSION_DIR = path.dirname(SCRIPT_DIR);
const AGENTS_DIR = path.join(EXTENSION_DIR, 'agents');

function usage() {
  process.stderr.write(`Usage: parallel-dispatch.js <dispatch-dir>

Dispatches Gemini CLI agents in parallel from prompt files.

Setup:
  1. Create dispatch directory with prompt files:
     <dispatch-dir>/prompts/agent-a.txt
     <dispatch-dir>/prompts/agent-b.txt

  2. Run: node parallel-dispatch.js <dispatch-dir>

Results:
  <dispatch-dir>/results/agent-a.json    (structured output)
  <dispatch-dir>/results/agent-a.exit    (exit code)
  <dispatch-dir>/results/agent-a.log     (stderr/debug)
  <dispatch-dir>/results/summary.json    (batch summary)

Environment:
  MAESTRO_DEFAULT_MODEL      Override model for all agents
  MAESTRO_WRITER_MODEL       Override model for technical_writer agent only
  MAESTRO_AGENT_TIMEOUT      Timeout in minutes (default: 10)
  MAESTRO_CLEANUP_DISPATCH   Remove prompt files after dispatch (default: false)
  MAESTRO_MAX_CONCURRENT     Max agents running simultaneously (default: 0 = unlimited)
  MAESTRO_STAGGER_DELAY      Seconds between agent launches (default: 5)
  MAESTRO_GEMINI_EXTRA_ARGS  Space-separated extra Gemini CLI args
`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();
  const dispatchDir = process.argv[2];
  if (!dispatchDir) usage();

  const promptDir = path.join(dispatchDir, 'prompts');
  const resultDir = path.join(dispatchDir, 'results');

  if (!fs.existsSync(promptDir) || !fs.statSync(promptDir).isDirectory()) {
    process.stderr.write(`ERROR: No prompts directory found at ${promptDir}\n`);
    usage();
  }

  const promptFiles = fs.readdirSync(promptDir)
    .filter((f) => !f.startsWith('.'))
    .sort()
    .map((f) => path.join(promptDir, f));

  if (promptFiles.length === 0) {
    process.stderr.write(`ERROR: No prompt files found in ${promptDir}\n`);
    process.exit(1);
  }

  fs.mkdirSync(resultDir, { recursive: true });
  const projectRoot = process.cwd();

  const defaultModel = resolveSetting('MAESTRO_DEFAULT_MODEL', projectRoot) || '';
  const writerModel = resolveSetting('MAESTRO_WRITER_MODEL', projectRoot) || '';
  const agentTimeoutRaw = resolveSetting('MAESTRO_AGENT_TIMEOUT', projectRoot) || String(DEFAULT_TIMEOUT_MINS);
  const maxConcurrentRaw = resolveSetting('MAESTRO_MAX_CONCURRENT', projectRoot) || '0';
  const staggerDelayRaw = resolveSetting('MAESTRO_STAGGER_DELAY', projectRoot) || String(DEFAULT_STAGGER_DELAY_SECS);
  const extraArgsRaw = resolveSetting('MAESTRO_GEMINI_EXTRA_ARGS', projectRoot) || '';

  const timeoutMins = parseInt(agentTimeoutRaw, 10);
  if (isNaN(timeoutMins) || timeoutMins <= 0) {
    process.stderr.write(`ERROR: MAESTRO_AGENT_TIMEOUT must be a positive integer (got: ${agentTimeoutRaw})\n`);
    process.exit(1);
  }
  if (timeoutMins > 60) {
    process.stderr.write(`WARNING: Agent timeout set to ${timeoutMins} minutes (over 1 hour)\n`);
  }
  const timeoutMs = timeoutMins * 60 * 1000;

  const maxConcurrent = parseInt(maxConcurrentRaw, 10);
  if (isNaN(maxConcurrent) || maxConcurrent < 0) {
    process.stderr.write(`ERROR: MAESTRO_MAX_CONCURRENT must be a non-negative integer (got: ${maxConcurrentRaw})\n`);
    process.exit(1);
  }

  const staggerDelay = parseInt(staggerDelayRaw, 10);
  if (isNaN(staggerDelay) || staggerDelay < 0) {
    process.stderr.write(`ERROR: MAESTRO_STAGGER_DELAY must be a non-negative integer (got: ${staggerDelayRaw})\n`);
    process.exit(1);
  }

  const extraArgs = extraArgsRaw ? extraArgsRaw.split(/\s+/).filter(Boolean) : [];
  const hasExtraArgs = extraArgs.length > 0;

  if (hasExtraArgs && extraArgs.some((a) => a === '--allowed-tools' || a.startsWith('--allowed-tools='))) {
    process.stderr.write('WARNING: --allowed-tools is deprecated in gemini-cli; prefer --policy <path> with the Policy Engine.\n');
  }

  const concurrentDisplay = maxConcurrent === 0 ? 'unlimited' : String(maxConcurrent);
  log('INFO', 'MAESTRO PARALLEL DISPATCH');
  log('INFO', '=========================');
  log('INFO', `Agents: ${promptFiles.length}`);
  log('INFO', `Timeout: ${timeoutMins} minutes`);
  log('INFO', `Model: ${defaultModel || 'default'}`);
  if (writerModel) log('INFO', `Writer Model: ${writerModel}`);
  log('INFO', `Max Concurrent: ${concurrentDisplay}`);
  log('INFO', `Stagger Delay: ${staggerDelay}s`);
  if (hasExtraArgs) log('INFO', `Extra Gemini Args: ${extraArgsRaw}`);
  log('INFO', `Project Root: ${projectRoot}`);

  const agentPromises = [];
  let activeCount = 0;
  const slotWaiters = [];

  function releaseSlot() {
    activeCount--;
    if (slotWaiters.length > 0) {
      const waiter = slotWaiters.shift();
      waiter();
    }
  }

  function waitForSlot() {
    if (maxConcurrent === 0 || activeCount < maxConcurrent) {
      activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      slotWaiters.push(() => {
        activeCount++;
        resolve();
      });
    });
  }

  for (let i = 0; i < promptFiles.length; i++) {
    const promptFile = promptFiles[i];
    const basename = path.basename(promptFile).replace(/\.[^.]+$/, '');
    const agentName = basename.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!agentName) {
      process.stderr.write(`ERROR: Prompt file ${path.basename(promptFile)} produces empty agent name after sanitization\n`);
      process.exit(1);
    }
    const normalizedName = agentName.replace(/-/g, '_');
    if (fs.existsSync(AGENTS_DIR) && !fs.existsSync(path.join(AGENTS_DIR, `${normalizedName}.md`))) {
      process.stderr.write(`ERROR: Agent '${agentName}' not found in ${AGENTS_DIR}/\n`);
      try {
        const available = fs.readdirSync(AGENTS_DIR)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace(/\.md$/, ''))
          .join(', ');
        if (available) process.stderr.write(`  Available agents: ${available}\n`);
      } catch {}
      process.exit(1);
    }

    const promptSize = fs.statSync(promptFile).size;
    if (promptSize > MAX_PROMPT_SIZE_BYTES) {
      process.stderr.write(`ERROR: Prompt file ${agentName} exceeds 1MB size limit (${promptSize} bytes)\n`);
      process.exit(1);
    }

    const promptContent = fs.readFileSync(promptFile, 'utf8');
    if (!promptContent.trim()) {
      process.stderr.write(`ERROR: Prompt file ${agentName} is empty or whitespace-only\n`);
      process.exit(1);
    }

    await waitForSlot();

    log('INFO', `Dispatching: ${agentName}`);

    const resultJson = path.join(resultDir, `${agentName}.json`);
    const resultExit = path.join(resultDir, `${agentName}.exit`);
    const resultLog = path.join(resultDir, `${agentName}.log`);

    let modelFlags = [];
    if (normalizedName === 'technical_writer' && writerModel) {
      modelFlags = ['-m', writerModel];
    } else if (defaultModel) {
      modelFlags = ['-m', defaultModel];
    }

    const geminiArgs = [
      '--approval-mode=yolo',
      '--output-format', 'json',
      ...modelFlags,
      ...extraArgs,
    ];

    const stdinPayload = `PROJECT ROOT: ${projectRoot}\nAll file paths in this task are relative to this directory. When using write_file, replace, or read_file, construct absolute paths by prepending this root. When using run_shell_command, execute from this directory.\n\n${promptContent}`;

    const stdinStream = Readable.from([stdinPayload]);
    const stdoutFd = fs.openSync(resultJson, 'w');
    const stderrFd = fs.openSync(resultLog, 'w');

    function closeFds() {
      try { fs.closeSync(stdoutFd); } catch {}
      try { fs.closeSync(stderrFd); } catch {}
    }

    const agentPromise = runWithTimeout(
      'gemini',
      geminiArgs,
      {
        stdin: stdinStream,
        stdout: stdoutFd,
        stderr: stderrFd,
        cwd: projectRoot,
        env: { ...process.env, MAESTRO_CURRENT_AGENT: normalizedName },
      },
      timeoutMs
    ).then((result) => {
      closeFds();
      fs.writeFileSync(resultExit, String(result.exitCode));
      releaseSlot();
      return { agentName, ...result };
    }, (err) => {
      closeFds();
      releaseSlot();
      log('ERROR', `Agent ${agentName} dispatch failed: ${err.message}`);
      fs.writeFileSync(resultExit, '255');
      return { agentName, exitCode: 255, timedOut: false };
    });

    agentPromises.push(agentPromise);

    if (staggerDelay > 0 && i < promptFiles.length - 1) {
      await sleep(staggerDelay * 1000);
    }
  }

  log('INFO', 'All agents dispatched. Waiting for completion...');

  const results = await Promise.all(agentPromises);
  let failures = 0;

  for (const result of results) {
    if (result.exitCode === 0) {
      log('INFO', `  ${result.agentName}: SUCCESS (exit 0)`);
    } else if (result.timedOut) {
      log('INFO', `  ${result.agentName}: TIMEOUT (exceeded ${timeoutMins}m)`);
      failures++;
    } else {
      log('INFO', `  ${result.agentName}: FAILED (exit ${result.exitCode})`);
      failures++;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const succeeded = results.length - failures;
  const batchStatus = failures === 0 ? 'success' : 'partial_failure';

  log('INFO', 'BATCH COMPLETE');
  log('INFO', `  Total agents: ${results.length}`);
  log('INFO', `  Succeeded: ${succeeded}`);
  log('INFO', `  Failed: ${failures}`);
  log('INFO', `  Wall time: ${elapsed}s`);

  const agents = results.map((r) => ({
    name: r.agentName,
    exit_code: r.exitCode,
    status: r.timedOut ? 'timeout' : (r.exitCode === 0 ? 'success' : 'failed'),
  }));

  const summary = {
    batch_status: batchStatus,
    total_agents: results.length,
    succeeded,
    failed: failures,
    wall_time_seconds: elapsed,
    agents,
  };

  fs.writeFileSync(path.join(resultDir, 'summary.json'), JSON.stringify(summary) + '\n');

  log('INFO', `Results: ${path.join(resultDir, 'summary.json')}`);

  const cleanupSetting = resolveSetting('MAESTRO_CLEANUP_DISPATCH', projectRoot) || 'false';
  if (cleanupSetting === 'true') {
    if (path.basename(promptDir) === 'prompts') {
      fs.rmSync(promptDir, { recursive: true, force: true });
      log('INFO', 'Prompt files cleaned up (MAESTRO_CLEANUP_DISPATCH=true)');
    } else {
      process.stderr.write(`WARNING: Skipped cleanup — PROMPT_DIR does not match expected pattern: ${promptDir}\n`);
    }
  }

  process.exit(failures);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
