'use strict';

const path = require('node:path');
const { parse } = require('../../lib/frontmatter');
const { readTextSync } = require('../../lib/io');
const { ValidationError } = require('../../lib/errors');
const { escapeRegExp, toNamingConvention, toSnakeCase } = require('../../lib/naming');
const { stripExamples, stripFeatureBlocks } = require('../../core/feature-blocks');
const { mapTools } = require('../../core/agent-tools');
const { AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES } = require('../../core/agent-registry');

const RESOURCE_ALLOWLIST = Object.freeze(require('../../generated/resource-registry.json'));

const HYPHENATED_AGENT_PATTERNS = AGENT_NAMES.filter((name) => name.includes('-'))
  .map((name) => [new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'), toSnakeCase(name)]);

/**
 * Batch skeleton shared by get_skill_content and get_agent: `read(id)` returns
 * `[key, value, error]`, and each id lands in `field` or in `errors`.
 */
function readEach(ids, kind, field, read) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError(`${kind}s must be a non-empty array of ${kind} identifiers`);
  }

  const values = {};
  const errors = {};
  for (const id of ids) {
    const [key, value, error] = read(id);
    if (error) errors[key] = error;
    else values[key] = value;
  }
  return { [field]: values, errors };
}

/** Maestro's served content under `srcRoot`, transformed for one runtime. */
class RuntimeContent {
  constructor(runtimeConfig, srcRoot) {
    this.runtime = runtimeConfig;
    this.srcRoot = srcRoot;
    this.features = runtimeConfig.features || {};
  }

  /** Whole-word hyphenated agent names in served text follow the runtime's agentNaming. */
  localize(content) {
    if (this.runtime.agentNaming !== 'snake_case') return content;
    return HYPHENATED_AGENT_PATTERNS.reduce((text, [pattern, name]) => text.replace(pattern, name), content);
  }

  /**
   * Resolve feature blocks and agent names, rewrite `${extensionPath}` (and no
   * other placeholder) to the runtime's extension-root variable, and append the
   * runtime's servedSkillFrontmatter lines to a SKILL.md's frontmatter.
   */
  transform(content, resourcePath) {
    let result = this.localize(stripFeatureBlocks(content, this.features));
    const { extensionPath } = this.runtime.env || {};
    if (extensionPath) {
      result = result.replace(/\$\{extensionPath\}/g, '${' + extensionPath + '}');
    }

    const lines = this.runtime.servedSkillFrontmatter || [];
    if (lines.length === 0 || !resourcePath.endsWith('SKILL.md')) {
      return result;
    }

    return result.replace(
      /^(---\n[\s\S]*?)(^---)/m,
      (_match, frontmatter, closing) => `${frontmatter}${lines.join('\n')}\n${closing}`
    );
  }

  readResource(id) {
    const relativePath = RESOURCE_ALLOWLIST[id];
    if (!relativePath) {
      return {
        error: `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`,
      };
    }

    // Outside the try: a non-string path (an inherited key like "toString") fails the whole call.
    const absolutePath = path.join(this.srcRoot, relativePath);
    try {
      const content = readTextSync(absolutePath);
      return {
        content: this.transform(content, relativePath),
      };
    } catch (err) {
      return {
        error: `Failed to read resource "${id}": ${err.code || 'UNKNOWN'}`,
      };
    }
  }

  /**
   * An agent's methodology body with the shared Output Contract
   * (agents/shared/handoff-report.md) appended, plus its runtime tool names.
   * `agentName` must come from AGENT_NAMES; getAgent enforces this.
   */
  readAgent(agentName) {
    const agentsDir = path.join(this.srcRoot, 'agents');
    try {
      const content = readTextSync(path.join(agentsDir, `${agentName}.md`));
      const outputContract = readTextSync(path.join(agentsDir, 'shared', 'handoff-report.md'));
      // Strip examples and feature blocks before splitting off the frontmatter,
      // so blank-line collapsing also applies across the frontmatter boundary.
      const served = this.features.exampleBlocks ? content : stripExamples(content);
      const { frontmatter, body } = parse(stripFeatureBlocks(served, this.features));
      return {
        agent: {
          body: this.localize(`${body}\n${outputContract}`),
          tools: mapTools(frontmatter, this.runtime),
        },
      };
    } catch (err) {
      return {
        error: `Failed to read agent "${agentName}": ${err.code || 'UNKNOWN'}`,
      };
    }
  }

  /** get_skill_content; readResource rejects ids outside RESOURCE_ALLOWLIST. */
  getSkillContent({ resources }) {
    return readEach(resources, 'resource', 'contents', (id) => {
      const { content, error } = this.readResource(id);
      return [id, content, error];
    });
  }

  getAgent({ agents }) {
    return readEach(agents, 'agent', 'agents', (rawName) => {
      const inputName = String(rawName || '').trim();
      const canonicalName = inputName.replace(/_/g, '-');
      if (!AGENT_NAMES.includes(canonicalName)) {
        const known = AGENT_NAMES.join(', ');
        return [inputName || '(empty)', null, `Unknown agent identifier: "${inputName}". Known identifiers: ${known}`];
      }

      const { agent, error } = this.readAgent(canonicalName);
      const toolName = toNamingConvention(canonicalName, this.runtime.agentNaming);
      return [inputName, { ...agent, tool_name: toolName }, error];
    });
  }

  runtimeContext(workspaceSuggestion) {
    const { runtime } = this;
    const delegation = runtime.delegation || {};
    const pattern = delegation.pattern || '';
    return {
      runtime: runtime.name,
      tools: runtime.tools || {},
      agent_dispatch: {
        pattern,
        naming: runtime.agentNaming || 'kebab-case',
        prefix: runtime.agentPrefix || '',
      },
      delegation: {
        pattern,
        constraints: delegation.constraints || {},
      },
      mcp_prefix: runtime.mcpPrefix || '',
      paths: runtime.paths || {},
      agents: runtime.agentNaming === 'snake_case' ? KNOWN_AGENTS : AGENT_NAMES,
      agent_capabilities: AGENT_CAPABILITIES,
      plan_mode_native: runtime.planModeNative === true,
      workspace_suggestion: workspaceSuggestion || null,
    };
  }
}

module.exports = { RuntimeContent };
