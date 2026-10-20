'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const AGENT_REGISTRY = require('../../src/generated/agent-registry.json');
const { ROOT } = require('../support/paths');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const listDir = (d) => fs.readdirSync(path.join(ROOT, d));
const listSubdirs = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const countMd = (d) => listDir(d).filter((f) => f.endsWith('.md')).length;
const canonicalAgents = () => listDir('src/agents')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''));
const toSnake = (name) => name.replace(/-/g, '_');
const agentsWithCapabilities = (...capabilities) => AGENT_REGISTRY
  .filter((agent) => capabilities.includes(agent.capabilities))
  .map((agent) => agent.name)
  .sort();
const toolNames = (file) => require(`../../src/mcp/tools/${file}`).tools.map((tool) => tool.name);
/** Every `.md` file under `dir` (repo-relative), walking subdirectories. */
const listMdRecursive = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return listMdRecursive(rel);
    return entry.isFile() && entry.name.endsWith('.md') ? [rel] : [];
  });

/** The body of `heading` in `surface`, up to the next heading of the same or a higher level. */
function markdownSection(surface, heading) {
  const body = read(surface);
  const start = body.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${surface}: missing "${heading}" section`);
  const rest = body.slice(start + heading.length + 2);
  const level = heading.indexOf(' ');
  const end = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return end === -1 ? rest : rest.slice(0, end);
}

test('doc-drift: agent-count claim phrase present in user-facing surfaces', () => {
  const canonicalCount = countMd('src/agents');
  const surfaces = [
    'docs/overview.md',
    'README.md',
    'claude/README.md',
    'antigravity/README.md',
    'QWEN.md',
    'docs/runtime-antigravity.md',
    'docs/runtime-claude.md',
    'docs/runtime-qwen.md',
    'src/references/architecture.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    const hasClaim =
      body.includes(`${canonicalCount} specialist`) ||
      body.includes(`${canonicalCount} agent`) ||
      body.includes(`${canonicalCount} subagent`) ||
      body.includes(`${canonicalCount} specialized`);
    assert.ok(hasClaim, `${surface}: missing "${canonicalCount} specialists/agents" claim`);
  }
});

test('doc-drift: no stale inject-frontmatter transform in docs', () => {
  const body = read('docs/architecture.md');
  assert.ok(!body.includes('inject-frontmatter'), 'docs/architecture.md still references removed inject-frontmatter transform');
});

test('doc-drift: root pointer docs include every runtime doc', () => {
  for (const surface of ['OVERVIEW.md', 'USAGE.md', 'ARCHITECTURE.md']) {
    const body = read(surface);
    for (const runtime of RUNTIME_NAMES) {
      assert.ok(body.includes(`docs/runtime-${runtime}.md`), `${surface}: missing ${runtime} runtime documentation link`);
    }
  }
});

test('doc-drift: GitHub templates include Antigravity and Qwen runtime impact choices', () => {
  const surfaces = [
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    assert.ok(body.includes('Qwen Code'), `${surface}: missing Qwen Code runtime option`);
    assert.ok(body.includes('- [ ] Antigravity'), `${surface}: missing Antigravity runtime option`);
  }
});

test('doc-drift: Qwen context roster lists every src agent', () => {
  const surface = 'QWEN.md';
  const body = read(surface);
  for (const agent of canonicalAgents()) {
    assert.ok(body.includes(`| \`${toSnake(agent)}\` |`), `${surface}: Agent Roster missing ${toSnake(agent)}`);
  }
});

test('doc-drift: no references to deleted plugins/maestro/mcp/ directory', () => {
  const surfaces = ['docs/architecture.md', 'docs/runtime-codex.md', 'docs/overview.md'];
  for (const surface of surfaces) {
    const body = read(surface);
    assert.ok(!body.includes('plugins/maestro/mcp/maestro-server.js'), `${surface}: still references deleted Codex wrapper`);
    assert.ok(!body.match(/plugins\/maestro\/mcp\/(?!\w)/), `${surface}: still lists plugins/maestro/mcp/ in file tree`);
  }
});

