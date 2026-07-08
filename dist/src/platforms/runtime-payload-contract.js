const TOPOLOGY_DECISION = Object.freeze({
    id: 'option-1-typescript-dist-terminal',
    date: '2026-07-07',
    mode: 'typescript-dist-terminal',
    canonicalSource: 'src/**/*.ts plus canonical runtime Markdown/templates under src/',
    runtimeFormat: 'NodeNext ESM JavaScript emitted under dist/src/',
    note: 'Runtime bins and public MCP wrappers execute compiled dist/src output; package and release artifacts ship dist/src runtime entries plus public generated surfaces, not package-root raw src.',
});
const PLANNED_TOPOLOGY_DECISION = Object.freeze({
    id: 'option-1-typescript-dist-terminal',
    date: '2026-07-07',
    mode: 'typescript-dist-terminal',
    canonicalSource: 'src/**/*.ts',
    runtimeFormat: 'NodeNext ESM JavaScript emitted under dist/src/',
    note: 'Approved Option 1 target: TypeScript source remains human-authored while public bins, MCP wrappers, and package/release artifacts execute compiled dist/src output.',
});
const RUNTIME_PAYLOAD_CONTRACT = Object.freeze([
    {
        name: 'gemini',
        startup: {
            manifest: 'gemini-extension.json',
            command: 'npx',
            args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
            entrypoint: 'dist/src/bin/maestro-mcp-server.js',
        },
        content: {
            provider: 'filesystem',
            srcRoot: 'dist/src',
        },
        generatedSurfaces: [
            'agents/',
            'commands/',
            'hooks/',
            'mcp/',
            'policies/',
            'GEMINI.md',
            'gemini-extension.json',
        ],
        packageInvariants: [
            'dist/src/bin/maestro-mcp-server.js',
            'dist/src/mcp/maestro-server.js',
            'gemini-extension.json',
            'mcp/maestro-server.js',
        ],
        docs: ['docs/runtime-gemini.md', 'GEMINI.md'],
    },
    {
        name: 'claude',
        startup: {
            manifest: 'claude/.mcp.json',
            command: 'npx',
            args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
            entrypoint: 'dist/src/bin/maestro-mcp-server.js',
        },
        content: {
            provider: 'filesystem',
            srcRoot: 'dist/src',
        },
        generatedSurfaces: [
            '.claude-plugin/marketplace.json',
            '.claude-plugin/plugin.json',
            'claude/.mcp.json',
            'claude/agents/',
            'claude/hooks/',
            'claude/mcp/',
            'claude/scripts/',
            'claude/skills/',
        ],
        packageInvariants: [
            '.claude-plugin/plugin.json',
            'claude/.mcp.json',
            'claude/mcp/maestro-server.js',
            'dist/src/bin/maestro-mcp-server.js',
            'dist/src/mcp/maestro-server.js',
        ],
        docs: ['docs/runtime-claude.md', 'claude/README.md'],
    },
    {
        name: 'codex',
        startup: {
            manifest: 'plugins/maestro/.mcp.json',
            command: 'npx',
            args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
            entrypoint: 'dist/src/bin/maestro-mcp-server.js',
        },
        content: {
            provider: 'filesystem',
            srcRoot: 'dist/src',
        },
        generatedSurfaces: [
            '.agents/plugins/marketplace.json',
            'plugins/maestro/.app.json',
            'plugins/maestro/.codex-plugin/plugin.json',
            'plugins/maestro/.mcp.json',
            'plugins/maestro/references/',
            'plugins/maestro/skills/',
        ],
        packageInvariants: [
            'dist/src/bin/maestro-install-codex.js',
            'dist/src/bin/maestro-mcp-server.js',
            'dist/src/mcp/maestro-server.js',
            'plugins/maestro/.codex-plugin/plugin.json',
            'plugins/maestro/.mcp.json',
        ],
        docs: ['docs/runtime-codex.md', 'plugins/maestro/references/runtime-guide.md'],
    },
    {
        name: 'qwen',
        startup: {
            manifest: 'qwen-extension.json',
            command: 'npx',
            args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
            entrypoint: 'dist/src/bin/maestro-mcp-server.js',
        },
        content: {
            provider: 'filesystem',
            srcRoot: 'dist/src',
        },
        generatedSurfaces: [
            'qwen/agents/',
            'qwen/hooks.json',
            'QWEN.md',
            'qwen-extension.json',
            'mcp/',
        ],
        packageInvariants: [
            'dist/src/bin/maestro-mcp-server.js',
            'dist/src/mcp/maestro-server.js',
            'qwen-extension.json',
            'qwen/hooks.json',
            'mcp/maestro-server.js',
        ],
        docs: ['docs/runtime-qwen.md', 'QWEN.md'],
    },
]);
function getRuntimePayloadContract(runtimeName) {
    return RUNTIME_PAYLOAD_CONTRACT.find((runtime) => runtime.name === runtimeName) || null;
}
export { RUNTIME_PAYLOAD_CONTRACT, TOPOLOGY_DECISION, PLANNED_TOPOLOGY_DECISION, getRuntimePayloadContract };
