'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { toSnakeCase } = require('../../src/lib/naming');
const { MAESTRO_SETTINGS } = require('../../src/config/settings-catalog');
const {
  RELEASE_ARTIFACT_PATHS,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
} = require('../../scripts/release-artifact-manifest');
const AGENT_REGISTRY = require('../../src/generated/agent-registry.json');
const { listCanonicalAgents, publicSkillNames } = require('../support/catalog');
const { ROOT } = require('../support/paths');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const listDir = (d) => fs.readdirSync(path.join(ROOT, d));
const listSubdirs = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const countMd = (d) => listDir(d).filter((f) => f.endsWith('.md')).length;
const agentsWithCapabilities = (...capabilities) => AGENT_REGISTRY
  .filter((agent) => capabilities.includes(agent.capabilities))
  .map((agent) => agent.name)
  .sort();
const packToolNames = (pack) => require(`../../src/mcp/tool-packs/${pack}`)
  .createToolPack({ runtimeConfig: getRuntimeConfig('qwen'), services: {} })
  .tools.map((tool) => tool.name);
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

/**
 * How the docs write a runtime-config value in a table cell: `—` when unset,
 * `none` for an empty list, list items comma-separated, objects as JSON, and
 * any other value as code unless it carries its own code spans.
 */
function docCell(value) {
  if (value === undefined) return '—';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map(docCell).join(', ');
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text === '') return "`''`";
  return text.includes('`') ? text : `\`${text}\``;
}

const QWEN_EXTENSION_ROOT = /repo root\b[^\n.]{0,20}Qwen Code's extension directory/;

/**
 * Phrases each surface must contain (`has`) or must not contain (`lacks`). A
 * surface is a file or a `[file, heading]` section; a string phrase is found
 * verbatim and a RegExp phrase is matched. Rules that read the repo are thunks,
 * so a failed read fails only their own test.
 */
const PHRASE_RULES = [
  ['agent-count claim phrase present in user-facing surfaces', [
    'docs/overview.md', 'README.md', 'claude/README.md', 'antigravity/README.md', 'QWEN.md',
    'docs/runtime-antigravity.md', 'docs/runtime-claude.md', 'docs/runtime-qwen.md', 'src/references/architecture.md',
  ], () => ({ has: [new RegExp(`${countMd('src/agents')} (?:specialist|agent|subagent|specialized)`)] })],
  ['Qwen context roster lists every src agent', ['QWEN.md'],
    () => ({ has: listCanonicalAgents().map((agent) => `| \`${toSnakeCase(agent)}\` |`) })],
  ['served skill and reference agent tables name every src agent', [
    ['src/skills/shared/delegation/SKILL.md', '## Agent Selection Guide'],
    ['src/skills/shared/implementation-planning/SKILL.md', '### Matching Tasks to Agents'],
    ['src/references/architecture.md', '## Agent Roster'],
  ], () => ({ has: listCanonicalAgents().map((agent) => `\`${agent}\``) })],
  ['claude/README.md agent rows carry a valid Tool Tier value', ['claude/README.md'], () => ({
    has: listCanonicalAgents().map((agent) =>
      new RegExp(`\\| ${agent} \\|[^\\n]*\\| (?:Read-Only|Read \\+ Shell|Read \\+ Write|Full Access) \\|`)),
  })],
  ['no stale inject-frontmatter transform in docs', ['docs/architecture.md'], { lacks: ['inject-frontmatter'] }],
  ['GitHub templates include Antigravity and Qwen runtime impact choices', [
    '.github/ISSUE_TEMPLATE/bug_report.md', '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ], { has: ['Qwen Code', '- [ ] Antigravity'] }],
  ['no references to deleted plugins/maestro/mcp/ directory', [
    'docs/architecture.md', 'docs/runtime-codex.md', 'docs/overview.md',
  ], { lacks: ['plugins/maestro/mcp/maestro-server.js', /plugins\/maestro\/mcp\/(?!\w)/] }],
  ['Claude surfaces do not advertise host-reserved command names', [
    'README.md', 'EXAMPLES.md', 'docs/maestro-cheatsheet.md', 'claude/README.md',
    'docs/runtime-claude.md', 'docs/usage.md',
  ], { lacks: ['| `/review` ', '| `/debug` ', '| `/resume` '] }],
  ['docs/runtime-claude.md references no nonexistent reserved skill', ['docs/runtime-claude.md'],
    { lacks: ['`review/SKILL.md`', '`debug/SKILL.md`', '`resume/SKILL.md`'] }],
  ['examples guide is linked from the README', ['README.md'], { has: ['[EXAMPLES.md](EXAMPLES.md)'] }],
  ['examples guide is named in the cheatsheet', ['docs/maestro-cheatsheet.md'], { has: ['`EXAMPLES.md`'] }],
  // Qwen Code loads an extension's subagents only from <extension>/agents/, and
  // the repo root (where qwen-extension.json lives) is Qwen's extension dir.
  ['Qwen extension layout documented as the repo root with agent stubs in agents/', ['docs/runtime-qwen.md'], () => ({
    has: [
      `\`${getRuntimeConfig('qwen').outputDir}\``, QWEN_EXTENSION_ROOT,
      /generated at (?:the repo-root )?`agents\/\*\.md`/,
      ...listDir('qwen').map((file) => `\`qwen/${file}\``),
    ],
  })],
  ['overview documents the repo root as the Qwen extension directory', ['docs/overview.md'],
    { has: [QWEN_EXTENSION_ROOT] }],
  ['runtime docs use generated-version placeholders', RUNTIME_NAMES.map((runtime) => `docs/runtime-${runtime}.md`), {
    has: ['**Version**: generated from `package.json`'],
    lacks: [/@josstei\/maestro@\d+\.\d+\.\d+/, /"version": "\d+\.\d+\.\d+"/],
  }],
  ['Qwen docs use Qwen hook event names', ['docs/runtime-qwen.md', 'docs/maestro-cheatsheet.md', 'QWEN.md'], {
    has: ['SubagentStart', 'SubagentStop'],
    lacks: ['| `BeforeAgent` | `hooks/hook-runner.js qwen', '| `AfterAgent` | `hooks/hook-runner.js qwen'],
  }],
];

for (const [claim, surfaces, rules] of PHRASE_RULES) {
  test(`doc-drift: ${claim}`, () => {
    const { has = [], lacks = [] } = typeof rules === 'function' ? rules() : rules;
    for (const surface of surfaces) {
      const body = typeof surface === 'string' ? read(surface) : markdownSection(...surface);
      const found = (phrase) => (phrase instanceof RegExp ? phrase.test(body) : body.includes(phrase));
      for (const phrase of has) assert.ok(found(phrase), `${surface}: missing ${phrase}`);
      for (const phrase of lacks) assert.ok(!found(phrase), `${surface}: still contains ${phrase}`);
    }
  });
}

test('doc-drift: examples guide exists and is included in npm package files', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'EXAMPLES.md')), true, 'EXAMPLES.md is missing');

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('EXAMPLES.md'), 'package.json files does not include EXAMPLES.md');
});

