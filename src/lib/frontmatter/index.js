'use strict';

// Frontmatter parsing shared by the generator and the MCP content tools.

const DOUBLE_QUOTED_ESCAPES = { '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' };

// Coerces [a, b] arrays, "double-quoted" strings with \n \r \t \\ \" escapes (others keep the
// backslash), 'single-quoted' strings with '' escapes, and numbers; anything else stays a string.
function parseValue(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    if (inner.trim() === '') return [];
    return inner.split(',').map((s) => s.trim());
  }

  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\nrt])/g, (_, c) => DOUBLE_QUOTED_ESCAPES[c]);
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

// The block runs from a first-line `---` to the next `---` line, after CRLF is normalized to
// LF. Without a closed block the frontmatter is empty and the body is the whole content.
function parse(content) {
  const text = content.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end === -1) {
    return { frontmatter: {}, body: text };
  }

  const frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();
    frontmatter[key] = parseValue(rawValue);
  }

  return { frontmatter, body: lines.slice(end + 1).join('\n') };
}

module.exports = { parse };
