'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { discover, generateRegistry } = require('../lib/discovery');
const { parse } = require('../lib/frontmatter');
const { toPascalCase } = require('../lib/naming');

/**
 * Run all discovery scans and write the resulting JSON registry files to
 * src/generated/.
 * @param {string} srcDir - Absolute path to the src/ directory
 */
function generateRegistries(srcDir) {
  const generatedDir = path.join(srcDir, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const agentEntries = discover({
    dir: path.join(srcDir, 'agents'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath, content) => {
      const { frontmatter } = parse(content);
      const name = frontmatter.name || path.basename(filepath, '.md');
      const capabilities = frontmatter.capabilities || 'read_only';
      const rawTools = frontmatter.tools || [];
      const tools = Array.isArray(rawTools) ? rawTools : [rawTools];
      return { name, capabilities, tools };
    },
  });
  const agents = agentEntries.map(({ name, capabilities, tools }) => ({ name, capabilities, tools }));
  generateRegistry(agents, path.join(generatedDir, 'agent-registry.json'));

  const skillsParentDir = path.join(srcDir, 'skills');
  const skillEntries = discover({
    dir: path.join(srcDir, 'skills', 'shared'),
    pattern: '**/*.md',
    identity: (filepath) => {
      if (path.basename(filepath) === 'SKILL.md') {
        return path.basename(path.dirname(filepath));
      }
      return path.basename(filepath, '.md');
    },
    metadata: (filepath) => {
      const relativePath = 'skills/' + path.relative(skillsParentDir, filepath)
        .split(path.sep)
        .join('/');
      return { relativePath };
    },
  });

  const templateEntries = discover({
    dir: path.join(srcDir, 'templates'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `templates/${path.basename(filepath)}`,
    }),
  });

  const referenceEntries = discover({
    dir: path.join(srcDir, 'references'),
    pattern: '*.md',
    identity: (filepath) => path.basename(filepath, '.md'),
    metadata: (filepath) => ({
      relativePath: `references/${path.basename(filepath)}`,
    }),
  });

  const resources = {};
  for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries]) {
    resources[entry.id] = entry.relativePath;
  }
  generateRegistry(resources, path.join(generatedDir, 'resource-registry.json'));

  const hookEntries = discover({
    dir: path.join(srcDir, 'hooks', 'logic'),
    pattern: '*-logic.js',
    identity: (filepath) => path.basename(filepath).replace(/-logic\.js$/, ''),
    metadata: (filepath) => {
      const file = path.basename(filepath);
      const hookName = file.replace(/-logic\.js$/, '');
      return {
        module: `hooks/logic/${file}`,
        fn: `handle${toPascalCase(hookName)}`,
      };
    },
  });

  const hooks = {};
  for (const entry of hookEntries) {
    hooks[entry.id] = { module: entry.module, fn: entry.fn };
  }
  generateRegistry(hooks, path.join(generatedDir, 'hook-registry.json'));
}

module.exports = { generateRegistries };
