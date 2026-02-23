'use strict';

const { spawn, execSync } = require('child_process');
const { log } = require('../core/logger');

function killProcess(pid, signal = 'SIGTERM') {
  if (pid == null) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, signal);
    }
  } catch {}
}

function runWithTimeout(command, args, options = {}, timeoutMs) {
  if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`timeoutMs must be a positive finite number (got: ${timeoutMs})`);
  }

  return new Promise((resolve) => {
    const { stdin: stdinStream, stdout: stdoutDest, stderr: stderrDest, cwd, env } = options;

    const spawnOptions = {
      stdio: [
        stdinStream ? 'pipe' : 'ignore',
        typeof stdoutDest === 'number' ? stdoutDest : 'ignore',
        typeof stderrDest === 'number' ? stderrDest : 'ignore',
      ],
      cwd,
      env: env || process.env,
      shell: process.platform === 'win32',
    };

    const child = spawn(command, args, spawnOptions);
    let timedOut = false;
    let settled = false;

    let forceKillTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      log('WARN', `Process ${child.pid ?? 'unknown'} timed out after ${timeoutMs}ms`);
      killProcess(child.pid);
      forceKillTimer = setTimeout(() => {
        try {
          process.kill(child.pid, 0);
          killProcess(child.pid, 'SIGKILL');
        } catch {}
      }, 5000);
    }, timeoutMs);

    if (stdinStream && child.stdin) {
      stdinStream.pipe(child.stdin);
    }

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 255),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      log('ERROR', `Process spawn error: ${err.message}`);
      resolve({ exitCode: 255, timedOut: false });
    });
  });
}

module.exports = { runWithTimeout };
