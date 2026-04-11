'use strict';
const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../../src/platforms/shared/adapters/claude-adapter.js');
const bundledEntry = path.resolve(__dirname, '../../src/platforms/shared/adapters/claude-adapter.js');
module.exports = require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry);
