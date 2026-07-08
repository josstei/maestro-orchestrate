import { buildGeminiFamilyConfig } from '../shared/gemini-family-config.js';
export default buildGeminiFamilyConfig({
    name: 'qwen',
    outputDir: 'qwen/',
    mcpPrefix: 'mcp_maestro_',
    plan_mode_native: false,
    env: { extensionPath: 'extensionPath', workspacePath: 'workspacePath' },
    generation: {
        entryPoint: null,
        coreCommand: null,
        hooks: {
            family: 'gemini-family',
            configOutputPath: 'qwen/hooks.json',
        },
    },
    tools: {
        google_web_search: 'web_search',
        replace: 'edit',
        ask_user: 'ask_user_question',
        read_many_files: 'read_many_files',
        write_todos: 'todo_write',
        activate_skill: 'skill',
    },
    hooks: {
        events: {
            'session-start': 'SessionStart',
            'before-agent': 'SubagentStart',
            'after-agent': 'SubagentStop',
            'session-end': 'SessionEnd',
        },
        nameSuffix: '-qwen',
        descriptionSuffix: ' (Qwen Code)',
    },
    contextFile: {
        outputPath: 'QWEN.md',
        displayName: 'Qwen Code',
        subagentPrerequisite: 'Qwen Code natively supports subagents. Verify `~/.qwen/settings.json`.',
        extensionHome: '~/.qwen/extensions/maestro',
        extensionManifest: 'qwen-extension.json',
        hooksConfigPath: 'qwen/hooks.json',
        includeToolMappingTable: true,
        toolNames: { askUser: 'ask_user_question', writeTodos: 'todo_write', replace: 'edit' },
    },
});
