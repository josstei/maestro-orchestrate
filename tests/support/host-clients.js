'use strict';

/**
 * The clientInfo each host sends in `initialize`, from which the server
 * identifies its runtime. Observed from Claude Code 2.1.303, Codex 0.163.0,
 * Qwen Code 0.25.2 and the Antigravity CLI 1.4.2.
 */
const HOST_CLIENTS = Object.freeze({
  antigravity: { name: 'antigravity-client', version: 'v1.0.0' },
  claude: { name: 'claude-code', version: '2.1.303' },
  codex: { name: 'codex-mcp-client', title: 'Codex', version: '0.163.0' },
  // Qwen Code suffixes the server's key in mcpServers.
  qwen: { name: 'qwen-cli-mcp-client-maestro', version: '0.0.1' },
});

module.exports = {
  HOST_CLIENTS,
};