test('doc-drift: Claude surfaces do not advertise host-reserved command names', () => {
  const surfaces = [
    'README.md',
    'EXAMPLES.md',
    'docs/maestro-cheatsheet.md',
    'claude/README.md',
    'docs/runtime-claude.md',
    'docs/usage.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    for (const reserved of ['| `/review` ', '| `/debug` ', '| `/resume` ']) {
      assert.ok(!body.includes(reserved), `${surface}: still uses host-reserved ${reserved.trim()}`);
    }
  }
  const runtimeClaude = read('docs/runtime-claude.md');
  for (const nonexistent of ['`review/SKILL.md`', '`debug/SKILL.md`', '`resume/SKILL.md`']) {
    assert.ok(!runtimeClaude.includes(nonexistent), `docs/runtime-claude.md: references nonexistent ${nonexistent}`);
  }
});

test('doc-drift: examples guide is linked and included in npm package files', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'EXAMPLES.md')), true, 'EXAMPLES.md is missing');

  const readme = read('README.md');
  assert.ok(readme.includes('[EXAMPLES.md](EXAMPLES.md)'), 'README.md does not link EXAMPLES.md');

  const cheatsheet = read('docs/maestro-cheatsheet.md');
  assert.ok(cheatsheet.includes('`EXAMPLES.md`'), 'docs/maestro-cheatsheet.md does not mention EXAMPLES.md');

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('EXAMPLES.md'), 'package.json files does not include EXAMPLES.md');
});

test('doc-drift: examples guide includes all runtime command forms', () => {
  const body = read('EXAMPLES.md');
  const expectedForms = [
    '/maestro:orchestrate',
    '/orchestrate',
    '$maestro:orchestrate',
    '/resume-session',
    '$maestro:resume-session',
    '/review-code',
    '$maestro:review-code',
    '/debug-workflow',
    '$maestro:debug-workflow',
    '/maestro:resume-session',
    '/maestro:review-code',
    '/maestro:debug-workflow',
  ];
  for (const form of expectedForms) {
    assert.ok(body.includes(form), `EXAMPLES.md missing command form ${form}`);
  }
});

test('doc-drift: examples guide cites canonical in-repo sources', () => {
  const body = read('EXAMPLES.md');
  const expectedSources = [
    'src/entry-points/core-command-registry.js',
    'src/entry-points/registry.js',
    'src/generator/entry-point-expander.js',
    'src/references/orchestration-steps.md',
    'docs/flow.md',
    'README.md',
    'src/skills/shared/execution/SKILL.md',
    'docs/usage.md',
    'justfile',
    'package.json',
    'tests/unit/doc-drift-guard.test.js',
  ];
  for (const source of expectedSources) {
    assert.ok(body.includes(source), `EXAMPLES.md missing canonical source ${source}`);
  }
  assert.ok(!body.includes('reviewed implementation plan'), 'EXAMPLES.md should say approved, not reviewed, implementation plan');
});

test('doc-drift: claude/README.md autocomplete bullet uses remapped names', () => {
  const body = read('claude/README.md');
  const autocompleteLines = body.split('\n').filter((l) => l.includes('appear in autocomplete'));
  assert.ok(autocompleteLines.length > 0, 'claude/README.md: no autocomplete bullet found');
  for (const line of autocompleteLines) {
    assert.ok(line.includes('review-code'), `claude/README.md autocomplete missing review-code: ${line.trim()}`);
    assert.ok(line.includes('debug-workflow'), `claude/README.md autocomplete missing debug-workflow: ${line.trim()}`);
    assert.ok(!line.match(/`review`,|`debug`,/), `claude/README.md autocomplete still lists bare names: ${line.trim()}`);
  }
});

