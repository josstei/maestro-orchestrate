'use strict';

const { requireFromCanonicalSrc } = require('./canonical-source');

function main() {
  const { runRuntimeServer } = requireFromCanonicalSrc('mcp/maestro-server.js', __dirname);
  runRuntimeServer('codex');
}

if (require.main === module) {
  main();
}

module.exports = { main };
