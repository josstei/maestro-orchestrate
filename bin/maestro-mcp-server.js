#!/usr/bin/env node
'use strict';

const path = require('node:path');

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
process.env.MAESTRO_EXTENSION_PATH =
  process.env.MAESTRO_EXTENSION_PATH || path.resolve(__dirname, '..');

require('../src/mcp/maestro-server').main();
