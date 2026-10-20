'use strict';

/**
 * What the generator writes for Codex. scripts/install-codex-plugin.js also
 * reads it for its personal-marketplace entry (codexMarketplace,
 * codexMarketplacePlugin).
 */

const CODEX_APPS_PATH = '.app.json';

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

module.exports = {
  ownedDirs: ['plugins/maestro/skills'],

  // Codex registers no hooks, so plugins/maestro/src/ ships only the shared base.
  payload: [],

  entryPoints: {
    outputPath: (name) => `plugins/maestro/skills/${name}/SKILL.md`,
    // Codex has built-in review, debug and resume commands.
    reservedNames: ['review', 'debug', 'resume'],
    preamble: {
      'entry-point': (entry, { skillContentLine, agentLine }) =>
        [skillContentLine, ...(agentLine ? [agentLine] : [])].join('\n'),
      'core-command': () => '',
    },
  },

  metadataFiles: (context) => [
    ['.agents/plugins/marketplace.json', codexMarketplace([codexMarketplacePlugin('./plugins/maestro')])],
    ['plugins/maestro/.codex-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: "Generated Codex runtime for Maestro's multi-agent design, planning, execution, and review workflows.",
      author: context.author,
      homepage: context.homepage,
      repository: context.repository,
      license: context.license,
      keywords: [...context.keywords, 'coding'],
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
        defaultPrompt: context.defaultPrompts,
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

  codexMarketplace,
  codexMarketplacePlugin,
};
