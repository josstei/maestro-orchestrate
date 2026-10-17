const { spawn } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT } = require('./helpers');

const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const KILL_GRACE_MS = 250;

function spawnMcpServer(options) {
  const cwd = options.cwd || ROOT;
  const relativePath = options.relativePath;
  const startupTimeoutMs = options.startupTimeoutMs || DEFAULT_STARTUP_TIMEOUT_MS;
  const roots = Array.isArray(options.roots)
    ? options.roots
    : [
        {
          uri: pathToFileURL(cwd).href,
          name: path.basename(cwd) || cwd,
        },
      ];
  const child = spawn(process.execPath, [relativePath], {
    cwd,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stdout = '';
  let stderr = '';
  let ready = false;
  let exited = false;
  let nextId = 1;
  let settleReady;
  let rejectReady;

  const readyPromise = new Promise((resolve, reject) => {
    settleReady = resolve;
    rejectReady = reject;
  });

  const startupTimer = setTimeout(() => {
    rejectReady(
      new Error(
        `Timed out waiting for ${relativePath} to start.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
      )
    );
    close();
  }, startupTimeoutMs);

  const pending = new Map();

  function finishPending(error) {
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  }

  function send(message) {
    child.stdin.write(JSON.stringify(message) + '\n');
  }

  function sendResponse(id, result) {
    send({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  function handleMessage(message) {
    if (message && message.id != null && (message.result !== undefined || message.error !== undefined)) {
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }

      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(JSON.stringify(message.error)));
        return;
      }

      entry.resolve(message.result);
      return;
    }

    if (message && message.method === 'roots/list' && message.id != null) {
      sendResponse(message.id, {
        roots,
      });
    }
  }

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    stdout += text;
    stdoutBuffer += text;

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      handleMessage(JSON.parse(line));
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');

    if (!ready && stderr.includes('[info] maestro: MCP server connected')) {
      ready = true;
      clearTimeout(startupTimer);
      settleReady();
    }
  });

  child.on('error', (error) => {
    clearTimeout(startupTimer);
    if (!ready) {
      rejectReady(error);
    }
    finishPending(error);
  });

  child.on('exit', (code, signal) => {
    exited = true;
    clearTimeout(startupTimer);
    const error = new Error(
      `${relativePath} exited (code=${code}, signal=${signal}).\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
    );

    if (!ready) {
      rejectReady(error);
    }

    finishPending(error);
  });

  async function sendRequest(method, params = {}) {
    const id = nextId++;
    const result = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });

    send({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return result;
  }

  function sendNotification(method, params = {}) {
    send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  async function initialize() {
    const result = await sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {
        roots: {
          listChanged: false,
        },
      },
      clientInfo: {
        name: 'maestro-test',
        version: '0.0.0',
      },
    });

    sendNotification('notifications/initialized');
    return result;
  }

  async function listTools() {
    const result = await sendRequest('tools/list');
    return result.tools || [];
  }

  async function callTool(name, args = {}) {
    const result = await sendRequest('tools/call', {
      name,
      arguments: args,
    });
    const text = result && result.content && result.content[0] ? result.content[0].text : '{}';
    return {
      raw: result,
      parsed: JSON.parse(text),
    };
  }

  async function close() {
    clearTimeout(startupTimer);
    if (exited || child.killed) {
      return;
    }

    child.kill('SIGTERM');
    setTimeout(() => {
      if (!exited) {
        child.kill('SIGKILL');
      }
    }, KILL_GRACE_MS).unref();
  }

  return {
    close,
    initialize,
    listTools,
    callTool,
    ready: readyPromise,
    get stderr() {
      return stderr;
    },
  };
}

module.exports = {
  spawnMcpServer,
};
