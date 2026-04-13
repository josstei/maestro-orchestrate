'use strict';

/**
 * Unified frontmatter parsing module.
 *
 * Consolidates the rich parser from inject-frontmatter.js (with full type
 * coercion) and the simple parser from runtime-content.js (raw string values)
 * into a single canonical module.
 *
 * @module core/frontmatter-parser
 */

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
 * Parse frontmatter with full type coercion (rich parser).
 *
 * Splits content on `---` delimiters and parses key-value pairs with type
 * coercion via {@link parseValue}. Arrays, numbers, and quoted strings are
 * converted to their native types.
 *
 * Returns empty frontmatter and the full content as body when no valid
 * frontmatter block is found (missing opening or closing `---`).
 *
 * @param {string} content - The full content string with optional frontmatter.
 * @returns {{ frontmatter: Object, body: string }} Parsed frontmatter object and remaining body.
 */
function parse(content) {
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
 * Parse frontmatter returning raw string values without type coercion (simple parser).
 *
 * Uses substring-based boundary detection (`---\n` prefix and `\n---\n`
 * closing). Returns a plain object whose values are always raw strings.
 *
 * Returns an empty object when no valid frontmatter block is found.
 *
 * @param {string} content - The full content string with optional frontmatter.
 * @returns {Object<string, string>} Key-value map of raw frontmatter entries.
 */
function parseFrontmatterOnly(content) {
  if (!content.startsWith('---\n')) {
    return {};
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return {};
  }

  const frontmatter = {};
  const lines = content.slice(4, end).split('\n');

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = rawValue;
  }

  return frontmatter;
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

module.exports = {
  parse,
  parseFrontmatterOnly,
  extractValue,
  parseValue,
  parseDoubleQuotedValue,
};
