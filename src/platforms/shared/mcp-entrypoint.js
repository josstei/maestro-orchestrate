'use strict';

const { requireFromCanonicalSrc } = require('./canonical-source');

function main() {
  const runtime = process.env.MAESTRO_RUNTIME || process.argv[2] || 'gemini';
  const { runRuntimeServer } = requireFromCanonicalSrc('mcp/maestro-server.js', __dirname);
  runRuntimeServer(runtime);
}

if (require.main === module) {
  main();
}

module.exports = { main };
