'use strict';

const { getRuntimeGeneration } = require('../platforms/runtime-descriptor');

const STAGE_ORDER = ['session-start', 'before-agent', 'after-agent', 'session-end'];

const STAGE_DESCRIPTIONS = {
  'session-start': 'Initialize hook state and prune stale sessions',
  'before-agent': 'Inject session context into agent turns',
  'after-agent': 'Validate handoff report format with retry on malformed output',
  'session-end': 'Clean up hook state for ended session',
};

function renderJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildGeminiFamilyHookConfig(runtime) {
  const hooks = {};
  for (const stage of STAGE_ORDER) {
    hooks[runtime.hooks.events[stage]] = [
      {
        hooks: [
          {
            type: 'command',
            command: `node \${extensionPath}/hooks/hook-runner.js ${runtime.name} ${stage}`,
            name: `maestro-${stage}${runtime.hooks.nameSuffix}`,
            description: `${STAGE_DESCRIPTIONS[stage]}${runtime.hooks.descriptionSuffix}`,
            timeout: 10000,
          },
        ],
      },
    ];
  }
  return { hooks };
}

function claudeHookCommand(scriptRoot, script, stage) {
  const suffix = stage ? ` claude ${stage}` : '';
  return `node \${CLAUDE_PLUGIN_ROOT}/${scriptRoot}/${script}${suffix}`;
}

function buildClaudeHookConfig(options = {}) {
  const scriptRoot = options.scriptRoot || 'claude/scripts';
  return {
    hooks: {
      SessionEnd: [
        { hooks: [{ type: 'command', command: claudeHookCommand(scriptRoot, 'hook-runner.js', 'session-end'), timeout: 10 }] },
      ],
      SessionStart: [
        { hooks: [{ type: 'command', command: claudeHookCommand(scriptRoot, 'hook-runner.js', 'session-start'), timeout: 10 }] },
      ],
      PreToolUse: [
        {
          hooks: [{ type: 'command', command: claudeHookCommand(scriptRoot, 'hook-runner.js', 'before-agent'), timeout: 10 }],
          matcher: 'Agent',
        },
        {
          hooks: [{ type: 'command', command: claudeHookCommand(scriptRoot, 'policy-enforcer.js', null), timeout: 5 }],
          matcher: 'Bash',
        },
        {
          hooks: [{ type: 'command', command: claudeHookCommand(scriptRoot, 'policy-enforcer.js', null), timeout: 5 }],
          matcher: 'Write|Edit|MultiEdit',
        },
      ],
    },
  };
}

function buildPromotedClaudeHookConfig() {
  return buildClaudeHookConfig({ scriptRoot: 'scripts' });
}

const CLAUDE_HOOK_CONFIG_OUTPUT_PATH = 'claude/hooks/claude-hooks.json';

function buildHookConfigOutputs(runtimes) {
  const outputs = [];
  for (const runtime of Object.values(runtimes)) {
    if (!runtime) continue;
    const { hooks } = getRuntimeGeneration(runtime);
    if (!hooks || hooks.family !== 'gemini-family') continue;
    outputs.push({
      outputPath: hooks.configOutputPath,
      content: renderJson(buildGeminiFamilyHookConfig(runtime)),
    });
  }
  outputs.push({ outputPath: CLAUDE_HOOK_CONFIG_OUTPUT_PATH, content: renderJson(buildClaudeHookConfig()) });
  return outputs;
}

module.exports = { buildHookConfigOutputs, buildClaudeHookConfig, buildPromotedClaudeHookConfig, renderJson };
