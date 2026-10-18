'use strict';

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'qwen';
require('../src/mcp/maestro-server').main();