test('doc-drift: Qwen extension layout documented as the repo root with agent stubs in agents/', () => {
  // Qwen Code loads an extension's subagents only from <extension>/agents/, and
  // the repo root (where qwen-extension.json lives) is Qwen's extension dir.
  const qwenOutputDir = getRuntimeConfig('qwen').outputDir;
  const runtimeQwen = read('docs/runtime-qwen.md');
  assert.ok(runtimeQwen.includes(`\`${qwenOutputDir}\``), `docs/runtime-qwen.md: does not name the Qwen outputDir \`${qwenOutputDir}\``);
  assert.ok(/repo root\b[^\n.]{0,20}Qwen Code's extension directory/.test(runtimeQwen), 'docs/runtime-qwen.md: does not say the repo root is Qwen Code\'s extension directory');
  assert.ok(runtimeQwen.match(/generated at (?:the repo-root )?`agents\/\*\.md`/), 'docs/runtime-qwen.md: does not say agent files are generated at agents/*.md');
  for (const file of listDir('qwen')) {
    assert.ok(runtimeQwen.includes(`\`qwen/${file}\``), `docs/runtime-qwen.md: does not mention generated qwen/${file}`);
  }
  const overview = read('docs/overview.md');
  assert.ok(/repo root\b[^\n.]{0,20}Qwen Code's extension directory/.test(overview), 'docs/overview.md: does not say the repo root is Qwen Code\'s extension directory');
  const architecture = read('docs/architecture.md');
  const table = markdownSection('docs/architecture.md', '### Runtime Definitions');
  const cells = (row) => row.split('|').slice(1, -1).map((cell) => cell.trim());
  const header = table.split('\n').find((line) => line.startsWith('| Field |'));
  const outputDirRow = table.split('\n').find((line) => line.startsWith('| `outputDir` |'));
  assert.ok(header && outputDirRow, 'docs/architecture.md Runtime Definitions: missing header or outputDir row');
  const outputDirs = Object.fromEntries(cells(header).map((name, i) => [name.toLowerCase(), cells(outputDirRow)[i]]));
  for (const runtime of RUNTIME_NAMES) {
    const { outputDir } = getRuntimeConfig(runtime);
    assert.ok(
      outputDirs[runtime] && outputDirs[runtime].startsWith(`\`${outputDir}\``),
      `docs/architecture.md: outputDir row should show \`${outputDir}\` for ${runtime}, got ${outputDirs[runtime]}`
    );
  }
  for (const [surface, body] of [['docs/runtime-qwen.md', runtimeQwen], ['docs/architecture.md', architecture]]) {
    assert.ok(!body.includes('qwen/agents'), `${surface}: still claims a qwen/agents directory (Qwen agent stubs live in agents/)`);
  }
});

test('doc-drift: docs/usage.md MCP Quick Reference includes every session tool', () => {
  const body = read('docs/usage.md');
  const sessionTools = toolNames('session');
  assert.ok(sessionTools.length > 0, 'src/mcp/tools/session.js declares no tools');
  for (const tool of sessionTools) {
    assert.ok(body.includes(`\`${tool}\``), `docs/usage.md Quick Reference missing \`${tool}\``);
  }
});

