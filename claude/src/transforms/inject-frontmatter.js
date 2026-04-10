/**
 * Transform: inject-frontmatter
 *
 * Parses canonical agent frontmatter, rebuilds it per runtime config,
 * and handles Claude's requirement to embed <example> blocks from the
 * body into the description: | YAML field.
 *
 * @param {string} content  — full agent file with --- delimited frontmatter
 * @param {object} runtime  — runtime config (name, agentNaming, agentFrontmatter, tools)
 * @param {object} _options — unused
 * @returns {string}
 */
function injectFrontmatter(content, runtime, _options) {
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = runtime.agentFrontmatter || {};

  // Resolve agent name
  const name = resolveAgentName(frontmatter.name, runtime.agentNaming);

  // Resolve tools: prefer tools.<runtime> override, else map through runtime.tools
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

  // Handle examples: Claude embeds them in description, Gemini keeps in body
  let description = frontmatter.description || '';
  let outputBody = body;

  if (runtime.name === 'claude') {
    const { examples, remaining } = extractExamples(body);
    outputBody = remaining;

    if (examples.length > 0) {
      // Build block scalar with description + examples
      const exampleText = examples.join('\n');
      description = description + '\n\n' + exampleText;
    }
  }

  // Build output frontmatter lines
  const lines = [];
  lines.push('---');
  if (name != null && name !== '') {
    lines.push(`name: ${name}`);
  }

  // Gemini: kind after name, before description
  if (fm.kind) {
    lines.push(`kind: ${fm.kind}`);
  }

  // Description
  if (runtime.name === 'claude' && description.includes('\n')) {
    lines.push('description: |');
    for (const dl of description.split('\n')) {
      lines.push(`  ${dl}`);
    }
  } else {
    lines.push(`description: "${escapeYamlString(frontmatter.description || '')}"`);
  }

  // Claude: model after description
  if (fm.model) {
    lines.push(`model: ${fm.model}`);
  }

  // Color (Claude only)
  if (runtime.name === 'claude' && frontmatter.color) {
    lines.push(`color: ${frontmatter.color}`);
  }

  // Gemini: tools before temperature/turns/timeout
  // Claude: maxTurns before tools
  if (runtime.name === 'gemini') {
    // Tools first
    if (tools.length > 0) {
      lines.push('tools:');
      for (const tool of tools) {
        lines.push(`  - ${tool}`);
      }
    }
    // Then temperature, max_turns, timeout_mins
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
    // Claude: maxTurns then tools
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

/**
 * Parse --- delimited YAML-like frontmatter from content.
 * Returns { frontmatter: object, body: string }.
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    return { frontmatter: {}, body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join('\n');
  const frontmatter = {};

  for (const line of fmLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    frontmatter[key] = parseValue(rawValue);
  }

  return { frontmatter, body };
}

/**
 * Parse a YAML-like value: inline arrays, numbers, quoted strings, bare strings.
 */
function parseValue(raw) {
  // Inline array: [a, b, c]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    if (inner.trim() === '') return [];
    return inner.split(',').map((s) => s.trim());
  }

  // Quoted string
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return parseDoubleQuotedValue(raw.slice(1, -1));
  }

  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }

  // Numeric
  const num = Number(raw);
  if (raw !== '' && !isNaN(num)) {
    return num;
  }

  return raw;
}

function parseDoubleQuotedValue(raw) {
  let value = '';

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char !== '\\' || next == null) {
      value += char;
      continue;
    }

    switch (next) {
      case '"':
        value += '"';
        i++;
        break;
      case '\\':
        value += '\\';
        i++;
        break;
      case 'n':
        value += '\n';
        i++;
        break;
      case 'r':
        value += '\r';
        i++;
        break;
      case 't':
        value += '\t';
        i++;
        break;
      default:
        value += char;
        break;
    }
  }

  return value;
}

/**
 * Strip surrounding quotes from a string value if present.
 */
function escapeYamlString(val) {
  if (typeof val !== 'string') return String(val);
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Resolve agent name based on naming convention.
 */
function resolveAgentName(name, naming) {
  if (!name) return name;
  if (naming === 'snake_case') {
    return name.replace(/-/g, '_');
  }
  // kebab-case is the canonical format
  return name;
}

/**
 * Extract <example>...</example> blocks from body text.
 * Returns { examples: string[], remaining: string }.
 */
function extractExamples(body) {
  const examples = [];
  const lines = body.split('\n');
  const remainingLines = [];
  let inExample = false;
  let currentExample = [];

  for (const line of lines) {
    if (line.trim() === '<example>') {
      inExample = true;
      currentExample = ['<example>'];
    } else if (line.trim() === '</example>') {
      inExample = false;
      currentExample.push('</example>');
      examples.push(currentExample.join('\n'));
      currentExample = [];
    } else if (inExample) {
      currentExample.push(line);
    } else {
      remainingLines.push(line);
    }
  }

  if (inExample) {
    throw new Error('Unclosed <example> tag in agent body');
  }

  // Clean up: remove blank lines that surrounded example blocks
  // (avoid double blank lines where examples were removed)
  let remaining = remainingLines.join('\n');
  // Collapse triple+ newlines into double
  remaining = remaining.replace(/\n{3,}/g, '\n\n');
  // If examples were removed from the start of the body, keep a single
  // leading blank line between frontmatter and content.
  remaining = remaining.replace(/^\n{2,}/, '\n');

  return { examples, remaining };
}

module.exports = injectFrontmatter;
