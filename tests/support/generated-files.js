'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

/**
 * Splits `---`-fenced frontmatter lines (fences excluded) from the body; `label` names the
 * document in failure messages.
 */
function splitFrontmatter(content, label = 'content') {
  const lines = content.split('\n');
  assert.equal(lines[0], '---', `${label}: missing opening frontmatter fence`);
  const closingIdx = lines.indexOf('---', 1);
  assert.notEqual(closingIdx, -1, `${label}: missing closing frontmatter fence`);

  return {
    lines: lines.slice(1, closingIdx),
    body: lines.slice(closingIdx + 1).join('\n'),
  };
}

/**
 * Reads the scalar keys (raw, quotes kept) and block lists of a generated frontmatter
 * block; `keyPattern` captures a `key: value` line's key and raw value.
 */
function readStubFrontmatter(filePath, { keyPattern = /^([A-Za-z_-]+):\s*(.*)$/ } = {}) {
  const { lines } = splitFrontmatter(fs.readFileSync(filePath, 'utf8'), filePath);

  const frontmatter = {};
  let listKey = null;
  for (const line of lines) {
    const item = line.match(/^ {2}- (.+)$/);
    if (item && listKey) {
      frontmatter[listKey].push(item[1]);
      continue;
    }
    const [, key, value] = line.match(keyPattern) || [];
    assert.ok(key, `${filePath}: unexpected frontmatter line ${JSON.stringify(line)}`);
    listKey = value === '' ? key : null;
    frontmatter[key] = value === '' ? [] : value;
  }
  return frontmatter;
}

// Claude and Qwen nest events under "hooks" and wrap every handler in a group
// (with an optional matcher); Antigravity's top level is named hooks, and its
// SessionStart handlers are flat.
function hookCommands(config) {
  if (config.hooks) {
    return Object.values(config.hooks).flat()
      .flatMap((group) => {
        assert.ok(Array.isArray(group.hooks), `expected a handler group: ${JSON.stringify(group)}`);
        return group.hooks;
      })
      .map((hook) => hook.command);
  }
  return Object.values(config)
    .flatMap((events) => Object.values(events).flat())
    .flatMap((entry) => entry.hooks || [entry])
    .map((hook) => hook.command);
}

module.exports = {
  hookCommands,
  readStubFrontmatter,
  splitFrontmatter,
};