/**
 * The repo-relative targets of the inline relative markdown links in `surface`,
 * without their `#anchor`; URLs, `mailto:` links, and same-page anchors are skipped.
 */
const relativeLinkTargets = (surface) => [...read(surface).matchAll(/\]\(([^)\s]+)\)/g)]
  .map((match) => match[1])
  .filter((target) => !/^(?:https?:|mailto:|#)/.test(target))
  .map((target) => path.posix.join(path.posix.dirname(surface), target.replace(/#.*$/, '')).replace(/\/$/, ''));

/**
 * Whether package.json `files` ships `file`: the last entry naming it or one of
 * its directories decides, and a `!` entry excludes.
 */
const npmShips = (files, file) => files.reduce((shipped, entry) => {
  const negated = entry.startsWith('!');
  const entryPath = entry.slice(negated ? 1 : 0).replace(/\/$/, '');
  return file === entryPath || file.startsWith(`${entryPath}/`) ? !negated : shipped;
}, false);

test('doc-drift: shipped docs link relatively only to files their artifact ships', () => {
  const { files } = JSON.parse(read('package.json'));
  assert.ok(files.every((entry) => !/[*?[{]/.test(entry)), 'package.json files uses a glob, which npmShips does not match');
  // README.md ships too but is exempt: GitHub and npmjs.com render it and
  // resolve its relative links against the repository.
  const isDoc = (file) => /^docs\/[^/]+\.md$/.test(file);
  const artifacts = [
    [
      'release archive',
      RELEASE_ARTIFACT_PATHS.filter(isDoc),
      (file) => RELEASE_ARTIFACT_PATHS.some((entry) => file === entry || file.startsWith(`${entry}/`))
        && isReleaseArtifactPathAllowed(file) && !isDeniedPath(file),
    ],
    [
      'npm package',
      listDir('docs').map((name) => `docs/${name}`).filter((file) => isDoc(file) && npmShips(files, file)),
      (file) => npmShips(files, file),
    ],
  ];
  for (const [artifact, docs, ships] of artifacts) {
    assert.ok(docs.length > 0, `the ${artifact} ships no docs/*.md`);
    for (const surface of docs) {
      for (const target of relativeLinkTargets(surface)) {
        assert.ok(fs.existsSync(path.join(ROOT, target)), `${surface}: links missing ${target}`);
        assert.ok(ships(target), `${surface}: links ${target}, which the ${artifact} does not ship; link its GitHub URL instead`);
      }
    }
  }
});

/** How each runtime invokes a public skill or command: this prefix, then its name. */
const COMMAND_PREFIXES = { antigravity: '/maestro:', claude: '/', codex: '$maestro:', qwen: '/maestro:' };

test('doc-drift: command docs show every public command in each runtime form', () => {
  assert.deepEqual(Object.keys(COMMAND_PREFIXES), RUNTIME_NAMES, 'COMMAND_PREFIXES must name every runtime');
  // Each surface must show the forms of the runtimes listed with it.
  const surfaces = [
    ['README.md "## Commands"', markdownSection('README.md', '## Commands'), RUNTIME_NAMES],
    ['docs/usage.md "## Invoking Maestro"', markdownSection('docs/usage.md', '## Invoking Maestro'), RUNTIME_NAMES],
    ['docs/maestro-cheatsheet.md "## 2. Most Common Commands"', markdownSection('docs/maestro-cheatsheet.md', '## 2. Most Common Commands'), RUNTIME_NAMES],
    ['EXAMPLES.md', read('EXAMPLES.md'), RUNTIME_NAMES],
    ['claude/README.md', read('claude/README.md'), ['claude']],
  ];
  for (const [surface, body, runtimes] of surfaces) {
    for (const runtime of runtimes) {
      for (const name of publicSkillNames(runtime)) {
        // The form must end its code span or be followed by arguments, so
        // `/maestro:review-code` does not count as `/maestro:review`.
        const form = `\`${COMMAND_PREFIXES[runtime]}${name}`;
        assert.ok(body.includes(`${form}\``) || body.includes(`${form} `), `${surface}: missing ${runtime} command ${form}\``);
      }
    }
  }
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

test('doc-drift: docs/usage.md MCP Quick Reference includes every tool-pack tool', () => {
  const body = read('docs/usage.md');
  for (const pack of listSubdirs('src/mcp/tool-packs')) {
    const tools = packToolNames(pack);
    assert.ok(tools.length > 0, `${pack} tool pack declares no tools`);
    for (const tool of tools) {
      assert.ok(body.includes(`\`${tool}\``), `docs/usage.md Quick Reference missing ${pack} tool \`${tool}\``);
    }
  }
});

test('doc-drift: settings tables list exactly the MAESTRO_SETTINGS env vars', () => {
  const expected = MAESTRO_SETTINGS.map((setting) => setting.envVar).sort();
  const tables = [
    ['docs/usage.md', '### Settings'],
    ['README.md', '## Configuration'],
    ['QWEN.md', '## Settings Reference'],
  ];
  for (const [surface, heading] of tables) {
    const listed = markdownSection(surface, heading)
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .flatMap((line) => [...line.matchAll(/`(MAESTRO_[A-Z_]+)`/g)].map((match) => match[1]))
      .sort();
    assert.deepEqual(listed, expected, `${surface} "${heading}": table must list exactly the MAESTRO_SETTINGS env vars`);
  }
});

test('doc-drift: agent tier catalogs match agent-registry capabilities', () => {
  // docs/usage.md has one table per tier under these headings.
  const tiers = {
    read_only: 'Read-Only Agents',
    read_shell: 'Read + Shell Agents',
    read_write: 'Read + Write Agents',
    full: 'Full Access Agents',
  };
  assert.deepEqual(
    Object.keys(tiers).sort(),
    [...new Set(AGENT_REGISTRY.map((agent) => agent.capabilities))].sort(),
    'every agent-registry capability needs a catalog tier'
  );
  const catalog = markdownSection('docs/usage.md', '## Agent Catalog').split(/^### /m);
  for (const [capability, title] of Object.entries(tiers)) {
    const table = catalog.find((section) => section.startsWith(title));
    assert.ok(table, `docs/usage.md Agent Catalog: missing the "${title}" tier`);
    assert.deepEqual(
      [...table.matchAll(/^\| ([a-z0-9-]+) \|/gm)].map((match) => match[1]).sort(),
      agentsWithCapabilities(capability),
      `docs/usage.md Agent Catalog "${title}": must list exactly the ${capability} agents`
    );
  }
});

test('doc-drift: docs/architecture.md Runtime Definitions rows match every runtime config', () => {
  const surface = 'docs/architecture.md Runtime Definitions';
  const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const [header, , ...rows] = markdownSection('docs/architecture.md', '### Runtime Definitions')
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map(cells);
  assert.deepEqual(header.slice(1).map((name) => name.toLowerCase()), RUNTIME_NAMES, `${surface}: columns must be the runtimes`);
  // Rows whose first cell is a backticked config path, e.g. `env.workspacePath`.
  const fields = new Map(rows
    .filter(([field]) => /^`[\w.]+`$/.test(field))
    .map(([field, ...values]) => [field.slice(1, -1), values]));
  for (const group of ['env', 'features', 'paths', 'launchers']) {
    for (const runtime of RUNTIME_NAMES) {
      for (const key of Object.keys(getRuntimeConfig(runtime)[group])) {
        assert.ok(fields.has(`${group}.${key}`), `${surface}: missing the \`${group}.${key}\` row`);
      }
    }
  }
  for (const [field, values] of fields) {
    const configured = RUNTIME_NAMES.map((runtime) => field.split('.')
      .reduce((value, key) => value?.[key], getRuntimeConfig(runtime)));
    assert.ok(configured.some((value) => value !== undefined), `${surface}: no runtime config sets \`${field}\``);
    RUNTIME_NAMES.forEach((runtime, i) => {
      // A cell may follow the value with a parenthesized note, as in `./` (repo root).
      const expected = docCell(configured[i]);
      assert.ok(
        values[i] === expected || values[i].startsWith(`${expected} (`),
        `${surface}: \`${field}\` for ${runtime} should be ${expected}, got ${values[i]}`
      );
    });
  }
});

test('doc-drift: docs/architecture.md module tree shows correct handler + tool-pack counts', () => {
  const body = read('docs/architecture.md');
  const claims = (pattern) => [...body.matchAll(pattern)].map((match) => Number(match[1]));
  const handlerCount = listDir('src/mcp/handlers').filter((f) => f.endsWith('.js')).length;
  assert.deepEqual(
    claims(/# (\d+) handler implementations/g),
    [handlerCount],
    `docs/architecture.md: module tree should report ${handlerCount} handler implementations`
  );
  for (const pack of listSubdirs('src/mcp/tool-packs')) {
    const toolCount = packToolNames(pack).length;
    assert.deepEqual(
      claims(new RegExp(`${pack}/index\\.js\\s+# (\\d+) tools`, 'g')),
      [toolCount],
      `docs/architecture.md: module tree should report ${toolCount} tools for ${pack}/index.js`
    );
  }
});

/** The docs whose tool-mapping table lists each runtime's `tools` mapping. */
const TOOL_MAPPING_SURFACES = {
  antigravity: ['docs/runtime-antigravity.md'],
  claude: ['docs/runtime-claude.md'],
  codex: ['docs/runtime-codex.md'],
  qwen: ['docs/runtime-qwen.md', 'QWEN.md'],
};

test('doc-drift: runtime tool-mapping tables list every runtime-config tool', () => {
  assert.deepEqual(Object.keys(TOOL_MAPPING_SURFACES), RUNTIME_NAMES, 'TOOL_MAPPING_SURFACES must name every runtime');
  for (const runtime of RUNTIME_NAMES) {
    const tools = Object.entries(getRuntimeConfig(runtime).tools);
    assert.ok(tools.length > 0, `src/platforms/${runtime}/runtime-config.js declares no tool mappings`);
    for (const surface of TOOL_MAPPING_SURFACES[runtime]) {
      const body = read(surface);
      for (const [canonical, mapped] of tools) {
        assert.ok(
          body.includes(`| \`${canonical}\` | ${docCell(mapped)} |`),
          `${surface}: mapping row missing: ${canonical} → ${docCell(mapped)}`
        );
      }
    }
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

test('doc-drift: Codex runtime guide repeats the served guarded-write instruction verbatim', () => {
  // The guide is the Codex state contract when MCP is unavailable, so its copy
  // of the digest-guarded write instruction must not drift from the served one.
  const guardedWrite = (surface) => read(surface).split('\n')
    .find((line) => line.startsWith('Prefer MCP tools for state changes.'));
  const served = guardedWrite('src/references/architecture.md');
  assert.ok(served, 'src/references/architecture.md: missing the guarded-write instruction');
  assert.equal(
    guardedWrite('plugins/maestro/references/runtime-guide.md'),
    served,
    'plugins/maestro/references/runtime-guide.md: guarded-write instruction differs from src/references/architecture.md'
  );
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
    'plugins/maestro/references/runtime-guide.md',
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
