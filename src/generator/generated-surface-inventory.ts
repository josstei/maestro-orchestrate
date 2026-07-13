import { listRuntimeDefinitions, metadataOutputPaths } from '../platforms/runtime-declarations.js';

const RUNTIME_DEFINITIONS = listRuntimeDefinitions();
const RUNTIME_CONTEXT_OUTPUTS = Object.freeze(
  RUNTIME_DEFINITIONS.flatMap((definition) => [
    definition.config.contextFile && typeof definition.config.contextFile.outputPath === 'string'
      ? definition.config.contextFile.outputPath
      : null,
    ...definition.payload.docs.filter((docPath) => docPath.startsWith('docs/runtime-')),
    definition.name === 'claude' ? 'claude/README.md' : null,
  ]).filter((outputPath): outputPath is string => outputPath !== null)
);

const OWNED_GENERATED_DIRS = Object.freeze([
  'agents',
  'claude/agents',
  'qwen/agents',
  'claude/skills',
  'plugins/maestro/skills',
  'commands',
]);

const TRACKED_OUTPUT_EXEMPTIONS = Object.freeze([
  '.agents/plugins/marketplace.json',
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
]);

const GENERATED_SURFACE_INVENTORY = Object.freeze([
  {
    id: 'registry-outputs',
    producer: 'src/generator/registry-scanner.ts',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/agents/*.md',
      'src/agent-profiles/*.profile',
      'src/skills/shared/**/*.md',
      'src/templates/*.md',
      'src/references/*.md',
      'src/hooks/logic/*-logic.ts',
    ],
    outputs: [
      'src/generated/agent-registry.json',
      'src/generated/resource-registry.json',
      'src/generated/hook-registry.json',
    ],
    tracked: false,
    packaged: true,
    notes: 'Final compatibility projections. Build and generation derive one in-memory RegistryModel from tracked source inputs before writing these files; no producer reads them as a prerequisite.',
  },
  {
    id: 'manifest-transform-outputs',
    producer: 'src/manifest.ts via src/generator/manifest-expander.ts',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/agents/*.md',
      'src/agent-profiles/*.profile',
      'src/skills/shared/**/SKILL.md',
      'src/platforms/*/runtime-config.ts',
    ],
    outputs: [
      'agents/*.md',
      'claude/agents/*.md',
      'qwen/agents/*.md',
      'claude/skills/*/SKILL.md',
      'plugins/maestro/skills/*/SKILL.md',
    ],
    tracked: false,
    packaged: true,
    notes: 'The manifest is only one producer; it does not describe detached payloads or metadata.',
  },
  {
    id: 'entry-point-expander-outputs',
    producer: 'src/generator/entry-point-expander.ts',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/entry-points/registry.ts',
      'src/entry-points/core-command-registry.ts',
      'src/entry-points/templates/*.tmpl',
    ],
    outputs: [
      'commands/maestro/*.toml',
      'claude/skills/*/SKILL.md',
      'plugins/maestro/skills/*/SKILL.md',
    ],
    tracked: false,
    packaged: true,
    notes: 'Expands both workflow entry points and standalone core commands.',
  },
  {
    id: 'platform-metadata-outputs',
    producer: 'src/platforms/*/metadata.ts',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'package.json',
      'src/config/settings-schema.ts',
      'src/platforms/runtime-declarations.ts',
      'src/platforms/*/metadata.ts',
    ],
    outputs: metadataOutputPaths(),
    tracked: true,
    packaged: true,
    notes: 'Version and install metadata are generated from package metadata; extension-visible setting metadata is projected from the canonical SettingSpec catalog. Only the 3 paths in TRACKED_OUTPUT_EXEMPTIONS stay tracked; the rest are gitignored.',
  },
  {
    id: 'policy-outputs',
    producer: 'src/generator/policy-toml-emitter.ts',
    writeMode: 'generate and prepack',
    sourceInputs: ['src/core/policy-rules.ts'],
    outputs: ['policies/maestro.toml'],
    tracked: false,
    packaged: true,
    notes: 'Gemini policy pack generated from the canonical policy rules.',
  },
  {
    id: 'hook-config-outputs',
    producer: 'src/generator/hook-config-emitter.ts',
    writeMode: 'generate and prepack',
    sourceInputs: ['src/platforms/gemini/runtime-config.ts', 'src/platforms/qwen/runtime-config.ts'],
    outputs: ['hooks/hooks.json', 'qwen/hooks.json', 'claude/hooks/claude-hooks.json'],
    tracked: false,
    packaged: true,
    notes: 'Runtime hook configs generated from gemini-family hook metadata; the Claude config is a structurally distinct build.',
  },
  {
    id: 'runtime-context-outputs',
    producer: 'src/generator/content-file-emitter.ts',
    writeMode: 'generate and prepack',
    sourceInputs: [
      'src/platforms/shared/runtime-context-template.md',
      'src/platforms/claude/readme-template.md',
      'src/config/settings-schema.ts',
      'src/platforms/runtime-declarations.ts',
      ...RUNTIME_DEFINITIONS.map((definition) => `src/platforms/${definition.name}/runtime-config.ts`),
      ...RUNTIME_DEFINITIONS.map((definition) => `src/platforms/${definition.name}/runtime-doc.md`),
      'src/agents/*.md',
      'src/agent-profiles/*.profile',
      'package.json',
    ],
    outputs: RUNTIME_CONTEXT_OUTPUTS,
    tracked: false,
    packaged: true,
    notes: 'Runtime context files receive agent data from the in-memory RegistryModel and factual setting sections from the canonical SettingSpec catalog, then combine them with the shared template and per-runtime metadata; source registry projections are not read during rendering.',
  },
  {
    id: 'owned-directory-pruning',
    producer: 'src/generator/stale-pruner.ts',
    writeMode: 'generate and prepack only, skipped in --dry-run and --diff',
    sourceInputs: ['GenerationSession planned paths after every producer writes'],
    outputs: OWNED_GENERATED_DIRS,
    tracked: false,
    packaged: true,
    notes: 'Only these live generated roots are stale-pruned from the complete session plan after write-mode generation.',
  },
  {
    id: 'package-and-release-allowlists',
    producer: 'package.json files and src/tooling/release-artifact-manifest.ts',
    writeMode: 'verification',
    sourceInputs: ['package.json', '.npmignore', 'src/tooling/release-artifact-manifest.ts'],
    outputs: [
      'npm pack file list',
      'release artifact tarball contents',
    ],
    tracked: true,
    packaged: false,
    notes: 'These contracts decide which generated outputs are public artifacts.',
  },
]);

export { GENERATED_SURFACE_INVENTORY, OWNED_GENERATED_DIRS, RUNTIME_CONTEXT_OUTPUTS, TRACKED_OUTPUT_EXEMPTIONS };
