'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../src/mcp/maestro-server.js');
const bundledEntry = path.resolve(__dirname, '../src/mcp/maestro-server.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry).main();
