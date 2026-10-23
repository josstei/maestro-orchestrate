'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLATFORMS_DIR = __dirname;

const RUNTIME_NAMES = fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
  .filter((entry) =>
    fs.existsSync(path.join(PLATFORMS_DIR, entry.name, 'runtime-config.js'))
  )
  .map((entry) => entry.name)
  .sort();

function getRuntimeConfig(name) {
  if (!RUNTIME_NAMES.includes(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  // maestro-dependencies: runtime-configs
  return require(path.join(PLATFORMS_DIR, name, 'runtime-config.js'));
}

/** Whether `clientName` is `pattern`, or starts with it when it ends in `*`. */
function matchesClientName(pattern, clientName) {
  return pattern.endsWith('*')
    ? clientName.startsWith(pattern.slice(0, -1))
    : clientName === pattern;
}

/**
 * The runtime whose config lists the MCP client's `clientInfo.name` (sent by
 * the host in `initialize`) among its `mcpClientNames`, or null when no
 * runtime claims that client.
 * @param {{ name?: unknown } | null | undefined} clientInfo
 * @returns {object | null} Runtime config
 */
function findRuntimeConfigForClient(clientInfo) {
  const clientName = clientInfo && typeof clientInfo.name === 'string' ? clientInfo.name : null;
  if (!clientName) return null;

  const runtimeName = RUNTIME_NAMES.find((name) =>
    (getRuntimeConfig(name).mcpClientNames || []).some((pattern) => matchesClientName(pattern, clientName))
  );
  return runtimeName ? getRuntimeConfig(runtimeName) : null;
}

module.exports = {
  RUNTIME_NAMES,
  getRuntimeConfig,
  findRuntimeConfigForClient,
};
