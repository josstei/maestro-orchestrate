#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { resolveDispatchConfig } = require('../src/lib/config/dispatch-config-resolver');
const { ConcurrencyLimiter } = require('../src/lib/dispatch/concurrency-limiter');
const { resolveSetting } = require('../src/lib/config/setting-resolver');
const { runWithTimeout } = require('../src/lib/dispatch/process-runner');
const { log, fatal } = require('../src/lib/core/logger');

const MAX_PROMPT_SIZE_BYTES = 1_000_000;

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
    fatal(`No prompt files found in ${promptDir}`);
  }

  fs.mkdirSync(resultDir, { recursive: true });
  const projectRoot = process.cwd();

  const config = resolveDispatchConfig(projectRoot);

  if (config.timeoutMins > 60) {
    process.stderr.write(`WARNING: Agent timeout set to ${config.timeoutMins} minutes (over 1 hour)\n`);
  }

  if (config.extraArgs.length > 0 && config.extraArgs.some((a) => a === '--allowed-tools' || a.startsWith('--allowed-tools='))) {
    process.stderr.write('WARNING: --allowed-tools is deprecated in gemini-cli; prefer --policy <path> with the Policy Engine.\n');
  }

  const concurrentDisplay = config.maxConcurrent === 0 ? 'unlimited' : String(config.maxConcurrent);
  log('INFO', 'MAESTRO PARALLEL DISPATCH');
  log('INFO', '=========================');
  log('INFO', `Agents: ${promptFiles.length}`);
  log('INFO', `Timeout: ${config.timeoutMins} minutes`);
  log('INFO', `Model: ${config.defaultModel || 'default'}`);
  if (config.writerModel) log('INFO', `Writer Model: ${config.writerModel}`);
  log('INFO', `Max Concurrent: ${concurrentDisplay}`);
  log('INFO', `Stagger Delay: ${config.staggerDelay}s`);
  if (config.extraArgs.length > 0) log('INFO', `Extra CLI Args: ${config.extraArgsRaw}`);
  log('INFO', `Project Root: ${projectRoot}`);

  const limiter = new ConcurrencyLimiter(config.maxConcurrent);
  const agentPromises = [];

  for (let i = 0; i < promptFiles.length; i++) {
    const promptFile = promptFiles[i];
    const basename = path.basename(promptFile).replace(/\.[^.]+$/, '');
    const agentName = basename.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!agentName) {
      fatal(`Prompt file ${path.basename(promptFile)} produces empty agent name after sanitization`);
    }
    const normalizedName = agentName.replace(/-/g, '_');
    if (fs.existsSync(AGENTS_DIR) && !fs.existsSync(path.join(AGENTS_DIR, `${normalizedName}.md`))) {
      let msg = `Agent '${agentName}' not found in ${AGENTS_DIR}/`;
      try {
        const available = fs.readdirSync(AGENTS_DIR)
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace(/\.md$/, ''))
          .join(', ');
        if (available) msg += `\n  Available agents: ${available}`;
      } catch {}
      fatal(msg);
    }

    const promptSize = fs.statSync(promptFile).size;
    if (promptSize > MAX_PROMPT_SIZE_BYTES) {
      fatal(`Prompt file ${agentName} exceeds 1MB size limit (${promptSize} bytes)`);
    }

    const promptContent = fs.readFileSync(promptFile, 'utf8');
    if (!promptContent.trim()) {
      fatal(`Prompt file ${agentName} is empty or whitespace-only`);
    }

    await limiter.acquire();

    log('INFO', `Dispatching: ${agentName}`);

    const resultJson = path.join(resultDir, `${agentName}.json`);
    const resultExit = path.join(resultDir, `${agentName}.exit`);
    const resultLog = path.join(resultDir, `${agentName}.log`);

    let modelFlags = [];
    if (normalizedName === 'technical_writer' && config.writerModel) {
      modelFlags = ['-m', config.writerModel];
    } else if (config.defaultModel) {
      modelFlags = ['-m', config.defaultModel];
    }

    const geminiArgs = [
      '--approval-mode=yolo',
      '--output-format', 'json',
      ...modelFlags,
      ...config.extraArgs,
    ];

    const stdinPayload = `PROJECT ROOT: ${projectRoot}\nAll file paths in this task are relative to this directory. When using write_file, replace, or read_file, construct absolute paths by prepending this root. When using run_shell_command, execute from this directory.\n\n${promptContent}`;

    const stdinStream = Readable.from([stdinPayload]);
    const stdoutFd = fs.openSync(resultJson, 'w');
    let stderrFd;
    try {
      stderrFd = fs.openSync(resultLog, 'w');
    } catch (err) {
      fs.closeSync(stdoutFd);
      throw err;
    }

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
      config.timeoutMs
    ).then((result) => {
      closeFds();
      fs.writeFileSync(resultExit, String(result.exitCode));
      limiter.release();
      return { agentName, ...result };
    }, (err) => {
      closeFds();
      limiter.release();
      log('ERROR', `Agent ${agentName} dispatch failed: ${err.message}`);
      fs.writeFileSync(resultExit, '255');
      return { agentName, exitCode: 255, timedOut: false };
    });

    agentPromises.push(agentPromise);

    if (config.staggerDelay > 0 && i < promptFiles.length - 1) {
      await sleep(config.staggerDelay * 1000);
    }
  }

  log('INFO', 'All agents dispatched. Waiting for completion...');

  const results = await Promise.all(agentPromises);
  let failures = 0;

  for (const result of results) {
    if (result.exitCode === 0) {
      log('INFO', `  ${result.agentName}: SUCCESS (exit 0)`);
    } else if (result.timedOut) {
      log('INFO', `  ${result.agentName}: TIMEOUT (exceeded ${config.timeoutMins}m)`);
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
