'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { discover, generateRegistry } = require('../../src/lib/discovery');
const { parse } = require('../../src/lib/frontmatter');
const { toPascalCase } = require('../../src/lib/naming');
const registryScanner = require('../../src/generator/registry-scanner');

const WORKTREE_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(WORKTREE_ROOT, 'src');
const GENERATED_DIR = path.join(SRC_DIR, 'generated');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-discovery-parity-'));

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('discovery-parity: agent-registry.json byte-for-byte', () => {
  it('generateRegistry() produces byte-identical output to src/generated/agent-registry.json', () => {
    const agentsDir = path.join(SRC_DIR, 'agents');
    const expectedPath = path.join(GENERATED_DIR, 'agent-registry.json');
    const actualPath = path.join(tmpDir, 'agent-registry.json');

    const entries = discover({
      dir: agentsDir,
      pattern: '*.md',
      identity: (fp) => {
        const content = fs.readFileSync(fp, 'utf8');
        const { frontmatter } = parse(content);
        return frontmatter.name || path.basename(fp, '.md');
      },
      metadata: (fp, content) => {
        const { frontmatter } = parse(content);
        const name = frontmatter.name || path.basename(fp, '.md');
        const capabilities = frontmatter.capabilities || 'read_only';
        const rawTools = frontmatter.tools || [];
        const tools = Array.isArray(rawTools) ? rawTools : [rawTools];
        return { name, capabilities, tools };
      },
    });

    const registryData = entries.map(({ name, capabilities, tools }) => ({
      name,
      capabilities,
      tools,
    }));

    generateRegistry(registryData, actualPath);

    const expectedBytes = fs.readFileSync(expectedPath);
    const actualBytes = fs.readFileSync(actualPath);
    assert.ok(
      Buffer.compare(expectedBytes, actualBytes) === 0,
      'agent-registry.json byte mismatch'
    );
  });
});

describe('discovery-parity: hook-registry.json byte-for-byte', () => {
  it('generateRegistry() produces byte-identical output to src/generated/hook-registry.json', () => {
    const logicDir = path.join(SRC_DIR, 'hooks', 'logic');
    const expectedPath = path.join(GENERATED_DIR, 'hook-registry.json');
    const actualPath = path.join(tmpDir, 'hook-registry.json');

    const entries = discover({
      dir: logicDir,
      pattern: '*-logic.js',
      identity: (fp) => path.basename(fp).replace(/-logic\.js$/, ''),
      metadata: (fp) => {
        const file = path.basename(fp);
        const hookName = file.replace(/-logic\.js$/, '');
        return {
          module: `hooks/logic/${file}`,
          fn: `handle${toPascalCase(hookName)}`,
        };
      },
    });

    const registryData = {};
    for (const entry of entries) {
      registryData[entry.id] = { module: entry.module, fn: entry.fn };
    }

    generateRegistry(registryData, actualPath);

    const expectedBytes = fs.readFileSync(expectedPath);
    const actualBytes = fs.readFileSync(actualPath);
    assert.ok(
      Buffer.compare(expectedBytes, actualBytes) === 0,
      'hook-registry.json byte mismatch'
    );
  });
});

describe('discovery-parity: resource-registry.json byte-for-byte', () => {
  it('generateRegistry() serializes scanResources() data identically to src/generated/resource-registry.json', () => {
    const expectedPath = path.join(GENERATED_DIR, 'resource-registry.json');
    const actualPath = path.join(tmpDir, 'resource-registry.json');

    const registryData = registryScanner.scanResources(SRC_DIR);
    generateRegistry(registryData, actualPath);

    const expectedBytes = fs.readFileSync(expectedPath);
    const actualBytes = fs.readFileSync(actualPath);
    assert.ok(
      Buffer.compare(expectedBytes, actualBytes) === 0,
      'resource-registry.json byte mismatch'
    );
  });

  it('discover() produces structurally identical resource data to scanResources()', () => {
    const skillsSharedDir = path.join(SRC_DIR, 'skills', 'shared');
    const skillsParentDir = path.join(SRC_DIR, 'skills');

    const skillEntries = discover({
      dir: skillsSharedDir,
      pattern: '**/*.md',
      identity: (fp) => {
        const filename = path.basename(fp);
        if (filename === 'SKILL.md') {
          return path.basename(path.dirname(fp));
        }
        return path.basename(fp, '.md');
      },
      metadata: (fp) => {
        const relativePath = 'skills/' + path.relative(skillsParentDir, fp)
          .split(path.sep)
          .join('/');
        return { relativePath };
      },
    });

    const templatesDir = path.join(SRC_DIR, 'templates');
    const templateEntries = discover({
      dir: templatesDir,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: (fp) => {
        const file = path.basename(fp);
        return { relativePath: `templates/${file}` };
      },
    });

    const referencesDir = path.join(SRC_DIR, 'references');
    const referenceEntries = discover({
      dir: referencesDir,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: (fp) => {
        const file = path.basename(fp);
        return { relativePath: `references/${file}` };
      },
    });

    const discovered = {};
    for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries]) {
      discovered[entry.id] = entry.relativePath;
    }

    const expected = registryScanner.scanResources(SRC_DIR);
    assert.deepStrictEqual(discovered, expected);
  });
});
