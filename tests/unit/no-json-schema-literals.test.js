import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const SCOPED_DIRECTORIES = [
  path.join(ROOT, 'src', 'mcp', 'tool-packs'),
  path.join(ROOT, 'src', 'mcp', 'handlers'),
];

const JSON_SCHEMA_LITERAL_PATTERNS = [
  { name: "type: 'object' literal", pattern: /type\s*:\s*['"]object['"]/ },
  { name: "type: 'string' literal", pattern: /type\s*:\s*['"]string['"]/ },
  { name: "type: 'integer' literal", pattern: /type\s*:\s*['"]integer['"]/ },
  { name: "type: 'array' literal", pattern: /type\s*:\s*['"]array['"]/ },
  { name: "type: 'boolean' literal", pattern: /type\s*:\s*['"]boolean['"]/ },
  { name: 'oneOf shape literal', pattern: /\boneOf\s*:\s*\[/ },
  { name: 'additionalProperties shape literal', pattern: /\badditionalProperties\s*:/ },
];

function collectJsFiles(absolutePath) {
  const stats = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stats) {
    return [];
  }

  if (stats.isFile()) {
    return absolutePath.endsWith('.js') ? [absolutePath] : [];
  }

  const results = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const entryPath = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(entryPath);
    }
  }
  return results;
}

describe('no-json-schema-literals guard', () => {
  it('finds no hand-authored JSON-Schema shape literals under the MCP tool surface', () => {
    const violations = [];

    for (const directory of SCOPED_DIRECTORIES) {
      for (const filePath of collectJsFiles(directory)) {
        const source = fs.readFileSync(filePath, 'utf8');
        for (const { name, pattern } of JSON_SCHEMA_LITERAL_PATTERNS) {
          if (pattern.test(source)) {
            violations.push(`${path.relative(ROOT, filePath)}: ${name}`);
          }
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Hand-rolled JSON-Schema shape literals found in the MCP tool surface (zod owns all tool schemas now):\n${violations.join('\n')}`,
    );
  });
});
