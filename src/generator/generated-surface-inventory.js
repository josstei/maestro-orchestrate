'use strict';

const LIVE_OWNED_GENERATED_DIRS = Object.freeze([
  'agents',
  'claude/agents',
  'qwen/agents',
  'claude/skills',
  'plugins/maestro/skills',
  'commands',
]);

const RETIRED_GENERATED_CLEANUP_DIRS = Object.freeze([
  'claude/src',
  'plugins/maestro/src',
]);

const OWNED_GENERATED_DIRS = Object.freeze([
  ...LIVE_OWNED_GENERATED_DIRS,
  ...RETIRED_GENERATED_CLEANUP_DIRS,
]);

const GENERATED_SURFACE_INVENTORY = Object.freeze([
  {
    id: 'registry-outputs',
    producer: 'src/generator/registry-scanner.js',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/agents/*.md',
      'src/skills/shared/**/*.md',
      'src/templates/*.md',
      'src/references/*.md',
      'src/hooks/logic/*-logic.js',
    ],
    outputs: [
      'src/generated/agent-registry.json',
      'src/generated/resource-registry.json',
      'src/generated/hook-registry.json',
    ],
    tracked: true,
    packaged: true,
    notes: 'Runtime content handlers consume these registries directly.',
  },
  {
    id: 'manifest-transform-outputs',
    producer: 'src/manifest.js via src/generator/manifest-expander.js',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/agents/*.md',
      'src/skills/shared/**/SKILL.md',
      'src/platforms/*/runtime-config.js',
    ],
    outputs: [
      'agents/*.md',
      'claude/agents/*.md',
      'qwen/agents/*.md',
      'claude/skills/*/SKILL.md',
      'plugins/maestro/skills/*/SKILL.md',
    ],
    tracked: true,
    packaged: true,
    notes: 'The manifest is only one producer; it does not describe detached payloads or metadata.',
  },
  {
    id: 'entry-point-expander-outputs',
    producer: 'src/generator/entry-point-expander.js',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/entry-points/registry.js',
      'src/entry-points/core-command-registry.js',
      'src/entry-points/templates/*.tmpl',
    ],
    outputs: [
      'commands/maestro/*.toml',
      'claude/skills/*/SKILL.md',
      'plugins/maestro/skills/*/SKILL.md',
    ],
    tracked: true,
    packaged: true,
    notes: 'Expands both workflow entry points and standalone core commands.',
  },
  {
    id: 'platform-metadata-outputs',
    producer: 'src/platforms/*/metadata.js',
    writeMode: 'generate and prepack',
    sourceInputs: ['package.json', 'src/platforms/*/metadata.js'],
    outputs: [
      'gemini-extension.json',
      'qwen-extension.json',
      '.claude-plugin/marketplace.json',
      '.agents/plugins/marketplace.json',
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
    ],
    tracked: true,
    packaged: true,
    notes: 'Version and install metadata are generated from package metadata.',
  },
  {
    id: 'policy-outputs',
    producer: 'src/generator/policy-toml-emitter.js',
    writeMode: 'generate and prepack',
    sourceInputs: ['src/core/policy-rules.js'],
    outputs: ['policies/maestro.toml'],
    tracked: true,
    packaged: true,
    notes: 'Gemini policy pack generated from the canonical policy rules.',
  },
  {
    id: 'hook-config-outputs',
    producer: 'src/generator/hook-config-emitter.js',
    writeMode: 'generate and prepack',
    sourceInputs: ['src/platforms/gemini/runtime-config.js', 'src/platforms/qwen/runtime-config.js'],
    outputs: ['hooks/hooks.json', 'qwen/hooks.json', 'claude/hooks/claude-hooks.json'],
    tracked: true,
    packaged: true,
    notes: 'Runtime hook configs generated from gemini-family hook metadata; the Claude config is a structurally distinct build.',
  },
  {
    id: 'runtime-context-outputs',
    producer: 'src/generator/content-file-emitter.js',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/platforms/shared/runtime-context-template.md',
      'src/platforms/gemini/runtime-config.js',
      'src/platforms/qwen/runtime-config.js',
      'src/generated/agent-registry.json',
    ],
    outputs: ['GEMINI.md', 'QWEN.md'],
    tracked: true,
    packaged: true,
    notes: 'Runtime context files generated from the shared template and per-runtime contextFile metadata.',
  },
  {
    id: 'owned-directory-pruning',
    producer: 'src/generator/stale-pruner.js',
    writeMode: 'generate and prepack only, skipped in --dry-run and --diff',
    sourceInputs: ['expanded manifest paths', 'entry point expansion paths'],
    outputs: LIVE_OWNED_GENERATED_DIRS,
    tracked: true,
    packaged: true,
    notes: 'Only these live generated roots are stale-pruned after write-mode generation.',
  },
  {
    id: 'retired-generated-cleanup-roots',
    producer: 'src/generator/stale-pruner.js',
    writeMode: 'generate and prepack only, skipped in --dry-run and --diff',
    sourceInputs: ['retired generated roots from previous package contracts'],
    outputs: RETIRED_GENERATED_CLEANUP_DIRS,
    tracked: false,
    packaged: false,
    notes: 'Cleanup-only roots that should remain absent after pruning. They stay in the prune list so old generated files do not survive locally.',
  },
  {
    id: 'package-and-release-allowlists',
    producer: 'package.json files and scripts/release-artifact-manifest.js',
    writeMode: 'verification',
    sourceInputs: ['package.json', '.npmignore', 'scripts/release-artifact-manifest.js'],
    outputs: [
      'npm pack file list',
      'release artifact tarball contents',
    ],
    tracked: true,
    packaged: false,
    notes: 'These contracts decide which generated outputs are public artifacts.',
  },
]);

module.exports = {
  GENERATED_SURFACE_INVENTORY,
  LIVE_OWNED_GENERATED_DIRS,
  OWNED_GENERATED_DIRS,
  RETIRED_GENERATED_CLEANUP_DIRS,
};
