'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPlatformMetadataOutputs } = require('../../src/platforms/metadata');
const { buildPolicyPackToml } = require('../../src/platforms/qwen/policy-pack');
const { DENY_RULES, ASK_RULES } = require('../../src/core/policy-rules');
const HOOK_REGISTRY = require('../../src/generated/hook-registry.json');
const { RUNTIME_NAMES } = require('../../src/mcp/runtime/runtime-config-map');

const PACKAGE_FIXTURE = {
  name: '@example/maestro',
  version: '9.8.7-preview.abc1234',
  author: {
    name: 'Example Author',
    email: 'hello@example.com',
    url: 'https://example.com',
  },
  homepage: 'https://example.com/maestro',
  repository: {
    type: 'git',
    url: 'https://github.com/example/maestro.git',
  },
  license: 'Apache-2.0',
};

function outputsByPath(outputs) {
  return new Map(outputs.map((output) => [
    output.outputPath,
    output.outputPath.endsWith('.json') ? JSON.parse(output.content) : output.content,
  ]));
}

const ALL_RUNTIMES = { antigravity: {}, claude: {}, codex: {}, qwen: {} };

// Claude and Qwen nest events under "hooks" and wrap every handler in a group
// (with an optional matcher); Antigravity's top level is named hooks, and its
// SessionStart handlers are flat.
function hookCommands(config) {
  if (config.hooks) {
    return Object.values(config.hooks).flat()
      .flatMap((group) => {
        assert.ok(Array.isArray(group.hooks), `expected a handler group: ${JSON.stringify(group)}`);
        return group.hooks;
      })
      .map((hook) => hook.command);
  }
  return Object.values(config)
    .flatMap((events) => Object.values(events).flat())
    .flatMap((entry) => entry.hooks || [entry])
    .map((hook) => hook.command);
}

// policies/maestro.toml holds patterns as TOML basic strings, so backslashes are doubled.
function tomlEscaped(text) {
  return text.replace(/\\/g, '\\\\');
}

describe('platform metadata generation', () => {
  it('covers exactly the discovered runtimes', () => {
    assert.deepEqual(Object.keys(ALL_RUNTIMES).sort(), RUNTIME_NAMES);
  });

  it('generates all runtime metadata from package identity', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));

    const expectedPaths = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'antigravity/hooks.json',
      'antigravity/mcp_config.json',
      'antigravity/plugin.json',
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'policies/maestro.toml',
      'qwen-extension.json',
      'qwen/hooks.json',
    ];

    assert.deepEqual([...outputs.keys()].sort(), expectedPaths);
    assert.equal(outputs.get('qwen-extension.json').version, PACKAGE_FIXTURE.version);
    assert.deepEqual(outputs.get('qwen-extension.json').mcpServers.maestro.env, {
      MAESTRO_WORKSPACE_PATH: '${workspacePath}',
    });
    assert.equal(outputs.get('antigravity/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(
      outputs.get('plugins/maestro/.mcp.json').mcpServers.maestro.args[2],
      `${PACKAGE_FIXTURE.name}@${PACKAGE_FIXTURE.version}`
    );
  });

  it('generates only metadata for enabled runtimes', () => {
    const outputs = buildPlatformMetadataOutputs({ codex: {} }, PACKAGE_FIXTURE);

    assert.deepEqual(
      outputs.map((output) => output.outputPath).sort(),
      [
        '.agents/plugins/marketplace.json',
        'plugins/maestro/.app.json',
        'plugins/maestro/.codex-plugin/plugin.json',
        'plugins/maestro/.mcp.json',
      ]
    );
  });

  it('makes the qwen runtime own the repo-root extension manifest and policy pack', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs({ qwen: {} }, PACKAGE_FIXTURE));

    assert.deepEqual([...outputs.keys()].sort(), [
      'policies/maestro.toml',
      'qwen-extension.json',
      'qwen/hooks.json',
    ]);
    assert.equal(outputs.get('policies/maestro.toml'), buildPolicyPackToml());

    const manifest = outputs.get('qwen-extension.json');
    assert.equal(manifest.contextFileName, 'QWEN.md');
    assert.deepEqual(manifest.mcpServers.maestro.args, ['${extensionPath}/mcp/maestro-server.js']);
    assert.equal(manifest.mcpServers.maestro.env.MAESTRO_WORKSPACE_PATH, '${workspacePath}');
  });

  it('registers the qwen lifecycle hooks with millisecond timeouts', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs({ qwen: {} }, PACKAGE_FIXTURE));
    const { hooks } = outputs.get('qwen/hooks.json');

    assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'SubagentStop', 'SessionEnd']);
    for (const [event, entries] of Object.entries(hooks)) {
      for (const hook of entries.flatMap((entry) => entry.hooks)) {
        assert.equal(hook.timeout, 10000, `qwen/hooks.json ${event} timeout`);
      }
    }
  });

  it('makes the antigravity runtime own its plugin manifest, MCP config and hooks at the plugin root', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs({ antigravity: {} }, PACKAGE_FIXTURE));

    assert.deepEqual([...outputs.keys()].sort(), [
      'antigravity/hooks.json',
      'antigravity/mcp_config.json',
      'antigravity/plugin.json',
    ]);

    // plugin.json carries only the manifest fields (MCP servers and hooks have
    // their own files), and Antigravity keeps descriptions to 160 characters.
    const manifest = outputs.get('antigravity/plugin.json');
    assert.deepEqual(Object.keys(manifest), ['name', 'displayName', 'version', 'description', 'suggestedPrompts']);
    assert.equal(manifest.name, 'maestro');
    assert.equal(manifest.displayName, 'Maestro');
    assert.equal(manifest.version, PACKAGE_FIXTURE.version);
    assert.ok(manifest.description.length > 0 && manifest.description.length <= 160, manifest.description);
    assert.equal(manifest.suggestedPrompts.length, 3);
    for (const prompt of manifest.suggestedPrompts) {
      assert.match(prompt, /^Use Maestro to /);
    }

    assert.deepEqual(outputs.get('antigravity/mcp_config.json'), {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${PLUGIN_ROOT}/mcp/maestro-server.js'],
        },
      },
    });
  });

  it('registers the antigravity session-context and shell-policy hooks with second timeouts', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs({ antigravity: {} }, PACKAGE_FIXTURE));

    assert.deepEqual(outputs.get('antigravity/hooks.json'), {
      'maestro-session': {
        SessionStart: [
          { type: 'command', command: 'node hooks/hook-runner.js antigravity session-start', timeout: 10 },
          { type: 'command', command: 'node hooks/hook-runner.js antigravity before-agent', timeout: 10 },
        ],
      },
      'maestro-shell-policy': {
        PreToolUse: [
          {
            matcher: 'run_command',
            hooks: [{ type: 'command', command: 'node hooks/policy-enforcer.js', timeout: 5 }],
          },
        ],
      },
    });
  });

  it('emits no gemini metadata', () => {
    const outputs = buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE);

    for (const output of outputs) {
      assert.doesNotMatch(output.outputPath, /gemini/i);
    }
    assert.ok(!outputs.some((output) => output.outputPath === 'hooks/hooks.json'));
    for (const output of outputs.filter((entry) => entry.outputPath.endsWith('.json'))) {
      const servers = JSON.parse(output.content).mcpServers || {};
      for (const server of Object.values(servers)) {
        assert.notEqual(server.env && server.env.MAESTRO_RUNTIME, 'gemini', output.outputPath);
      }
    }
  });

  it('leaves the runtime to the MCP server, which identifies its host', () => {
    const outputs = buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE);

    for (const output of outputs.filter((entry) => entry.outputPath.endsWith('.json'))) {
      for (const server of Object.values(JSON.parse(output.content).mcpServers || {})) {
        assert.ok(!(server.env && 'MAESTRO_RUNTIME' in server.env), `${output.outputPath} names a runtime`);
      }
    }
  });

  it('points the plugin manifests at the generated hook and app configs', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));

    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').hooks, './hooks/claude-hooks.json');
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').apps, './.app.json');
    assert.deepEqual(outputs.get('plugins/maestro/.app.json'), { apps: {} });
  });

  it('runs only registered hooks from every hook config', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));
    const expectedRuntimes = {
      'antigravity/hooks.json': 'antigravity',
      'qwen/hooks.json': 'qwen',
      'claude/hooks/claude-hooks.json': 'claude',
    };

    assert.deepEqual(
      [...outputs.keys()].filter((outputPath) => outputPath.endsWith('hooks.json')).sort(),
      Object.keys(expectedRuntimes).sort()
    );

    for (const [configPath, runtime] of Object.entries(expectedRuntimes)) {
      const commands = hookCommands(outputs.get(configPath))
        .filter((command) => command.includes('hook-runner.js'));

      assert.ok(commands.length > 0, `${configPath} must run the hook runner`);
      for (const command of commands) {
        const [hookRuntime, hookName] = command.split(' ').slice(-2);
        assert.equal(hookRuntime, runtime, `${configPath}: ${command}`);
        assert.ok(HOOK_REGISTRY[hookName], `${configPath} runs unregistered hook ${hookName}`);
      }
    }
  });
});

