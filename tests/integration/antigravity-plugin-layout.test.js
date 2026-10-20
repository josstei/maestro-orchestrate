'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { ANTIGRAVITY_SUBAGENT_TOOLS } = require('../support/antigravity-tools');
const {
  AGENT_COUNT,
  PUBLIC_SKILL_COUNT,
  SHARED_SKILL_COUNT,
  listCanonicalAgents,
  publicSkillNames,
} = require('../support/catalog');
const { readJson } = require('../support/fs');
const { readStubFrontmatter } = require('../support/generated-files');
const { SRC_ROOT } = require('../support/paths');
const hookRegistry = require('../../src/generated/hook-registry.json');

// `agy plugin install` copies the directory holding plugin.json to
// ~/.gemini/config/plugins/<name>/ and loads mcp_config.json, hooks.json,
// agents/ and skills/ from that root, so the plugin must be self-contained.
const PLUGIN_DIR = path.join(ROOT, 'antigravity');
const SRC_SHARED_SKILLS_DIR = path.join(SRC_ROOT, 'skills', 'shared');

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop'];
const GROUPED_HOOK_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

const PACKAGE_VERSION = readJson(path.join(ROOT, 'package.json')).version;

function readPluginJson(relPath) {
  return readJson(path.join(PLUGIN_DIR, relPath));
}

function listSubdirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every hook handler in hooks.json, with the event it is registered for. */
function hookHandlers(hooks) {
  return Object.values(hooks).flatMap((events) =>
    Object.entries(events).flatMap(([event, entries]) =>
      GROUPED_HOOK_EVENTS.has(event)
        ? entries.flatMap((group) => group.hooks.map((handler) => ({ event, handler })))
        : entries.map((handler) => ({ event, handler }))
    )
  );
}

