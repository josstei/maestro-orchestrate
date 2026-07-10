import fs from 'node:fs';
import path from 'node:path';
import { renderRosterTable } from '../core/roster-renderer.js';
import { SETTINGS_SCHEMA, SETTING_NAMES } from '../config/settings-schema.js';
import {
  RUNTIME_FACTS_SECTION_END,
  RUNTIME_FACTS_SECTION_START,
  renderRuntimeFactsSection,
} from '../platforms/metadata-shared.js';
import type { RuntimeDefinition } from '../platforms/runtime-declarations.js';
import type {
  AgentNaming,
  AgentRegistryEntry,
  GeneratedOutput,
  GeneratorRuntimeConfig,
  PackageMetadata,
  RuntimeContextFileConfig,
  RuntimeHookConfig,
  StringMap,
} from './types.js';

const TOOL_MAPPING_DISPLAY_ORDER = Object.freeze([
  'read_file',
  'read_many_files',
  'list_directory',
  'glob',
  'grep_search',
  'google_web_search',
  'web_fetch',
  'write_file',
  'replace',
  'run_shell_command',
  'ask_user',
  'write_todos',
  'activate_skill',
  'enter_plan_mode',
  'exit_plan_mode',
  'codebase_investigator',
]);

const SETTINGS_SECTION_START = '<!-- BEGIN GENERATED SETTINGS -->';
const SETTINGS_SECTION_END = '<!-- END GENERATED SETTINGS -->';

function renderSettingDefault(value: unknown): string {
  if (Array.isArray(value) && value.length === 0) return '(none)';
  if (Array.isArray(value)) return `\`${value.join(', ')}\``;
  return `\`${String(value)}\``;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderSettingsSection(): string {
  const rows = SETTING_NAMES.flatMap((name) => {
    const spec = SETTINGS_SCHEMA[name];
    if (!spec.presentation.documented) return [];
    return [
      `| ${escapeMarkdownCell(spec.presentation.label)} | \`${name}\` | ${renderSettingDefault(spec.default)} | ${escapeMarkdownCell(spec.presentation.valueHint)} | ${escapeMarkdownCell(spec.presentation.usage)} |`,
    ];
  });

  return [
    SETTINGS_SECTION_START,
    '',
    '| Setting | Environment variable | Default | Values | Usage |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    SETTINGS_SECTION_END,
  ].join('\n');
}

function renderToolMappingSection(runtime: { tools: Record<string, unknown> }): string {
  const rows = TOOL_MAPPING_DISPLAY_ORDER
    .map((source) => `| \`${source}\` | \`${String(runtime.tools[source] || '')}\` |`)
    .join('\n');
  return [
    '## Qwen Tool Name Mapping',
    '',
    `This extension was authored for Qwen Code. When following agent methodology files that reference canonical tool names, use the runtime mapping from \`src/platforms/qwen/runtime-config.ts\`:`,
    '',
    '| Source (raw file) | Qwen tool |',
    '|---|---|',
    rows,
    '',
  ].join('\n');
}

function finalizeContent(content: string): string {
  return `${content.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function renderTemplate(
  template: string,
  values: StringMap,
  agents: readonly AgentRegistryEntry[],
  agentNaming: AgentNaming
): string {
  let content = template;
  for (const [key, value] of Object.entries(values)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  content = content.replace(
    '<!-- @roster -->',
    renderRosterTable(agents, { agentNaming })
  );
  content = content.replace('<!-- @settings -->', renderSettingsSection());
  return finalizeContent(content);
}

function renderFeatureFlagsTable(runtime: { features: Readonly<Record<string, unknown>> }): string {
  const rows = Object.entries(runtime.features)
    .map(([flag, value]) => `| \`${flag}\` | \`${value}\` |`)
    .join('\n');
  return ['| Flag | Value |', '| --- | --- |', rows].join('\n');
}

