'use strict';

const { spawn, execSync } = require('child_process');
const { log } = require('./logger');

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
}

function forceKillProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {}
}

function runWithTimeout(command, args, options = {}, timeoutMs) {
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
    };

    const child = spawn(command, args, spawnOptions);
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      log('WARN', `Process ${child.pid} timed out after ${timeoutMs}ms`);
      killProcess(child.pid);
      setTimeout(() => {
        try {
          process.kill(child.pid, 0);
          forceKillProcess(child.pid);
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
      resolve({
        exitCode: timedOut ? 124 : (code ?? 255),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log('ERROR', `Process spawn error: ${err.message}`);
      resolve({ exitCode: 255, timedOut: false });
    });
  });
}

module.exports = { runWithTimeout };
