'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPlatformMetadataOutputs, buildPolicyPackToml } = require('../../src/platforms/metadata');
const { DENY_RULES, ASK_RULES } = require('../../src/core/policy-rules');
const HOOK_REGISTRY = require('../../src/generated/hook-registry.json');

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

const ALL_RUNTIMES = { claude: {}, codex: {}, gemini: {}, qwen: {} };

// policies/maestro.toml holds patterns as TOML basic strings, so backslashes are doubled.
function tomlEscaped(text) {
  return text.replace(/\\/g, '\\\\');
}

describe('platform metadata generation', () => {
  it('generates all runtime metadata from package identity', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));

    const expectedPaths = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'gemini-extension.json',
      'hooks/hooks.json',
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'policies/maestro.toml',
      'qwen-extension.json',
      'qwen/hooks.json',
    ];

    assert.deepEqual([...outputs.keys()].sort(), expectedPaths);
    assert.equal(outputs.get('gemini-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('qwen-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(
      outputs.get('gemini-extension.json').mcpServers.maestro.env.MAESTRO_RUNTIME,
      'gemini'
    );
    assert.equal(
      outputs.get('qwen-extension.json').mcpServers.maestro.env.MAESTRO_RUNTIME,
      'qwen'
    );
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

  it('points the plugin manifests at the generated hook and app configs', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));

    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').hooks, './hooks/claude-hooks.json');
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').apps, './.app.json');
    assert.deepEqual(outputs.get('plugins/maestro/.app.json'), { apps: {} });
  });

  it('runs only registered hooks from every hook config', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(ALL_RUNTIMES, PACKAGE_FIXTURE));
    const expectedRuntimes = {
      'hooks/hooks.json': 'gemini',
      'qwen/hooks.json': 'qwen',
      'claude/hooks/claude-hooks.json': 'claude',
    };

    for (const [configPath, runtime] of Object.entries(expectedRuntimes)) {
      const commands = Object.values(outputs.get(configPath).hooks)
        .flatMap((entries) => entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)))
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
    const heredoc = DENY_RULES.find((rule) => rule.pattern === '<<');
    assert.ok(toml.includes(
      `commandRegex = ".*(?:<<).*$"\ndecision = "deny"\npriority = 950\ndeny_message = ${JSON.stringify(heredoc.reason)}\n`
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