function renderRuntimeDoc(
  template: string,
  definition: RuntimeDefinition,
  agents: readonly AgentRegistryEntry[]
): string {
  const runtime = definition.config;
  let content = template.replace('<!-- @feature-flags -->', renderFeatureFlagsTable({ features: runtime.features || {} }));
  const factsPattern = new RegExp(`${RUNTIME_FACTS_SECTION_START}[\\s\\S]*?${RUNTIME_FACTS_SECTION_END}`);
  if (!factsPattern.test(content)) {
    throw new Error(`Runtime doc for "${definition.name}" is missing its generated facts section`);
  }
  content = content.replace(factsPattern, renderRuntimeFactsSection(definition));
  content = content.replace(
    '<!-- @roster -->',
    renderRosterTable(agents, { agentNaming: runtime.agentNaming })
  );
  return finalizeContent(content);
}

function renderContextFile(
  template: string,
  runtime: GeneratorRuntimeConfig & {
    contextFile: RuntimeContextFileConfig;
    hooks: RuntimeHookConfig;
    tools: Record<string, unknown>;
  },
  agents: readonly AgentRegistryEntry[]
): string {
  const cf = runtime.contextFile;
  const values = {
    displayName: cf.displayName,
    runtimeName: runtime.name,
    subagentPrerequisite: cf.subagentPrerequisite,
    extensionHome: cf.extensionHome,
    extensionManifest: cf.extensionManifest,
    hooksConfigPath: cf.hooksConfigPath,
    askUserTool: cf.toolNames.askUser,
    writeTodosTool: cf.toolNames.writeTodos,
    replaceTool: cf.toolNames.replace,
    beforeAgentEventName: runtime.hooks.events['before-agent'] || '',
    afterAgentEventName: runtime.hooks.events['after-agent'] || '',
    toolMappingSection: cf.includeToolMappingTable ? renderToolMappingSection(runtime) : '',
  };

  return renderTemplate(template, values, agents, runtime.agentNaming);
}

function renderClaudeReadme(
  template: string,
  packageMetadata: PackageMetadata,
  agents: readonly AgentRegistryEntry[],
  agentNaming: AgentNaming
): string {
  return renderTemplate(template, { version: packageMetadata.version }, agents, agentNaming);
}

function buildContentFileOutputs(
  definitions: readonly RuntimeDefinition[],
  srcDir: string,
  packageMetadata: PackageMetadata,
  agents: readonly AgentRegistryEntry[]
): GeneratedOutput[] {
  const template = fs.readFileSync(
    path.join(srcDir, 'platforms', 'shared', 'runtime-context-template.md'),
    'utf8'
  );
  const outputs: GeneratedOutput[] = [];
  for (const { config: runtime } of definitions) {
    if (!runtime.contextFile) continue;
    const contextRuntime = runtime as GeneratorRuntimeConfig & {
      contextFile: RuntimeContextFileConfig;
      hooks: RuntimeHookConfig;
      tools: Record<string, unknown>;
    };
    outputs.push({
      outputPath: contextRuntime.contextFile.outputPath,
      content: renderContextFile(template, contextRuntime, agents),
    });
  }

  const claude = definitions.find((definition) => definition.name === 'claude');
  if (claude) {
    const readmeTemplate = fs.readFileSync(
      path.join(srcDir, 'platforms', 'claude', 'readme-template.md'),
      'utf8'
    );
    outputs.push({
      outputPath: 'claude/README.md',
      content: renderClaudeReadme(readmeTemplate, packageMetadata, agents, claude.config.agentNaming),
    });
  }

  for (const definition of definitions) {
    const runtimeDocPath = path.join(srcDir, 'platforms', definition.name, 'runtime-doc.md');
    if (!fs.existsSync(runtimeDocPath)) continue;
    const runtimeDocTemplate = fs.readFileSync(runtimeDocPath, 'utf8');
    const outputPath = definition.payload.docs.find((docPath) => docPath.startsWith('docs/runtime-'));
    if (!outputPath) {
      throw new Error(`Runtime definition "${definition.name}" is missing its generated runtime doc path`);
    }
    outputs.push({
      outputPath,
      content: renderRuntimeDoc(runtimeDocTemplate, definition, agents),
    });
  }

  return outputs;
}

export {
  SETTINGS_SECTION_END,
  SETTINGS_SECTION_START,
  buildContentFileOutputs,
  renderClaudeReadme,
  renderContextFile,
  renderRuntimeDoc,
  renderSettingsSection,
};
