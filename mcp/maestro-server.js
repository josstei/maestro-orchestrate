import { main } from '../src/mcp/maestro-server.js';
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'gemini';
main();
