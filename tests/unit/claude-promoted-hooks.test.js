import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHookConfigOutputs,
  buildClaudeHookConfig,
  buildPromotedClaudeHookConfig,
} from '../../src/generator/hook-config-emitter.js';

function commandsOf(config) {
  return Object.values(config.hooks).flatMap((entries) =>
    entries.flatMap((entry) => entry.hooks.map((hook) => hook.command))
  );
}

describe('claude promoted hook config', () => {
  it('default claude hook config keeps the claude/scripts prefix', () => {
    for (const command of commandsOf(buildClaudeHookConfig())) {
      assert.ok(
        command.includes('${CLAUDE_PLUGIN_ROOT}/claude/scripts/'),
        `expected claude/scripts prefix in: ${command}`
      );
    }
  });

  it('the emitted claude hooks output still uses the default claude/scripts prefix', () => {
    const output = buildHookConfigOutputs({ gemini: null, qwen: null }).find(
      (entry) => entry.outputPath === 'claude/hooks/claude-hooks.json'
    );
    assert.ok(output, 'expected a claude/hooks/claude-hooks.json output');
    assert.ok(output.content.includes('${CLAUDE_PLUGIN_ROOT}/claude/scripts/hook-runner.js'));
    assert.ok(!output.content.includes('${CLAUDE_PLUGIN_ROOT}/scripts/'));
  });

  it('promoted hook config rebases script commands to the plugin-root scripts/ dir', () => {
    const commands = commandsOf(buildPromotedClaudeHookConfig());
    for (const command of commands) {
      assert.ok(
        command.includes('${CLAUDE_PLUGIN_ROOT}/scripts/'),
        `expected promoted scripts/ prefix in: ${command}`
      );
      assert.ok(!command.includes('/claude/scripts/'), `promoted command must not nest claude/: ${command}`);
    }
    assert.ok(commands.some((command) => command.endsWith('policy-enforcer.js')));
    assert.ok(commands.some((command) => command.endsWith('hook-runner.js claude before-agent')));
  });
});
