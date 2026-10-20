'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoEntry = path.resolve(__dirname, '../../src/platforms/claude/policy-enforcer.js');
const bundledEntry = path.resolve(__dirname, '../src/platforms/claude/policy-enforcer.js');
require(fs.existsSync(repoEntry) ? repoEntry : bundledEntry);
