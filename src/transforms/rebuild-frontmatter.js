'use strict';

const { toSnakeCase } = require('../lib/naming');
const { escapeYaml } = require('../lib/frontmatter');

/**
 * Transform: rebuild-frontmatter
 *
 * Reads parsed frontmatter, body, and optional examples from the shared
 * pipeline state and produces the final output content with runtime-specific
 * frontmatter formatting.
 *
 * @param {string} _content - Original content (unused; state drives output)
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools)
 * @param {object} options  - Pipeline options with shared state
 * @returns {string} Final content with rebuilt frontmatter
 */
function rebuildFrontmatterTransform(_content, runtime, options) {
  const frontmatter = options.state.frontmatter || {};
  const body = options.state.body != null ? options.state.body : '';
  const examples = options.state.examples || [];
  const fm = runtime.agentFrontmatter || {};

  const name = runtime.agentNaming === 'snake_case' ? toSnakeCase(frontmatter.name) : frontmatter.name;

  const runtimeToolsOverrideKey = `tools.${runtime.name}`;
  let tools;
  if (frontmatter[runtimeToolsOverrideKey]) {
    tools = frontmatter[runtimeToolsOverrideKey];
  } else {
    tools = (frontmatter.tools || []).map((t) => {
      const mapped = runtime.tools && runtime.tools[t];
      if (Array.isArray(mapped)) return mapped;
      return mapped || t;
    }).flat();
  }

  let description = frontmatter.description || '';
  let outputBody = body;

  if (runtime.name === 'claude' && examples.length > 0) {
    const exampleText = examples.join('\n');
    description = description + '\n\n' + exampleText;
  }

  const lines = [];
  lines.push('---');
  if (name != null && name !== '') {
    lines.push(`name: ${name}`);
  }

  if (fm.kind) {
    lines.push(`kind: ${fm.kind}`);
  }

  if (runtime.name === 'claude' && description.includes('\n')) {
    lines.push('description: |');
    for (const dl of description.split('\n')) {
      lines.push(`  ${dl}`);
    }
  } else {
    lines.push(`description: "${escapeYaml(frontmatter.description || '')}"`);
  }

  if (fm.model) {
    lines.push(`model: ${fm.model}`);
  }

  if (runtime.name === 'claude' && frontmatter.color) {
    lines.push(`color: ${frontmatter.color}`);
  }

  if (runtime.name === 'gemini') {
    if (tools.length > 0) {
      lines.push('tools:');
      for (const tool of tools) {
        lines.push(`  - ${tool}`);
      }
    }
    if (fm.hasTemperature && frontmatter.temperature != null) {
      lines.push(`temperature: ${frontmatter.temperature}`);
    }
    if (fm.turnsField && frontmatter.max_turns != null) {
      lines.push(`${fm.turnsField}: ${frontmatter.max_turns}`);
    }
    if (fm.hasTimeout && frontmatter.timeout_mins != null) {
      lines.push(`timeout_mins: ${frontmatter.timeout_mins}`);
    }
  } else {
    if (fm.turnsField && frontmatter.max_turns != null) {
      lines.push(`${fm.turnsField}: ${frontmatter.max_turns}`);
    }
    if (tools.length > 0) {
      lines.push('tools:');
      for (const tool of tools) {
        lines.push(`  - ${tool}`);
      }
    }
  }

  lines.push('---');

  return lines.join('\n') + '\n' + outputBody;
}

module.exports = rebuildFrontmatterTransform;