describe('antigravity plugin layout', () => {
  it('keeps the plugin root to the files Antigravity loads, the shims and the bundled src/', () => {
    assert.deepEqual(fs.readdirSync(PLUGIN_DIR).sort(), [
      'README.md',
      'agents',
      'hooks',
      'hooks.json',
      'mcp',
      'mcp_config.json',
      'plugin.json',
      'skills',
      'src',
    ]);
    // Antigravity injects a plugin's rules/ into every conversation; Maestro ships none.
    assert.equal(fs.existsSync(path.join(PLUGIN_DIR, 'rules')), false);
  });

  it('keeps plugin.json to the manifest fields, at the package version', () => {
    const manifest = readPluginJson('plugin.json');
    assert.deepEqual(Object.keys(manifest), ['name', 'displayName', 'version', 'description', 'suggestedPrompts']);
    assert.equal(manifest.name, 'maestro');
    assert.equal(manifest.displayName, 'Maestro');
    assert.equal(manifest.version, PACKAGE_VERSION);
    assert.ok(manifest.description, 'Expected a description');
    assert.ok(
      manifest.description.length <= 160,
      `Description is ${manifest.description.length} characters; Antigravity keeps it to 160`
    );
    assert.equal(manifest.suggestedPrompts.length, 3);
    for (const prompt of manifest.suggestedPrompts) {
      assert.equal(typeof prompt, 'string');
      assert.ok(prompt, 'Expected a non-empty suggested prompt');
    }
  });

  it('launches the bundled MCP server from mcp_config.json against the plugin root', () => {
    const { mcpServers } = readPluginJson('mcp_config.json');
    assert.deepEqual(mcpServers, {
      maestro: {
        command: 'node',
        args: ['${PLUGIN_ROOT}/mcp/maestro-server.js'],
      },
    });

    const serverPath = mcpServers.maestro.args[0].replace('${PLUGIN_ROOT}', PLUGIN_DIR);
    assert.ok(fs.statSync(serverPath).isFile(), `Expected ${serverPath} to exist`);
  });

  it('declares named hooks in hooks.json at the plugin root, in the event shapes Antigravity reads', () => {
    assert.equal(
      fs.existsSync(path.join(PLUGIN_DIR, 'hooks', 'hooks.json')),
      false,
      'Antigravity reads hooks.json from the plugin root, not hooks/'
    );

    const hooks = readPluginJson('hooks.json');
    assert.equal(hooks.hooks, undefined, 'hooks.json has no "hooks" wrapper; its top level is named hooks');
    for (const [hookName, events] of Object.entries(hooks)) {
      for (const event of Object.keys(events)) {
        assert.ok(HOOK_EVENTS.includes(event), `${hookName}: unknown Antigravity hook event ${event}`);
      }
    }

    const sessionStart = Object.values(hooks).flatMap((events) => events.SessionStart || []);
    assert.deepEqual(
      sessionStart.map((handler) => handler.command),
      [
        'node hooks/hook-runner.js antigravity session-start',
        'node hooks/hook-runner.js antigravity before-agent',
      ],
      'SessionStart is a flat handler list'
    );

    const preToolUse = Object.values(hooks).flatMap((events) => events.PreToolUse || []);
    assert.deepEqual(
      preToolUse.map((group) => [group.matcher, group.hooks.map((handler) => handler.command)]),
      [['run_command', ['node hooks/policy-enforcer.js']]],
      'PreToolUse groups handlers under a tool-name matcher'
    );

    for (const { event, handler } of hookHandlers(hooks)) {
      assert.deepEqual(Object.keys(handler), ['type', 'command', 'timeout'], `${event}: ${handler.command}`);
      assert.equal(handler.type, 'command');
      assert.ok(
        Number.isInteger(handler.timeout) && handler.timeout > 0 && handler.timeout <= 60,
        `${handler.command}: timeout ${handler.timeout} must be whole seconds`
      );

      // Hooks run from the plugin root, and PLUGIN_ROOT is not exported to them.
      const [, script, hookArgs] = handler.command.match(/^node (hooks\/[a-z-]+\.js)(?: (.+))?$/) || [];
      assert.ok(script, `${handler.command}: expected node hooks/<script>.js`);
      assert.ok(fs.statSync(path.join(PLUGIN_DIR, script)).isFile(), `Expected ${script} to exist`);
      if (script === 'hooks/hook-runner.js') {
        const [runtime, hookName] = hookArgs.split(' ');
        assert.equal(runtime, 'antigravity', handler.command);
        assert.ok(hookRegistry[hookName], `${handler.command}: ${hookName} is not a registered hook`);
      }
    }
  });

  it('generates one subagent stub per canonical agent, with Antigravity tool names only', () => {
    const canonicalAgents = listCanonicalAgents();
    assert.equal(canonicalAgents.length, AGENT_COUNT);

    const agentsDir = path.join(PLUGIN_DIR, 'agents');
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    assert.deepEqual(entries.filter((entry) => !entry.isFile()).map((entry) => entry.name), []);
    assert.deepEqual(
      entries.map((entry) => entry.name).sort(),
      canonicalAgents.map((name) => `${name}.md`)
    );

    for (const name of canonicalAgents) {
      const stubPath = path.join(agentsDir, `${name}.md`);
      const frontmatter = readStubFrontmatter(stubPath);

      assert.deepEqual(
        Object.keys(frontmatter),
        ['name', 'description', 'subagent', 'mainAgent', 'model', 'tools'],
        stubPath
      );
      assert.equal(frontmatter.name, name, stubPath);
      assert.match(frontmatter.description, /^"(?:[^"\\]|\\.)+"$/, `${stubPath}: description must be quoted`);
      assert.equal(frontmatter.subagent, 'true', stubPath);
      assert.equal(frontmatter.mainAgent, 'false', stubPath);
      assert.equal(frontmatter.model, 'inherit', stubPath);

      assert.ok(Array.isArray(frontmatter.tools), `${stubPath}: tools must be a block list`);
      assert.ok(frontmatter.tools.length > 0, `${stubPath}: no tools`);
      assert.equal(new Set(frontmatter.tools).size, frontmatter.tools.length, `${stubPath}: duplicate tools`);
      for (const tool of frontmatter.tools) {
        assert.ok(ANTIGRAVITY_SUBAGENT_TOOLS.has(tool), `${stubPath}: ${tool} is not an Antigravity subagent tool`);
      }

      assert.ok(
        fs.readFileSync(stubPath, 'utf8').includes(`Call \`get_agent(agents: ["${name}"])\``),
        `${stubPath}: body must point at get_agent`
      );
    }
  });

  it(`generates the ${PUBLIC_SKILL_COUNT} public skills and the ${SHARED_SKILL_COUNT} shared skills, one SKILL.md per folder named after it`, () => {
    const publicSkills = publicSkillNames('antigravity');
    assert.equal(publicSkills.length, PUBLIC_SKILL_COUNT);
    const sharedSkills = listSubdirs(SRC_SHARED_SKILLS_DIR);
    assert.equal(sharedSkills.length, SHARED_SKILL_COUNT);

    const skillsDir = path.join(PLUGIN_DIR, 'skills');
    assert.deepEqual(listSubdirs(skillsDir), [...publicSkills, ...sharedSkills].sort());

    for (const folder of listSubdirs(skillsDir)) {
      const skillDir = path.join(skillsDir, folder);
      assert.deepEqual(fs.readdirSync(skillDir), ['SKILL.md'], skillDir);

      const skillPath = path.join(skillDir, 'SKILL.md');
      const frontmatter = readStubFrontmatter(skillPath);
      assert.equal(frontmatter.name, folder, skillPath);
      assert.ok(frontmatter.description, `${skillPath}: missing description`);

      // Shared methodology skills stay out of the slash-command menu.
      if (sharedSkills.includes(folder)) {
        assert.deepEqual(Object.keys(frontmatter), ['name', 'description', 'disable-slash-command'], skillPath);
        assert.equal(frontmatter['disable-slash-command'], 'true', skillPath);
      } else {
        assert.deepEqual(Object.keys(frontmatter), ['name', 'description'], skillPath);
      }
    }
  });

  it('bundles a src/ payload at the package version, with only the antigravity and shared platform dirs', () => {
    assert.deepEqual(readPluginJson('src/version.json'), { version: PACKAGE_VERSION });
    assert.deepEqual(listSubdirs(path.join(PLUGIN_DIR, 'src', 'platforms')), ['antigravity', 'shared']);
  });

  it('bundles every state script the served architecture reference tells Antigravity to run', () => {
    // runtime-config enables scriptBasedStateContract, which is served as
    // `node ${PLUGIN_ROOT}/src/scripts/<script>` against the installed plugin.
    const architecture = fs.readFileSync(path.join(SRC_ROOT, 'references', 'architecture.md'), 'utf8');
    const scripts = [...architecture.matchAll(/\$\{extensionPath\}\/src\/scripts\/([\w-]+\.js)/g)].map(([, script]) => script);
    assert.ok(scripts.length > 0, 'architecture.md names no state scripts');
    for (const script of scripts) {
      assert.ok(fs.statSync(path.join(PLUGIN_DIR, 'src', 'scripts', script)).isFile(), `Expected src/scripts/${script} in the plugin`);
    }
  });

  it('keeps the hand-maintained shims, each with its bundled entry point', () => {
    for (const [shim, bundledEntry] of [
      ['mcp/maestro-server.js', 'src/mcp/maestro-server.js'],
      ['hooks/hook-runner.js', 'src/platforms/shared/hook-runner.js'],
      ['hooks/policy-enforcer.js', 'src/platforms/antigravity/policy-enforcer.js'],
    ]) {
      const shimSource = fs.readFileSync(path.join(PLUGIN_DIR, shim), 'utf8');
      assert.ok(
        shimSource.includes(`path.resolve(__dirname, '../${bundledEntry}')`),
        `${shim}: expected a fallback to the bundled ${bundledEntry}`
      );
      assert.ok(fs.statSync(path.join(PLUGIN_DIR, bundledEntry)).isFile(), `Expected ${bundledEntry} to exist`);
    }
  });
});
