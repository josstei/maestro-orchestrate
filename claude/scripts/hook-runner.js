'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../src/platforms/shared/hook-runner.js');
const bundledEntry = path.resolve(__dirname, '../src/platforms/shared/hook-runner.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry);
