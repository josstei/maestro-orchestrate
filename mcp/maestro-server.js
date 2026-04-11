'use strict';

process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'gemini';
require('../src/mcp/maestro-server').main();