describe('policy pack generation', () => {
  const toml = buildPolicyPackToml();

  it('denies every destructive command prefix', () => {
    const start = toml.indexOf('commandPrefix = [');
    const prefixBlock = toml.slice(start, toml.indexOf(']', start));
    const prefixRules = DENY_RULES.filter((rule) => rule.matchType === 'prefix');

    assert.ok(prefixRules.length > 0);
    for (const rule of prefixRules) {
      assert.ok(prefixBlock.includes(`  ${JSON.stringify(rule.pattern)}`), `missing deny prefix ${rule.pattern}`);
    }
  });

  it('renders the regex deny rules and the ask rules as commandRegex rules', () => {
    const heredoc = DENY_RULES.find((rule) => rule.matchType === 'regex' && rule.reason.startsWith('Heredoc'));
    assert.ok(toml.includes(
      `commandRegex = ".*(?:${tomlEscaped(heredoc.pattern).replace(/"/g, '\\"')}).*$"\ndecision = "deny"\npriority = 950\ndeny_message = ${JSON.stringify(heredoc.reason)}\n`
    ));

    const redirect = ASK_RULES.find((rule) => rule.matchType === 'regex');
    assert.ok(toml.includes(
      `commandRegex = ".*(?:${tomlEscaped(redirect.pattern)}).*$"\ndecision = "ask_user"\n`
    ));
    assert.ok(toml.includes('commandRegex = ".*\\\\btee\\\\b.*"\ndecision = "ask_user"\n'));
  });

  it('refuses rule shapes a policy commandRegex cannot express', () => {
    const askPrefix = [{ matchType: 'prefix', pattern: 'npm publish', reason: 'Publishes a package' }];
    const unknown = [{ matchType: 'glob', pattern: '*.lock', reason: 'Lockfile' }];

    assert.throws(() => buildPolicyPackToml(DENY_RULES, askPrefix), /Cannot render a prefix policy rule/);
    assert.throws(() => buildPolicyPackToml(unknown, ASK_RULES), /Cannot render a glob policy rule/);
  });
});
