'use strict';

const { MAESTRO_SETTINGS } = require('../config/settings-catalog');
const { formatJson } = require('../lib/io');
const antigravityHookAdapter = require('./antigravity/hook-adapter');
const claudeHookAdapter = require('./claude/hook-adapter');
const { buildPolicyPackToml } = require('./qwen/policy-pack');

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';
const CODEX_DESCRIPTION =
  "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.";

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
  'session-start': 'Prune stale hook state',
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

// generate.js passes the repository's own package.json. `author` keeps only the
// fields manifests publish, in the order they publish them.
function buildMetadataContext({ name, version, homepage, license, repository, author }) {
  const { name: authorName, email, url } = author ?? {};
  return {
    name, version, homepage, license,
    repository: repository.url.replace(/\.git$/, ''),
    author: { name: authorName, email, url },
  };
}

// Field runs that several manifests repeat in this order.
const manifestHead = (context, description) => ({ name: 'maestro', version: context.version, description });
const publisherFields = ({ author, homepage, repository, license }) => ({ author, homepage, repository, license });

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

// `root` prefixes the launcher paths, which are relative to the runtime's outputDir.
function hookCommands(runtime, root) {
  const { hookRunner, policyEnforcer } = runtime.launchers;
  const run = (hookName) => `node ${root}${hookRunner} ${runtime.name} ${hookName}`;
  return {
    run,
    hook: (hookName) => ({ type: 'command', command: run(hookName), timeout: HOOK_TIMEOUT_SECONDS }),
    policy: () => ({ type: 'command', command: `node ${root}${policyEnforcer}`, timeout: POLICY_TIMEOUT_SECONDS }),
  };
}

function buildQwenHooks(runtime) {
  const { run } = hookCommands(runtime, `${rootVar(runtime)}/`);
  return {
    hooks: Object.fromEntries(Object.entries(QWEN_HOOK_EVENTS).map(([event, hookName]) => [event, [{
      hooks: [{
        type: 'command',
        command: run(hookName),
        name: `maestro-${hookName}-qwen`,
        description: `${HOOK_DESCRIPTIONS[hookName]} (Qwen Code)`,
        timeout: HOOK_TIMEOUT_SECONDS * 1000,
      }],
    }]])),
  };
}

function buildClaudeHooks(runtime) {
  const { hook, policy } = hookCommands(runtime, `${rootVar(runtime)}/`);
  return {
    hooks: {
      SessionEnd: [{ hooks: [hook('session-end')] }],
      SessionStart: [{ hooks: [hook('session-start')] }],
      PreToolUse: [
        { hooks: [hook('before-agent')], matcher: 'Agent' },
        { hooks: [policy()], matcher: claudeHookAdapter.shellPolicy.tool },
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
  const { hook, policy } = hookCommands(runtime, '');
  return {
    'maestro-session': {
      SessionStart: [hook('session-start'), hook('before-agent')],
    },
    'maestro-shell-policy': {
      PreToolUse: [{ matcher: antigravityHookAdapter.shellPolicy.tool, hooks: [policy()] }],
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
          ...publisherFields(context),
          keywords: [...BASE_KEYWORDS, 'agents'],
          category: 'productivity',
        },
      ],
    }],
    ['claude/.claude-plugin/plugin.json', {
      ...manifestHead(context, RUNTIME_DESCRIPTION),
      author: context.author,
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
      ...manifestHead(context, CODEX_DESCRIPTION),
      ...publisherFields(context),
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
          args: ['-y', '-p', `${context.name}@${context.version}`, 'maestro-mcp-server'],
        },
      },
    }],
    [`plugins/maestro/${CODEX_APPS_PATH}`, { apps: {} }],
  ],
  qwen: (context, runtime) => [
    ['qwen-extension.json', {
      ...manifestHead(context, RUNTIME_DESCRIPTION),
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
