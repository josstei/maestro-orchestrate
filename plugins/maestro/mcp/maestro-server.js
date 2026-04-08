'use strict';

const { fatal } = require('../lib/core/logger');
const { getDefaultRuntimeConfig } = require('../lib/mcp/runtime/runtime-config-map');
const { runServer } = require('./maestro-server-core');

const SRC_RELATIVE_PATHS = Object.freeze({
  gemini: 'src',
  claude: '../src',
  codex: '../../src',
});

function getSrcRelativePath(runtimeConfig) {
  if (!runtimeConfig || !runtimeConfig.name) {
    return SRC_RELATIVE_PATHS.gemini;
  }

  return SRC_RELATIVE_PATHS[runtimeConfig.name] || SRC_RELATIVE_PATHS.gemini;
}

function main() {
  const runtimeConfig = getDefaultRuntimeConfig();
  const srcRelativePath = getSrcRelativePath(runtimeConfig);

  runServer({
    runtimeConfig,
    srcRelativePath,
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fatal(error && error.message ? error.message : String(error));
  }
}

module.exports = {
  SRC_RELATIVE_PATHS,
  getSrcRelativePath,
  main,
};
