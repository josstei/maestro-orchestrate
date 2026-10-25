'use strict';

const { MAESTRO_SETTINGS } = require('../config/settings-catalog');
const { formatJson } = require('../lib/io');
const antigravityHookAdapter = require('./antigravity/hook-adapter');
const claudeHookAdapter = require('./claude/hook-adapter');
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

// Hook timeouts in seconds; Qwen Code reads them in milliseconds.
const HOOK_TIMEOUT_SECONDS = 10;
const POLICY_TIMEOUT_SECONDS = 5;

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

// The runtime's variable for its installed plugin or extension root.
function rootVar(runtime) {
  return `\${${runtime.env.extensionPath}}`;
}

function nodeMcpServers(runtime, extra = {}) {
  return {
    maestro: {
      command: 'node',
      args: [`${rootVar(runtime)}/${runtime.launchers.mcpServer}`],
      ...extra,
    },
  };
}

function hookCommand(command, timeout) {
  return { type: 'command', command, timeout };
}

// `root` prefixes the launcher path, which is relative to the runtime's outputDir.
function hookRunnerCommand(runtime, root, hookName) {
  return `node ${root}${runtime.launchers.hookRunner} ${runtime.name} ${hookName}`;
}

function buildQwenHooks(runtime) {
  return {
    hooks: Object.fromEntries(Object.entries(QWEN_HOOK_EVENTS).map(([event, hookName]) => [event, [{
      hooks: [{
        type: 'command',
        command: hookRunnerCommand(runtime, `${rootVar(runtime)}/`, hookName),
        name: `maestro-${hookName}-qwen`,
        description: `${HOOK_DESCRIPTIONS[hookName]} (Qwen Code)`,
        timeout: HOOK_TIMEOUT_SECONDS * 1000,
      }],
    }]])),
  };
}

function buildClaudeHooks(runtime) {
  const root = `${rootVar(runtime)}/`;
  const runHook = (hookName) => hookCommand(hookRunnerCommand(runtime, root, hookName), HOOK_TIMEOUT_SECONDS);
  return {
    hooks: {
      SessionEnd: [{ hooks: [runHook('session-end')] }],
      SessionStart: [{ hooks: [runHook('session-start')] }],
      PreToolUse: [
        { hooks: [runHook('before-agent')], matcher: 'Agent' },
        {
          hooks: [hookCommand(`node ${root}${runtime.launchers.policyEnforcer}`, POLICY_TIMEOUT_SECONDS)],
          matcher: claudeHookAdapter.shellPolicy.tool,
        },
      ],
    },
  };
}

/**
 * Antigravity hooks.json: named hooks, each mapping events to handlers.
 * SessionStart takes a flat handler list and fires for the main conversation
 * and every subagent conversation, so it carries both the session-start and
 * the session-context (before-agent) handlers. PreToolUse groups handlers
 * under an anchored tool-name matcher. Antigravity has no session-end or
 * post-delegation event. Antigravity runs each command from the directory
 * holding hooks.json (the plugin root), so launcher paths are relative.
 */
function buildAntigravityHooks(runtime) {
  return {
    'maestro-session': {
      SessionStart: [
        hookCommand(hookRunnerCommand(runtime, '', 'session-start'), HOOK_TIMEOUT_SECONDS),
        hookCommand(hookRunnerCommand(runtime, '', 'before-agent'), HOOK_TIMEOUT_SECONDS),
      ],
    },
    'maestro-shell-policy': {
      PreToolUse: [
        {
          matcher: antigravityHookAdapter.shellPolicy.tool,
          hooks: [hookCommand(`node ${runtime.launchers.policyEnforcer}`, POLICY_TIMEOUT_SECONDS)],
        },
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
  antigravity: (context, runtime) => [
    ['antigravity/plugin.json', {
      name: 'maestro',
      displayName: 'Maestro',
      version: context.version,
      description: ANTIGRAVITY_DESCRIPTION,
      suggestedPrompts: DEFAULT_PROMPTS,
    }],
    ['antigravity/mcp_config.json', { mcpServers: nodeMcpServers(runtime) }],
    ['antigravity/hooks.json', buildAntigravityHooks(runtime)],
  ],
  claude: (context, runtime) => [
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
    [`claude/${CLAUDE_HOOKS_PATH}`, buildClaudeHooks(runtime)],
    ['claude/.mcp.json', { mcpServers: nodeMcpServers(runtime, { cwd: rootVar(runtime) }) }],
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
  qwen: (context, runtime) => [
    ['qwen-extension.json', {
      name: 'maestro',
      version: context.version,
      description: RUNTIME_DESCRIPTION,
      contextFileName: 'QWEN.md',
      settings: MAESTRO_SETTINGS,
      mcpServers: nodeMcpServers(runtime, {
        cwd: rootVar(runtime),
        env: {
          [runtime.env.workspacePath]: '${workspacePath}',
        },
      }),
    }],
    ['qwen/hooks.json', buildQwenHooks(runtime)],
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
