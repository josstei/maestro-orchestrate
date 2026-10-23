'use strict';

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/session');
const fs = require('node:fs');
const path = require('node:path');

const server = createServer({ toolPacks: [createToolPack] });
process.once('message', async ({ workspace, calls, pauseAfterCommit }) => {
  if (pauseAfterCommit) {
    const rename = fs.renameSync;
    fs.renameSync = function (source, destination) {
      const result = rename.apply(this, arguments);
      if (path.basename(destination) === 'current.json' && path.basename(path.dirname(destination)) === '.maestro') {
        fs.writeSync(1, 'committed\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      return result;
    };
  }
  try {
    const outcomes = [];
    for (const { tool, params } of calls) outcomes.push(await server.callTool(tool, params, workspace));
    process.send({ outcomes }, () => process.disconnect());
  } catch (error) {
    process.send({ failure: error.stack }, () => process.disconnect());
  }
});
process.send({ ready: true });
