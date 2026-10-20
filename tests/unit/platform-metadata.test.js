'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildPlatformMetadataOutputs } = require('../../src/generator/platform-metadata');
const { buildPolicyPackToml } = require('../../src/generator/runtimes/qwen/policy-pack');
const { DENY_RULES, ASK_RULES } = require('../../src/platforms/shared/policy-rules');
const HOOK_REGISTRY = require('../../src/generated/hook-registry.json');
const { hookCommands } = require('../support/generated-files');

const PACKAGE_FIXTURE = {
  name: '@example/maestro',
  version: '9.8.7-preview.abc1234',
  // Keys out of manifest order: the manifests write name, email, url.
  author: {
    url: 'https://example.com',
    email: 'hello@example.com',
    name: 'Example Author',
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

// policies/maestro.toml holds patterns as TOML basic strings, so backslashes are doubled.
function tomlEscaped(text) {
  return text.replace(/\\/g, '\\\\');
}

describe('platform metadata generation', () => {
  it('writes every runtime metadata file from package identity, in runtime order', () => {
    const outputList = buildPlatformMetadataOutputs(PACKAGE_FIXTURE);

    assert.deepEqual(outputList.map((output) => output.outputPath), [
      'antigravity/plugin.json',
      'antigravity/mcp_config.json',
      'antigravity/hooks.json',
      '.claude-plugin/marketplace.json',
      'claude/.claude-plugin/plugin.json',
      'claude/hooks/claude-hooks.json',
      'claude/.mcp.json',
      '.agents/plugins/marketplace.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/.app.json',
      'qwen-extension.json',
      'qwen/hooks.json',
      'policies/maestro.toml',
    ]);

    const outputs = outputsByPath(outputList);
    assert.equal(outputs.get('qwen-extension.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('antigravity/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').version, PACKAGE_FIXTURE.version);
    assert.equal(
      outputs.get('plugins/maestro/.mcp.json').mcpServers.maestro.args[2],
      `${PACKAGE_FIXTURE.name}@${PACKAGE_FIXTURE.version}`
    );
  });

  it('carries the package author, homepage, repository without .git, and license into the manifests', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));
    const identity = {
      author: PACKAGE_FIXTURE.author,
      homepage: PACKAGE_FIXTURE.homepage,
      repository: 'https://github.com/example/maestro',
      license: PACKAGE_FIXTURE.license,
    };

    for (const manifest of [
      outputs.get('.claude-plugin/marketplace.json').plugins[0],
      outputs.get('claude/.claude-plugin/plugin.json'),
      outputs.get('plugins/maestro/.codex-plugin/plugin.json'),
    ]) {
      assert.deepEqual(
        Object.fromEntries(Object.keys(identity).map((key) => [key, manifest[key]])),
        identity
      );
      assert.deepEqual(Object.keys(manifest.author), ['name', 'email', 'url']);
    }
    assert.deepEqual(outputs.get('.claude-plugin/marketplace.json').owner, { name: PACKAGE_FIXTURE.author.name });
  });

  it('writes the qwen extension manifest and policy pack at the repo root', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));

    assert.equal(outputs.get('policies/maestro.toml'), buildPolicyPackToml());

    const manifest = outputs.get('qwen-extension.json');
    assert.equal(manifest.contextFileName, 'QWEN.md');
    assert.deepEqual(manifest.mcpServers.maestro.args, ['${extensionPath}/mcp/maestro-server.js']);
    assert.equal(manifest.mcpServers.maestro.env.MAESTRO_WORKSPACE_PATH, '${workspacePath}');
  });

  it('registers the qwen lifecycle hooks with millisecond timeouts', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));
    const { hooks } = outputs.get('qwen/hooks.json');

    assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SubagentStart', 'SubagentStop', 'SessionEnd']);
    for (const [event, entries] of Object.entries(hooks)) {
      for (const hook of entries.flatMap((entry) => entry.hooks)) {
        assert.equal(hook.timeout, 10000, `qwen/hooks.json ${event} timeout`);
      }
    }
  });

  it('writes the antigravity plugin manifest and MCP config at the plugin root', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));

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
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));

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

  it('leaves the runtime to the MCP server, which identifies its host', () => {
    const outputs = buildPlatformMetadataOutputs(PACKAGE_FIXTURE);

    for (const output of outputs.filter((entry) => entry.outputPath.endsWith('.json'))) {
      for (const server of Object.values(JSON.parse(output.content).mcpServers || {})) {
        assert.ok(!(server.env && 'MAESTRO_RUNTIME' in server.env), `${output.outputPath} names a runtime`);
      }
    }
  });

  it('points the plugin manifests at the generated hook and app configs', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));

    assert.equal(outputs.get('claude/.claude-plugin/plugin.json').hooks, './hooks/claude-hooks.json');
    assert.equal(outputs.get('plugins/maestro/.codex-plugin/plugin.json').apps, './.app.json');
    assert.deepEqual(outputs.get('plugins/maestro/.app.json'), { apps: {} });
  });

  it('runs only registered hooks from every hook config', () => {
    const outputs = outputsByPath(buildPlatformMetadataOutputs(PACKAGE_FIXTURE));
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

  it('has only rules a policy commandRegex can express', () => {
    // An ask prefix rule or a new matchType would make buildPolicyPackToml throw.
    assert.deepEqual(ASK_RULES.filter((rule) => rule.matchType === 'prefix'), []);
    for (const rule of [...DENY_RULES, ...ASK_RULES]) {
      assert.ok(['prefix', 'regex', 'word'].includes(rule.matchType), `${rule.pattern}: ${rule.matchType}`);
    }
  });
});
