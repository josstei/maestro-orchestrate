import path from 'node:path';
import fs from 'node:fs';
import { discover, generateRegistry } from '../lib/discovery/index.js';
import { serializeRegistry } from '../lib/discovery/index.js';
import { parse } from '../lib/frontmatter/index.js';
import { toPascalCase } from '../lib/naming/index.js';
import { listAgentSources } from '../core/agent-sources.js';
import { validateRegistry } from './registry-schemas.js';
import type { AgentCapability } from '../core/agent-registry.js';
import type { AgentRegistryEntry, GeneratedOutput, HookRegistryEntry, RegistryModel } from './types.js';

type ResourceRegistry = Record<string, string>;
type HookRegistry = Record<string, HookRegistryEntry>;
type GeneratedRegistry =
  | { fileName: 'agent-registry.json'; data: AgentRegistryEntry[] }
  | { fileName: 'resource-registry.json'; data: ResourceRegistry }
  | { fileName: 'hook-registry.json'; data: HookRegistry };

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function capabilityValue(value: unknown): AgentCapability {
  return value === 'read_shell' || value === 'read_write' || value === 'full' || value === 'read_only'
    ? value
    : 'read_only';
}

function buildAgentRegistry(srcDir: string): AgentRegistryEntry[] {
  return listAgentSources(srcDir).map(({ name: fallbackName, content }) => {
    const { frontmatter } = parse(content);
    const name = stringValue(frontmatter.name, fallbackName);
    const capabilities = capabilityValue(frontmatter.capabilities);
    const tools = stringArrayValue(frontmatter.tools);
    const focus = stringValue(frontmatter.focus);
    return { name, capabilities, tools, focus };
  });
}

function buildResourceRegistry(srcDir: string): ResourceRegistry {
  const skillsParentDir = path.join(srcDir, 'skills');
  const skillEntries = discover<{ relativePath: string }>({
    dir: path.join(srcDir, 'skills', 'shared'),
    pattern: '**/*.md',
    identity: (filepath) => {
      if (path.basename(filepath) === 'SKILL.md') {
        return path.basename(path.dirname(filepath));
      }
      return path.basename(filepath, '.md');
    },
    metadata: (filepath) => {
      const relativePath = 'skills/' + path.relative(skillsParentDir, filepath)
        .split(path.sep)
        .join('/');
      return { relativePath };
    },
  });

  const templateEntries = discover<{ relativePath: string }>({
    dir: path.join(srcDir, 'templates'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `templates/${path.basename(filepath)}`,
    }),
  });

  const referenceEntries = discover<{ relativePath: string }>({
    dir: path.join(srcDir, 'references'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `references/${path.basename(filepath)}`,
    }),
  });

  const resources: ResourceRegistry = {};
  for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries]) {
    resources[entry.id] = entry.relativePath;
  }

  return resources;
}

function buildHookRegistry(srcDir: string): HookRegistry {
  const hookEntries = discover<HookRegistryEntry>({
    dir: path.join(srcDir, 'hooks', 'logic'),
    pattern: '*-logic.ts',
    identity: (filepath) => path.basename(filepath).replace(/-logic\.ts$/, ''),
    metadata: (filepath) => {
      const file = path.basename(filepath);
      const hookName = file.replace(/-logic\.ts$/, '');
      const runtimeFile = file.replace(/\.ts$/, '.js');
      return {
        module: `hooks/logic/${runtimeFile}`,
        fn: `handle${toPascalCase(hookName)}`,
      };
    },
  });

  const hooks: HookRegistry = {};
  for (const entry of hookEntries) {
    hooks[entry.id] = { module: entry.module, fn: entry.fn };
  }

  return hooks;
}

function registriesFromModel(model: RegistryModel): GeneratedRegistry[] {
  return [
    { fileName: 'agent-registry.json', data: [...model.agents] },
    { fileName: 'resource-registry.json', data: { ...model.resources } },
    { fileName: 'hook-registry.json', data: { ...model.hooks } },
  ];
}

function buildRegistryModel(srcDir: string): RegistryModel {
  const model: RegistryModel = {
    agents: buildAgentRegistry(srcDir),
    resources: buildResourceRegistry(srcDir),
    hooks: buildHookRegistry(srcDir),
  };

  for (const { fileName, data } of registriesFromModel(model)) {
    validateRegistry(fileName, data);
  }
  return model;
}

function buildRegistries(srcDir: string): GeneratedRegistry[] {
  return registriesFromModel(buildRegistryModel(srcDir));
}

function collectRegistryOutputs(model: RegistryModel, outputRoot = 'src/generated'): GeneratedOutput[] {
  return registriesFromModel(model).map(({ fileName, data }) => ({
    outputPath: path.join(outputRoot, fileName),
    content: serializeRegistry(data),
  }));
}

/**
 * Run all discovery scans and write the resulting JSON registry files to
 * src/generated/.
 * @param {string} srcDir - Absolute path to the src/ directory
 */
function generateRegistries(srcDir: string): void {
  const generatedDir = path.join(srcDir, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  for (const { fileName, data } of buildRegistries(srcDir)) {
    generateRegistry(data, path.join(generatedDir, fileName));
  }
}

export { buildRegistryModel, buildRegistries, collectRegistryOutputs, generateRegistries };
