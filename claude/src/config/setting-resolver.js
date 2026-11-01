'use strict';

const path = require('node:path');
const { readFileSafe } = require('../lib/io');

// Setting resolution can precede runtime selection. Claude's injected plugin
// root remains the fallback for the canonical extension override.
const EXTENSION_ROOT_ENV_VARS = ['MAESTRO_EXTENSION_PATH', 'CLAUDE_PLUGIN_ROOT'];

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

/** Parse a .env file; a missing or unreadable file has no values. */
function parseEnvFile(filePath) {
  const values = {};
  const warnings = [];
  const lines = readFileSafe(filePath).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const stripped = trimmed.replace(/^export\s+/, '');
    const eqIndex = stripped.indexOf('=');
    // A blank line has no '=' and an empty key puts it first, so both skip.
    if (trimmed.startsWith('#') || eqIndex < 1) continue;
    const key = stripped.slice(0, eqIndex);
    const rawValue = stripped.slice(eqIndex + 1);
    if (!rawValue.startsWith('"') || rawValue.includes('"', 1)) {
      const value = stripInlineComment(rawValue);
      values[key] = /^["']/.test(value) && value.endsWith(value[0]) ? value.slice(1, -1) : value;
      continue;
    }
    // An unclosed double quote continues to the next line ending in an unescaped quote.
    const parts = [rawValue.slice(1)];
    while (++i < lines.length && !/(?<!\\)"$/.test(lines[i])) parts.push(lines[i]);
    if (i < lines.length) parts.push(lines[i].slice(0, -1));
    else warnings.push(`env-file-parser: unclosed quote for key "${key}", treating accumulated content as value`);
    values[key] = parts.join('\n');
  }
  return { values, warnings };
}

/** Lazily snapshot each .env file for one request; process.env remains live. */
function createSettingResolver(projectRoot, { onWarning = (message) => console.warn(message) } = {}) {
  const files = new Map();

  // An unset root yields undefined (not {}) so no prototype lookup happens for
  // it. Cached warnings replay on every read so each source warns as if read on
  // its own, even when workspace and extension resolve to the same file.
  function readSource(root) {
    if (typeof root !== 'string' || root === '') return undefined;
    const filePath = path.join(root, '.env');
    if (!files.has(filePath)) files.set(filePath, parseEnvFile(filePath));
    const { values, warnings } = files.get(filePath);
    for (const warning of warnings) onWarning(warning);
    return values;
  }

  // The first non-empty source wins, so a .env file is read only when every
  // higher-priority source is empty.
  return (varName) => process.env[varName]
    || readSource(projectRoot)?.[varName]
    || readSource(EXTENSION_ROOT_ENV_VARS.map((name) => process.env[name]).find(Boolean))?.[varName]
    || undefined;
}

function resolveSetting(varName, projectRoot) {
  return createSettingResolver(projectRoot)(varName);
}

module.exports = { createSettingResolver, EXTENSION_ROOT_ENV_VARS, parseEnvFile, resolveSetting };
