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

export type FrontmatterValue = string | number | string[];
export type Frontmatter = Record<string, FrontmatterValue>;
export interface ParsedFrontmatter<T extends Record<string, unknown> = Frontmatter> {
  readonly frontmatter: T;
  readonly body: string;
}
export interface SplitFrontmatter {
  readonly raw: string;
  readonly body: string;
}

/**
 * Parse a double-quoted string value with escape sequence support.
 *
 * Handles \n, \r, \t, \\, and \" escape sequences. Unknown escape sequences
 * preserve the backslash character.
 *
 */
function parseDoubleQuotedValue(raw: string): string {
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
 */
function parseValue(raw: string): FrontmatterValue {
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
 */
function splitAtBoundary(content: string): SplitFrontmatter {
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
 */
function parseLines<T>(lines: string[], valueFn: (value: string) => T): Record<string, T> {
  const frontmatter: Record<string, T> = {};

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
 */
function parse(content: string): ParsedFrontmatter {
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
 * closing). Returns a wrapper object with a frontmatter map (raw string
 * values) and the remaining body text.
 *
 * This intentionally uses stricter boundary detection than {@link parse} or
 * {@link splitAtBoundary}: it requires a newline after the closing `---`
 * delimiter. This preserves the historical contract where content ending
 * exactly at `---` (no trailing newline) returns empty frontmatter with the
 * full content as body.
 *
 * Returns empty frontmatter and the full content as body when no valid
 * frontmatter block is found.
 *
 */
function parseFrontmatterOnly(content: string): ParsedFrontmatter<Record<string, string>> {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content };
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }

  const lines = content.slice(4, end).split('\n');
  const frontmatter = parseLines(lines, (v) => v);
  const body = content.slice(end + 5);

  return { frontmatter, body };
}

/**
 * Extract a single frontmatter value by key via regex.
 *
 * Searches for `key: value` on its own line within the content. Does not
 * require the content to have valid frontmatter delimiters -- works on any
 * text that contains `key: value` lines.
 *
 */
function extractValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`(?:^|\\n)${key}:\\s*(.+)$`, 'm'));
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Escape special characters in a YAML string value.
 *
 * Escapes backslashes and double quotes for safe embedding inside a
 * double-quoted YAML scalar. Non-string inputs are coerced via String().
 *
 */
function escapeYaml(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export { parse, parseFrontmatterOnly, extractValue, escapeYaml, splitAtBoundary, parseValue, parseDoubleQuotedValue };
