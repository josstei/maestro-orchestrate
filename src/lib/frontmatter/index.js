'use strict';

/**
 * Frontmatter parsing (boundary splitting, key-value parsing, scalar
 * coercion) shared by the generator, transforms, and MCP content tools.
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

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return { raw: '', body: content };
  }

  const raw = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');

  return { raw, body };
}

/**
 * Parse frontmatter key-value lines into an object, coercing each value via
 * {@link parseValue}.
 *
 * @param {string[]} lines - Lines between frontmatter delimiters.
 * @returns {Object} Parsed frontmatter object.
 */
function parseLines(lines) {
  const frontmatter = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    frontmatter[key] = parseValue(rawValue);
  }

  return frontmatter;
}

/**
 * Parse frontmatter with type coercion.
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
  const { raw, body } = splitAtBoundary(content);
  return { frontmatter: parseLines(raw.split('\n')), body };
}

module.exports = {
  parse,
  splitAtBoundary,
};
