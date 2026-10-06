'use strict';

/**
 * Frontmatter parsing (boundary splitting, key-value parsing, scalar
 * coercion, single-key extraction) and YAML escaping shared by the
 * generator, transforms, and MCP content tools.
 *
 * @module lib/frontmatter
 */

const DOUBLE_QUOTED_ESCAPES = { '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' };

/**
 * Parse a double-quoted string value with escape sequence support.
 *
 * Handles \n, \r, \t, \\, and \" escape sequences. Unknown escape sequences
 * preserve the backslash character.
 *
 * @param {string} raw - The inner content of a double-quoted string (without outer quotes).
 * @returns {string} The unescaped string value.
 */
function parseDoubleQuotedValue(raw) {
  return raw.replace(/\\(["\\nrt])/g, (_, c) => DOUBLE_QUOTED_ESCAPES[c]);
}

/**
 * Parse a YAML-like scalar value with type coercion.
 *
 * Supports inline arrays ([a, b, c]), double-quoted strings with escape
 * sequences, single-quoted strings with '' escaping, numeric literals, and
 * bare string values.
 *
 * @param {string} raw - The raw value string to parse.
 * @returns {string|number|string[]} The parsed value.
 */
function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    if (inner.trim() === '') return [];
    return inner.split(',').map((s) => s.trim());
  }

  if (raw.startsWith('"') && raw.endsWith('"')) {
    return parseDoubleQuotedValue(raw.slice(1, -1));
  }

  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }

  const num = Number(raw);
  if (raw !== '' && !isNaN(num)) {
    return num;
  }

  return raw;
}

/**
 * Split content at the frontmatter boundary using line iteration.
 *
 * The opening `---` must be the first line; the block ends at the next line
 * that is exactly `---`, with or without a trailing newline after it.
 *
 * @param {string} content - The full content string with optional frontmatter.
 * @returns {{ raw: string, body: string }} The raw frontmatter text (between
 *   delimiters, excluding them) and the remaining body. When no valid
 *   frontmatter block is found, raw is '' and body is the original content.
 */
function splitAtBoundary(content) {
  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return { raw: '', body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { raw: '', body: content };
  }

  const raw = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');

  return { raw, body };
}

/**
 * Parse frontmatter key-value lines into an object.
 *
 * @param {string[]} lines - Lines between frontmatter delimiters.
 * @param {function} valueFn - Function to apply to each raw value string.
 * @returns {Object} Parsed frontmatter object.
 */
function parseLines(lines, valueFn) {
  const frontmatter = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    frontmatter[key] = valueFn(rawValue);
  }

  return frontmatter;
}

/**
 * Parse frontmatter key-value pairs.
 *
 * Splits content on `---` delimiters via {@link splitAtBoundary} and applies
 * `valueFn` to each raw value. The default, {@link parseValue}, converts
 * arrays, numbers, and quoted strings to their native types; pass an identity
 * function to keep raw string values.
 *
 * Returns empty frontmatter and the full content as body when no valid
 * frontmatter block is found (missing opening or closing `---`).
 *
 * @param {string} content - The full content string with optional frontmatter.
 * @param {function(string): *} [valueFn=parseValue] - Transform applied to each raw value.
 * @returns {{ frontmatter: Object, body: string }} Parsed frontmatter object and remaining body.
 */
function parse(content, valueFn = parseValue) {
  const { raw, body } = splitAtBoundary(content);
  return { frontmatter: parseLines(raw.split('\n'), valueFn), body };
}

/**
 * Extract a single frontmatter value by key via regex.
 *
 * Searches for `key: value` on its own line within the content. Does not
 * require the content to have valid frontmatter delimiters -- works on any
 * text that contains `key: value` lines.
 *
 * @param {string} content - The content string to search.
 * @param {string} key - The frontmatter key to extract.
 * @returns {string|null} The trimmed value string, or null if the key is not found.
 */
function extractValue(content, key) {
  const match = content.match(new RegExp(`(?:^|\\n)${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Escape special characters in a YAML string value.
 *
 * Escapes backslashes and double quotes for safe embedding inside a
 * double-quoted YAML scalar. Non-string inputs are coerced via String().
 *
 * @param {string} value - Value to escape.
 * @returns {string} Escaped value safe for double-quoted YAML context.
 */
function escapeYaml(value) {
  if (typeof value !== 'string') return String(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = {
  parse,
  extractValue,
  escapeYaml,
  splitAtBoundary,
  parseValue,
  parseDoubleQuotedValue,
};
