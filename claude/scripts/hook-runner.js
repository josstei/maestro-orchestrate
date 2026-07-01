'use strict';

const path = require('node:path');

const extensionRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

process.env.MAESTRO_EXTENSION_PATH = extensionRoot;
require('../../src/platforms/shared/hook-runner.js');
