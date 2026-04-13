'use strict';

const { readFileSafe } = require('./file-utils');

function trimQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value) {
  let activeQuote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (activeQuote) {
      if (ch === activeQuote && value[i - 1] !== '\\') {
        activeQuote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      activeQuote = ch;
      continue;
    }
    if (ch === '#' && i > 0 && /\s/.test(value[i - 1])) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function parseEnvFile(filePath) {
  const result = {};
  const content = readFileSafe(filePath, null);
  if (content === null) {
    return result;
  }
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    const stripped = trimmed.replace(/^export\s+/, '');
    const eqIndex = stripped.indexOf('=');
    if (eqIndex === -1) { i++; continue; }
    const key = stripped.slice(0, eqIndex);
    if (!key) { i++; continue; }
    let rawValue = stripped.slice(eqIndex + 1);

    // Multi-line: value starts with " but has no closing " on the same line
    if (rawValue.startsWith('"') && rawValue.indexOf('"', 1) === -1) {
      const valueParts = [rawValue.slice(1)];
      i++;
      let closed = false;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.endsWith('"') && !nextLine.endsWith('\\"')) {
          valueParts.push(nextLine.slice(0, -1));
          closed = true;
          break;
        }
        valueParts.push(nextLine);
        i++;
      }
      if (!closed) {
        console.warn(`env-file-parser: unclosed quote for key "${key}", treating accumulated content as value`);
      }
      result[key] = valueParts.join('\n');
      i++;
      continue;
    }

    rawValue = stripInlineComment(rawValue);
    result[key] = trimQuotes(rawValue);
    i++;
  }
  return result;
}

module.exports = { parseEnvFile };
