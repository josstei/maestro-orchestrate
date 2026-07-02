'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderRosterTable } = require('../core/roster-renderer');

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

function loadAgentRegistry(srcDir) {
  return JSON.parse(fs.readFileSync(path.join(srcDir, 'generated', 'agent-registry.json'), 'utf8'));
}

function renderToolMappingSection(runtime) {
  const rows = TOOL_MAPPING_DISPLAY_ORDER
    .map((source) => `| \`${source}\` | \`${runtime.tools[source]}\` |`)
    .join('\n');
  return [
    '## Qwen Tool Name Mapping',
    '',
    `This extension was authored for Qwen Code. When following agent methodology files that reference canonical tool names, use the runtime mapping from \`src/platforms/qwen/runtime-config.js\`:`,
    '',
    '| Source (raw file) | Qwen tool |',
    '|---|---|',
    rows,
    '',
  ].join('\n');
}

function finalizeContent(content) {
  return `${content.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function renderTemplate(template, values, agents, agentNaming) {
  let content = template;
  for (const [key, value] of Object.entries(values)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  content = content.replace(
    '<!-- @roster -->',
    renderRosterTable(agents, { agentNaming })
  );
  return finalizeContent(content);
}

function renderFeatureFlagsTable(runtime) {
  const rows = Object.entries(runtime.features)
    .map(([flag, value]) => `| \`${flag}\` | \`${value}\` |`)
    .join('\n');
  return ['| Flag | Value |', '| --- | --- |', rows].join('\n');
}

function renderRuntimeDoc(template, runtime, agents) {
  let content = template.replace('<!-- @feature-flags -->', renderFeatureFlagsTable(runtime));
  content = content.replace(
    '<!-- @roster -->',
    renderRosterTable(agents, { agentNaming: runtime.agentNaming })
  );
  return finalizeContent(content);
}

function renderContextFile(template, runtime, agents) {
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
    beforeAgentEventName: runtime.hooks.events['before-agent'],
    afterAgentEventName: runtime.hooks.events['after-agent'],
    toolMappingSection: cf.includeToolMappingTable ? renderToolMappingSection(runtime) : '',
  };

  return renderTemplate(template, values, agents, runtime.agentNaming);
}

function renderClaudeReadme(template, packageMetadata, agents, agentNaming) {
  return renderTemplate(template, { version: packageMetadata.version }, agents, agentNaming);
}

function buildContentFileOutputs(runtimes, srcDir, packageMetadata) {
  const template = fs.readFileSync(
    path.join(srcDir, 'platforms', 'shared', 'runtime-context-template.md'),
    'utf8'
  );
  const agents = loadAgentRegistry(srcDir);
  const outputs = [];
  for (const runtime of Object.values(runtimes)) {
    if (!runtime.contextFile) continue;
    outputs.push({
      outputPath: runtime.contextFile.outputPath,
      content: renderContextFile(template, runtime, agents),
    });
  }

  if (runtimes.claude) {
    const readmeTemplate = fs.readFileSync(
      path.join(srcDir, 'platforms', 'claude', 'readme-template.md'),
      'utf8'
    );
    outputs.push({
      outputPath: 'claude/README.md',
      content: renderClaudeReadme(readmeTemplate, packageMetadata, agents, runtimes.claude.agentNaming),
    });
  }

  for (const runtime of Object.values(runtimes)) {
    const runtimeDocPath = path.join(srcDir, 'platforms', runtime.name, 'runtime-doc.md');
    if (!fs.existsSync(runtimeDocPath)) continue;
    const runtimeDocTemplate = fs.readFileSync(runtimeDocPath, 'utf8');
    outputs.push({
      outputPath: `docs/runtime-${runtime.name}.md`,
      content: renderRuntimeDoc(runtimeDocTemplate, runtime, agents),
    });
  }

  return outputs;
}

module.exports = { buildContentFileOutputs, renderContextFile, renderClaudeReadme, renderRuntimeDoc };
