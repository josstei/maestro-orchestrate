'use strict';

const { MAESTRO_SETTINGS } = require('../config/settings-catalog');
const { DENY_RULES, ASK_RULES } = require('../core/policy-rules');

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

const BASE_KEYWORDS = ['orchestration', 'multi-agent', 'planning', 'execution'];

const CLAUDE_HOOKS_PATH = 'hooks/claude-hooks.json';
const CODEX_APPS_PATH = '.app.json';

const HOOK_DESCRIPTIONS = {
  'session-start': 'Initialize hook state and prune stale sessions',
  'before-agent': 'Inject session context into agent turns',
  'after-agent': 'Validate handoff report format with retry on malformed output',
  'session-end': 'Clean up hook state for ended session',
};

const POLICY_PACK_HEADER = [
  '# Maestro extension policy pack.',
  '#',
  '# These rules add low-friction guardrails for autonomous and interactive runs:',
  '# - deny obviously destructive shell commands',
  '# - ask before shell-based file writing patterns',
  '#',
  '# The extension tier may only contribute deny / ask_user decisions.',
  '',
].join('\n');

const DESTRUCTIVE_DENY_MESSAGE =
  'Maestro blocks destructive shell commands. Use safer targeted tools or handle the cleanup manually.';

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

function buildExtensionManifest(context, runtime, contextFileName) {
  return {
    name: 'maestro',
    version: context.version,
    description: RUNTIME_DESCRIPTION,
    contextFileName,
    settings: MAESTRO_SETTINGS,
    mcpServers: {
      maestro: {
        command: 'node',
        args: ['${extensionPath}/mcp/maestro-server.js'],
        cwd: '${extensionPath}',
        env: {
          MAESTRO_RUNTIME: runtime,
          MAESTRO_WORKSPACE_PATH: '${workspacePath}',
        },
      },
    },
  };
}

// Qwen Code reads hook timeouts in milliseconds.
function buildExtensionHooks(runtime, events, { nameSuffix = '', descriptionSuffix = '' } = {}) {
  return {
    hooks: Object.fromEntries(Object.entries(events).map(([event, hookName]) => [event, [{
      hooks: [{
        type: 'command',
        command: `node \${extensionPath}/hooks/hook-runner.js ${runtime} ${hookName}`,
        name: `maestro-${hookName}${nameSuffix}`,
        description: `${HOOK_DESCRIPTIONS[hookName]}${descriptionSuffix}`,
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

function policyCommandRegex(rule) {
  switch (rule.matchType) {
    case 'word':
      return `.*\\b${rule.pattern}\\b.*`;
    case 'regex':
      return `.*(?:${rule.pattern}).*$`;
    default:
      throw new Error(`Cannot render a ${rule.matchType} policy rule as a commandRegex: ${rule.pattern}`);
  }
}

// JSON string escapes are valid TOML basic-string escapes, so values are quoted with JSON.stringify.
function policyRule(lines) {
  return ['', '[[rule]]', 'toolName = "run_shell_command"', ...lines, ''].join('\n');
}

/**
 * Render the Qwen Code policy pack from the canonical rules that
 * the Claude policy enforcer applies: ask rules first, then one deny block for
 * every prefix rule, then one deny block per remaining deny rule.
 * @throws {Error} When a rule cannot be expressed as a policy commandRegex
 */
function buildPolicyPackToml(denyRules = DENY_RULES, askRules = ASK_RULES) {
  const prefixRules = denyRules.filter((rule) => rule.matchType === 'prefix');
  const regexDenyRules = denyRules.filter((rule) => rule.matchType !== 'prefix');

  return [
    POLICY_PACK_HEADER,
    ...askRules.map((rule) => policyRule([
      `commandRegex = ${JSON.stringify(policyCommandRegex(rule))}`,
      'decision = "ask_user"',
      'priority = 850',
    ])),
    policyRule([
      'commandPrefix = [',
      prefixRules.map((rule) => `  ${JSON.stringify(rule.pattern)}`).join(',\n'),
      ']',
      'decision = "deny"',
      'priority = 950',
      `deny_message = ${JSON.stringify(DESTRUCTIVE_DENY_MESSAGE)}`,
    ]),
    ...regexDenyRules.map((rule) => policyRule([
      `commandRegex = ${JSON.stringify(policyCommandRegex(rule))}`,
      'decision = "deny"',
      'priority = 950',
      `deny_message = ${JSON.stringify(rule.reason)}`,
    ])),
  ].join('');
}

// Per-runtime metadata files, as ordered [outputPath, value] pairs. String
// values are written as-is; anything else is written as JSON.
const METADATA_BUILDERS = {
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
        longDescription: 'Generated Codex runtime for Maestro. Shared methodology, templates, references, and agent personas stay aligned with the Claude Code and Qwen Code runtimes while Codex-specific delegation and state handling stay isolated to this plugin.',
        developerName: context.author.name,
        category: 'Coding',
        capabilities: [
          'Interactive',
          'Write',
        ],
        websiteURL: context.homepage,
        defaultPrompt: [
          'Use Maestro to orchestrate a feature from design through implementation and review.',
          'Use Maestro to review my changes and block on critical or major findings.',
          'Use Maestro to debug a failing workflow and route investigation to the right specialist.',
        ],
        brandColor: '#2563EB',
      },
    }],
    ['plugins/maestro/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'npx',
          args: ['-y', '-p', `${context.packageName}@${context.version}`, 'maestro-mcp-server'],
          env: {
            MAESTRO_RUNTIME: 'codex',
          },
        },
      },
    }],
    [`plugins/maestro/${CODEX_APPS_PATH}`, { apps: {} }],
  ],
  qwen: (context) => [
    ['qwen-extension.json', buildExtensionManifest(context, 'qwen', 'QWEN.md')],
    ['qwen/hooks.json', buildExtensionHooks('qwen', {
      SessionStart: 'session-start',
      SubagentStart: 'before-agent',
      SubagentStop: 'after-agent',
      SessionEnd: 'session-end',
    }, { nameSuffix: '-qwen', descriptionSuffix: ' (Qwen Code)' })],
    // The repo root is Qwen Code's extension dir.
    ['policies/maestro.toml', buildPolicyPackToml()],
  ],
};

function buildPlatformMetadataOutputs(runtimes, pkg) {
  const context = buildMetadataContext(pkg);

  return Object.keys(runtimes).sort().flatMap((runtimeName) =>
    METADATA_BUILDERS[runtimeName](context).map(([outputPath, value]) => ({
      outputPath,
      content: typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    }))
  );
}

module.exports = {
  buildPlatformMetadataOutputs,
  buildPolicyPackToml,
  codexMarketplace,
  codexMarketplacePlugin,
};