test('doc-drift: runtime-docs Feature Flags list exactly src/platforms/*/runtime-config.js features', () => {
  for (const runtime of RUNTIME_NAMES) {
    const surface = `docs/runtime-${runtime}.md`;
    const section = read(surface).match(/## Feature Flags[\s\S]*?(?=\n## |\n# |$)/);
    assert.ok(section, `${surface}: missing Feature Flags section`);
    const block = section[0].match(/```\n([\s\S]*?)```/);
    assert.ok(block, `${surface}: Feature Flags section has no code block`);
    const features = getRuntimeConfig(runtime).features;
    const documented = Object.fromEntries(
      [...block[1].matchAll(/^[ \t]*(\w+):\s*(\S+)/gm)].map(([, flag, value]) => [
        flag,
        value === 'true' ? true : value === 'false' ? false : value,
      ])
    );
    assert.deepEqual(
      documented,
      features,
      `${surface}: Feature Flags must list exactly the runtime-config features with their values`
    );
    for (const [, flag] of section[0].matchAll(/(\w+):/g)) {
      assert.ok(Object.hasOwn(features, flag), `${surface} Feature Flags: names unknown flag ${flag}`);
    }
  }
});

test('doc-drift: runtime docs use generated-version placeholders', () => {
  for (const runtime of RUNTIME_NAMES) {
    const surface = `docs/runtime-${runtime}.md`;
    const body = read(surface);
    assert.ok(
      body.includes('**Version**: generated from `package.json`'),
      `${surface}: should describe manifest versions as generated from package.json`
    );
    assert.ok(
      !body.match(/@josstei\/maestro@\d+\.\d+\.\d+/),
      `${surface}: should not pin concrete npm package versions in examples`
    );
    assert.ok(
      !body.match(/"version": "\d+\.\d+\.\d+"/),
      `${surface}: should not pin concrete manifest versions in examples`
    );
  }
});

test('doc-drift: docs/architecture.md module tree shows correct handler + tool counts', () => {
  const body = read('docs/architecture.md');
  const claims = (pattern) => [...body.matchAll(pattern)].map((match) => Number(match[1]));
  const handlerCount = listDir('src/mcp/handlers').filter((f) => f.endsWith('.js')).length;
  assert.deepEqual(
    claims(/# (\d+) handler implementations/g),
    [handlerCount],
    `docs/architecture.md: module tree should report ${handlerCount} handler implementations`
  );
  for (const file of listDir('src/mcp/tools').filter((f) => f.endsWith('.js'))) {
    const toolCount = toolNames(file).length;
    assert.deepEqual(
      claims(new RegExp(`${file.replace('.', '\\.')}\\s+# (\\d+) tools`, 'g')),
      [toolCount],
      `docs/architecture.md: module tree should report ${toolCount} tools for tools/${file}`
    );
  }
});

test('doc-drift: claude/README.md agent rows carry a valid Tool Tier value', () => {
  const body = read('claude/README.md');
  const validTiers = ['Read-Only', 'Read \\+ Shell', 'Read \\+ Write', 'Full Access'];
  for (const agent of canonicalAgents()) {
    const rowRegex = new RegExp(`\\| ${agent} \\|[^\\n]*\\| (?:${validTiers.join('|')}) \\|`);
    assert.ok(rowRegex.test(body), `claude/README.md: row for ${agent} missing valid Tool Tier`);
  }
});

test('doc-drift: claude/README.md commands use runtime-remapped names', () => {
  const body = read('claude/README.md');
  for (const remapped of ['/review-code', '/debug-workflow', '/resume-session']) {
    assert.ok(body.includes(remapped), `claude/README.md: missing runtime-remapped command ${remapped}`);
  }
});

test('doc-drift: docs/runtime-qwen.md tool mapping lists every Qwen runtime-config tool', () => {
  const body = read('docs/runtime-qwen.md');
  const qwenTools = Object.entries(getRuntimeConfig('qwen').tools);
  assert.ok(qwenTools.length > 0, 'src/platforms/qwen/runtime-config.js declares no tool mappings');
  for (const [canonical, qwen] of qwenTools) {
    assert.ok(
      body.includes(`| \`${canonical}\` | \`${qwen}\` |`),
      `docs/runtime-qwen.md: mapping row missing: ${canonical} → ${qwen}`
    );
  }
});

test('doc-drift: docs/runtime-antigravity.md tool mapping lists every Antigravity runtime-config tool', () => {
  const body = read('docs/runtime-antigravity.md');
  const antigravityTools = Object.entries(getRuntimeConfig('antigravity').tools);
  assert.ok(antigravityTools.length > 0, 'src/platforms/antigravity/runtime-config.js declares no tool mappings');
  for (const [canonical, antigravity] of antigravityTools) {
    // [] means no Antigravity equivalent, documented as `none`.
    const documented = Array.isArray(antigravity) && antigravity.length === 0 ? 'none' : `\`${antigravity}\``;
    assert.ok(
      body.includes(`| \`${canonical}\` | ${documented} |`),
      `docs/runtime-antigravity.md: mapping row missing: ${canonical} → ${documented}`
    );
  }
});

test('doc-drift: Antigravity surfaces name only generated public skills as /maestro: commands', () => {
  // Antigravity has a built-in /resume, so review/debug/resume are generated as
  // review-code/debug-workflow/resume-session; shared skills hide their commands.
  const publicSkills = listSubdirs('antigravity/skills')
    .filter((skill) => !read(`antigravity/skills/${skill}/SKILL.md`).includes('disable-slash-command: true'));
  assert.ok(publicSkills.includes('resume-session'), 'antigravity/skills: missing public resume-session skill');
  for (const surface of ['antigravity/README.md', 'docs/runtime-antigravity.md']) {
    for (const [, skill] of read(surface).matchAll(/\/maestro:([a-z0-9-]+)/g)) {
      assert.ok(publicSkills.includes(skill), `${surface}: /maestro:${skill} is not a generated public Antigravity skill`);
    }
  }
  const readme = read('antigravity/README.md');
  for (const skill of publicSkills) {
    assert.ok(readme.includes(`\`/maestro:${skill}\``), `antigravity/README.md: missing /maestro:${skill}`);
  }
});

/**
 * Hand-maintained doc surfaces, including every served `.md` under `src/`.
 * CHANGELOG.md is intentionally excluded: released sections are history.
 */
function handMaintainedDocSurfaces() {
  const surfaces = [
    'README.md',
    'EXAMPLES.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'ARCHITECTURE.md',
    'OVERVIEW.md',
    'USAGE.md',
    'QWEN.md',
    'claude/README.md',
    'antigravity/README.md',
    'plugins/maestro/README.md',
    ...listDir('docs').filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
    ...listDir('.github/ISSUE_TEMPLATE').map((f) => `.github/ISSUE_TEMPLATE/${f}`),
    '.github/PULL_REQUEST_TEMPLATE.md',
    ...listMdRecursive('src'),
  ];
  assert.ok(surfaces.some((surface) => surface.startsWith('src/')), 'src/ walk found no .md files');
  return surfaces;
}

/**
 * `surface:line: text` for every line of the hand-maintained doc surfaces that
 * matches `pattern` once the `allowed` occurrences are removed from it.
 */
const docSurfaceHits = (pattern, allowed) => handMaintainedDocSurfaces().flatMap((surface) => read(surface)
  .split('\n')
  .flatMap((line, index) => (pattern.test(allowed ? line.replace(allowed, '') : line)
    ? [`${surface}:${index + 1}: ${line.trim()}`]
    : [])));

/**
 * Antigravity keeps its plugins and settings under `~/.gemini/config/` and
 * `~/.gemini/antigravity-cli/`; paths into those directories are the only
 * Gemini-named text the docs may carry.
 */
const ANTIGRAVITY_CONFIG_PATHS = /(?:~\/)?\.gemini\/(?:config|antigravity-cli)\//g;

test('doc-drift: hand-maintained docs do not advertise the removed Gemini CLI runtime', () => {
  const mentionsGemini = (line) => /gemini/i.test(line.replace(ANTIGRAVITY_CONFIG_PATHS, ''));
  for (const allowed of ['`~/.gemini/config/plugins/maestro/`', '`~/.gemini/antigravity-cli/settings.json`', '`.gemini/config/plugins`']) {
    assert.equal(mentionsGemini(allowed), false, `Antigravity config path should be allowed: ${allowed}`);
  }
  for (const banned of ['Gemini CLI', 'GEMINI.md', 'gemini-extension.json', '`~/.gemini/settings.json`', '`~/.gemini/extensions/maestro`', 'Gemini CLI read `~/.gemini/config/plugins`']) {
    assert.equal(mentionsGemini(banned), true, `Gemini reference should still be banned: ${banned}`);
  }

  const hits = docSurfaceHits(/gemini/i, ANTIGRAVITY_CONFIG_PATHS);
  assert.deepEqual(hits, [], `Gemini CLI is no longer supported; remove these mentions (only Antigravity's \`~/.gemini/config/\` and \`~/.gemini/antigravity-cli/\` paths are allowed):\n${hits.join('\n')}`);
});

test('doc-drift: hand-maintained docs do not mention a qwen/agents directory', () => {
  // Qwen Code loads extension subagents only from <extension>/agents/, so the
  // Qwen agent stubs are generated at the repo-root agents/, never qwen/agents/.
  const hits = docSurfaceHits(/qwen\/agents/);
  assert.deepEqual(hits, [], `Qwen agent stubs live in the repo-root agents/; remove these qwen/agents mentions:\n${hits.join('\n')}`);
});

test('doc-drift: served skill and reference agent tables name every src agent', () => {
  const tables = [
    ['src/skills/shared/delegation/SKILL.md', '## Agent Selection Guide'],
    ['src/skills/shared/implementation-planning/SKILL.md', '### Matching Tasks to Agents'],
    ['src/references/architecture.md', '## Agent Roster'],
  ];
  for (const [surface, heading] of tables) {
    const section = markdownSection(surface, heading);
    for (const agent of canonicalAgents()) {
      assert.ok(section.includes(`\`${agent}\``), `${surface} "${heading}": missing \`${agent}\``);
    }
  }
});

test('doc-drift: implementation-planning compatibility rows match agent-registry capabilities', () => {
  const surface = 'src/skills/shared/implementation-planning/SKILL.md';
  const body = read(surface);
  const listedAgents = (pattern, what) => {
    const match = body.match(pattern);
    assert.ok(match, `${surface}: missing ${what}`);
    return match[1].split(',').map((name) => name.trim()).sort();
  };
  assert.deepEqual(
    listedAgents(/^\| Creates\/modifies files \|[^|\n]*\| ([^|\n]+) \|$/m, 'the "Creates/modifies files" row'),
    agentsWithCapabilities('full', 'read_write'),
    `${surface}: "Creates/modifies files" must list exactly the full and read_write agents`
  );
  assert.deepEqual(
    listedAgents(/^\| Runs shell commands \|[^|\n]*\| ([^|\n]+) \|$/m, 'the "Runs shell commands" row'),
    agentsWithCapabilities('full', 'read_shell'),
    `${surface}: "Runs shell commands" must list exactly the full and read_shell agents`
  );
  assert.deepEqual(
    listedAgents(/Read-Only agents \(([^)]+)\)/, 'the Read-Only agents HARD-GATE list'),
    agentsWithCapabilities('read_only'),
    `${surface}: the Read-Only HARD-GATE must list exactly the read_only agents`
  );
});

test('doc-drift: Qwen docs use Qwen hook event names', () => {
  for (const surface of ['docs/runtime-qwen.md', 'docs/maestro-cheatsheet.md', 'QWEN.md']) {
    const body = read(surface);
    assert.ok(body.includes('SubagentStart'), `${surface}: missing SubagentStart`);
    assert.ok(body.includes('SubagentStop'), `${surface}: missing SubagentStop`);
    assert.ok(!body.includes('| `BeforeAgent` | `hooks/hook-runner.js qwen'), `${surface}: still documents Qwen BeforeAgent`);
    assert.ok(!body.includes('| `AfterAgent` | `hooks/hook-runner.js qwen'), `${surface}: still documents Qwen AfterAgent`);
  }
});
