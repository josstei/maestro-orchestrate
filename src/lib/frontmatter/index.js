'use strict';

/**
 * Unified frontmatter parsing module.
 *
 * Consolidates three distinct boundary-detection implementations and two YAML
 * escaping implementations into a single authoritative module.
 *
 * Boundary detection approaches unified:
 *   - Character-offset indexOf (agent-stub.js, parseFrontmatterOnly)
 *   - Line-split iteration (core/frontmatter-parser.js parse)
 *   - Regex multiline match (skill-metadata.js)
 *
 * @module lib/frontmatter
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
 * Split content at the frontmatter boundary using line iteration.
 *
 * Unifies the three boundary-detection approaches into one canonical
 * implementation. Uses line-split iteration (the most permissive approach)
 * which handles all edge cases including content without a trailing newline
 * after the closing delimiter.
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
  const { raw, body } = splitAtBoundary(content);

  if (raw === '' && body === content) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = raw.split('\n');
  const frontmatter = parseLines(fmLines, parseValue);

  return { frontmatter, body };
}

/**
 * Parse frontmatter returning raw string values without type coercion (simple parser).
 *
 * Uses substring-based boundary detection (`---\n` prefix and `\n---\n`
 * closing). Returns a plain object whose values are always raw strings.
 *
 * This intentionally uses stricter boundary detection than {@link parse} or
 * {@link splitAtBoundary}: it requires a newline after the closing `---`
 * delimiter. This preserves the historical contract where content ending
 * exactly at `---` (no trailing newline) returns an empty object.
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

  const lines = content.slice(4, end).split('\n');
  return parseLines(lines, (v) => v);
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
  parseFrontmatterOnly,
  extractValue,
  escapeYaml,
  splitAtBoundary,
  parseValue,
  parseDoubleQuotedValue,
};
