'use strict';

const { MAESTRO_SETTINGS } = require('../config/settings-catalog');
const { formatJson } = require('../lib/io');
const { buildPolicyPackToml } = require('./qwen/policy-pack');

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

const BASE_KEYWORDS = ['orchestration', 'multi-agent', 'planning', 'execution'];

const CLAUDE_HOOKS_PATH = 'hooks/claude-hooks.json';
const CODEX_APPS_PATH = '.app.json';

// Antigravity's plugin cards and Marketplace listing keep descriptions to 160
// characters.
const ANTIGRAVITY_DESCRIPTION = 'Multi-agent development orchestration: 39 specialist subagents, design-plan-execute workflows with persistent sessions, and review, debug and audit skills';

const DEFAULT_PROMPTS = [
  'Use Maestro to orchestrate a feature from design through implementation and review.',
  'Use Maestro to review my changes and block on critical or major findings.',
  'Use Maestro to debug a failing workflow and route investigation to the right specialist.',
];

const HOOK_DESCRIPTIONS = {
  'session-start': 'Initialize hook state and prune stale sessions',
  'before-agent': 'Inject session context into agent turns',
  'after-agent': 'Validate handoff report format with retry on malformed output',
  'session-end': 'Clean up hook state for ended session',
};

const QWEN_HOOK_EVENTS = {
  SessionStart: 'session-start',
  SubagentStart: 'before-agent',
  SubagentStop: 'after-agent',
  SessionEnd: 'session-end',
};

function normalizeRepositoryUrl(repository) {
  if (!repository) {
    return null;
  }

  const url = typeof repository === 'string' ? repository : repository.url;
  if (typeof url !== 'string' || url.length === 0) {
    return null;
  }

  return url.replace(/\.git$/, '');
}

function requirePackageField(pkg, field) {
  if (typeof pkg[field] !== 'string' || pkg[field].length === 0) {
    throw new Error(`package.json missing ${field}`);
  }

  return pkg[field];
}

function buildMetadataContext(pkg) {
  const repository = normalizeRepositoryUrl(pkg.repository);

  if (!repository) {
    throw new Error('package.json missing repository URL');
  }

  return {
    packageName: requirePackageField(pkg, 'name'),
    version: requirePackageField(pkg, 'version'),
    author: pkg.author || {},
    homepage: requirePackageField(pkg, 'homepage'),
    repository,
    license: requirePackageField(pkg, 'license'),
  };
}

function buildAuthor(context) {
  return {
    name: context.author.name,
    email: context.author.email,
    url: context.author.url,
  };
}

