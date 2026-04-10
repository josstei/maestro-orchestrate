const { spawn } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT } = require('./helpers');

function spawnMcpServer(options) {
  const cwd = options.cwd || ROOT;
  const relativePath = options.relativePath;
  const roots = Array.isArray(options.roots)
    ? options.roots.map((root) => {
        if (typeof root === 'string') {
          return {
            uri: pathToFileURL(root).href,
            name: path.basename(root) || root,
          };
        }

        return root;
      })
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
  let stderr = '';
  let ready = false;
  let nextId = 1;
  let settleReady;
  let rejectReady;

  const readyPromise = new Promise((resolve, reject) => {
    settleReady = resolve;
    rejectReady = reject;
  });

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
    stdoutBuffer += chunk.toString('utf8');

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
      settleReady();
    }

    if (stderr.includes('[error] maestro: MCP server failed:')) {
      const error = new Error(stderr.trim());
      if (!ready) {
        rejectReady(error);
      }
      finishPending(error);
    }
  });

  child.on('error', (error) => {
    if (!ready) {
      rejectReady(error);
    }
    finishPending(error);
  });

  child.on('exit', (code, signal) => {
    const error = new Error(
      `${relativePath} exited (code=${code}, signal=${signal}).\nSTDERR:\n${stderr}`
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
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  return {
    child,
    close,
    initialize,
    listTools,
    callTool,
    ready: readyPromise,
    sendNotification,
    sendRequest,
  };
}

module.exports = {
  spawnMcpServer,
};