function codexMarketplacePlugin(pluginPath) {
  return {
    name: 'maestro',
    source: {
      source: 'local',
      path: pluginPath,
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category: 'Coding',
  };
}

function codexMarketplace(plugins) {
  return {
    name: 'maestro-orchestrator',
    interface: {
      displayName: 'Maestro Orchestrator',
    },
    plugins,
  };
}

// Qwen Code reads hook timeouts in milliseconds.
function buildQwenHooks() {
  return {
    hooks: Object.fromEntries(Object.entries(QWEN_HOOK_EVENTS).map(([event, hookName]) => [event, [{
      hooks: [{
        type: 'command',
        command: `node \${extensionPath}/hooks/hook-runner.js qwen ${hookName}`,
        name: `maestro-${hookName}-qwen`,
        description: `${HOOK_DESCRIPTIONS[hookName]} (Qwen Code)`,
        timeout: 10000,
      }],
    }]])),
  };
}

// Claude Code reads hook timeouts in seconds.
function claudeHookCommand(script, timeout) {
  return {
    type: 'command',
    command: `node \${CLAUDE_PLUGIN_ROOT}/scripts/${script}`,
    timeout,
  };
}

function buildClaudeHooks() {
  return {
    hooks: {
      SessionEnd: [{ hooks: [claudeHookCommand('hook-runner.js claude session-end', 10)] }],
      SessionStart: [{ hooks: [claudeHookCommand('hook-runner.js claude session-start', 10)] }],
      PreToolUse: [
        { hooks: [claudeHookCommand('hook-runner.js claude before-agent', 10)], matcher: 'Agent' },
        { hooks: [claudeHookCommand('policy-enforcer.js', 5)], matcher: 'Bash' },
      ],
    },
  };
}

// Antigravity reads hook timeouts in seconds and runs each command from the
// directory holding hooks.json (the plugin root), so script paths are relative.
function antigravityHookCommand(script, timeout) {
  return { type: 'command', command: `node hooks/${script}`, timeout };
}

/**
 * Antigravity hooks.json: named hooks, each mapping events to handlers.
 * SessionStart takes a flat handler list and fires for the main conversation
 * and every subagent conversation, so it carries both the session-start and
 * the session-context (before-agent) handlers. PreToolUse groups handlers
 * under an anchored tool-name matcher. Antigravity has no session-end or
 * post-delegation event.
 */
function buildAntigravityHooks() {
  return {
    'maestro-session': {
      SessionStart: [
        antigravityHookCommand('hook-runner.js antigravity session-start', 10),
        antigravityHookCommand('hook-runner.js antigravity before-agent', 10),
      ],
    },
    'maestro-shell-policy': {
      PreToolUse: [
        { matcher: 'run_command', hooks: [antigravityHookCommand('policy-enforcer.js', 5)] },
      ],
    },
  };
}

// Per-runtime metadata files, as ordered [outputPath, value] pairs. Each
// builder receives the package context and its runtime config. String values
// are written as-is; anything else is written as JSON.
const METADATA_BUILDERS = {
  // Antigravity loads only plugin.json's own fields; MCP servers and hooks are
  // read from mcp_config.json and hooks.json at the plugin root.
  antigravity: (context) => [
    ['antigravity/plugin.json', {
      name: 'maestro',
      displayName: 'Maestro',
      version: context.version,
      description: ANTIGRAVITY_DESCRIPTION,
      suggestedPrompts: DEFAULT_PROMPTS,
    }],
    ['antigravity/mcp_config.json', {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${PLUGIN_ROOT}/mcp/maestro-server.js'],
        },
      },
    }],
    ['antigravity/hooks.json', buildAntigravityHooks()],
  ],
  claude: (context) => [
    ['.claude-plugin/marketplace.json', {
      name: 'maestro-orchestrator',
      owner: {
        name: context.author.name,
      },
      metadata: {
        description: 'Maestro multi-agent orchestration platform for Claude Code',
        version: context.version,
      },
      plugins: [
        {
          name: 'maestro',
          source: './claude',
          description: RUNTIME_DESCRIPTION,
          version: context.version,
          author: buildAuthor(context),
          homepage: context.homepage,
          repository: context.repository,
          license: context.license,
          keywords: [...BASE_KEYWORDS, 'agents'],
          category: 'productivity',
        },
      ],
    }],
    ['claude/.claude-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: RUNTIME_DESCRIPTION,
      author: buildAuthor(context),
      license: context.license,
      hooks: `./${CLAUDE_HOOKS_PATH}`,
      mcpServers: './.mcp.json',
      homepage: context.homepage,
      repository: context.repository,
      keywords: BASE_KEYWORDS,
    }],
    [`claude/${CLAUDE_HOOKS_PATH}`, buildClaudeHooks()],
    ['claude/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js'],
          cwd: '${CLAUDE_PLUGIN_ROOT}',
        },
      },
    }],
  ],
  codex: (context) => [
    ['.agents/plugins/marketplace.json', codexMarketplace([codexMarketplacePlugin('./plugins/maestro')])],
    ['plugins/maestro/.codex-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
      author: buildAuthor(context),
      homepage: context.homepage,
      repository: context.repository,
      license: context.license,
      keywords: [...BASE_KEYWORDS, 'coding'],
      skills: './skills/',
      mcpServers: './.mcp.json',
      apps: `./${CODEX_APPS_PATH}`,
      interface: {
        displayName: 'Maestro',
        shortDescription: 'Multi-agent coding orchestration for Codex',
        longDescription: 'Generated Codex runtime for Maestro. Shared methodology, templates, references, and agent personas stay aligned with the Antigravity, Claude Code, and Qwen Code runtimes while Codex-specific delegation and state handling stay isolated to this plugin.',
        developerName: context.author.name,
        category: 'Coding',
        capabilities: [
          'Interactive',
          'Write',
        ],
        websiteURL: context.homepage,
        defaultPrompt: DEFAULT_PROMPTS,
        brandColor: '#2563EB',
      },
    }],
    ['plugins/maestro/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'npx',
          args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
        },
      },
    }],
    [`plugins/maestro/${CODEX_APPS_PATH}`, { apps: {} }],
  ],
  qwen: (context) => [
    ['qwen-extension.json', {
      name: 'maestro',
      version: context.version,
      description: RUNTIME_DESCRIPTION,
      contextFileName: 'QWEN.md',
      settings: MAESTRO_SETTINGS,
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${extensionPath}/mcp/maestro-server.js'],
          cwd: '${extensionPath}',
          env: {
            MAESTRO_WORKSPACE_PATH: '${workspacePath}',
          },
        },
      },
    }],
    ['qwen/hooks.json', buildQwenHooks()],
    // The repo root is Qwen Code's extension dir.
    ['policies/maestro.toml', buildPolicyPackToml()],
  ],
};

function buildPlatformMetadataOutputs(runtimes, pkg) {
  const context = buildMetadataContext(pkg);

  return Object.keys(runtimes).sort().flatMap((runtimeName) =>
    METADATA_BUILDERS[runtimeName](context, runtimes[runtimeName]).map(([outputPath, value]) => ({
      outputPath,
      content: typeof value === 'string' ? value : formatJson(value),
    }))
  );
}

module.exports = {
  buildPlatformMetadataOutputs,
  codexMarketplace,
  codexMarketplacePlugin,
};
