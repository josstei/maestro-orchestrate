import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistryModel } from '../../dist/src/generator/registry-scanner.js';
import { renderSettingsSection } from '../../dist/src/generator/content-file-emitter.js';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO = path.resolve(moduleDirname, '../..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const canonicalAgentCount = () => buildRegistryModel(path.join(REPO, 'src')).agents.length;

test('doc-drift: factual setting sections project the canonical descriptors', () => {
  const expected = renderSettingsSection();
  for (const surface of [
    'docs/architecture.md',
    'docs/usage.md',
    'GEMINI.md',
    'QWEN.md',
    'claude/README.md',
  ]) {
    assert.ok(read(surface).includes(expected), `${surface}: generated settings section drifted`);
  }

  for (const template of [
    'src/platforms/shared/runtime-context-template.md',
    'src/platforms/claude/readme-template.md',
  ]) {
    assert.ok(read(template).includes('<!-- @settings -->'), `${template}: settings marker missing`);
  }
});

test('doc-drift: auto-archive defaults to false on canonical and generated guidance surfaces', () => {
  for (const surface of [
    'docs/architecture.md',
    'docs/usage.md',
    'GEMINI.md',
    'QWEN.md',
    'claude/README.md',
  ]) {
    const settingsSection = read(surface).match(
      /<!-- BEGIN GENERATED SETTINGS -->[\s\S]*?<!-- END GENERATED SETTINGS -->/,
    );
    assert.ok(settingsSection, `${surface}: generated settings bounds missing`);
    assert.match(
      settingsSection[0],
      /MAESTRO_AUTO_ARCHIVE` \| `false`/,
      `${surface}: auto-archive default is not false`,
    );
  }

  const canonicalSkill = read('src/skills/shared/session-management/SKILL.md');
  assert.match(canonicalSkill, /MAESTRO_AUTO_ARCHIVE` defaults to `false`/);
  assert.ok(!canonicalSkill.includes('MAESTRO_AUTO_ARCHIVE` is `true` (default)'));

  const readme = read('README.md');
  assert.match(readme, /MAESTRO_AUTO_ARCHIVE` \| `false` \| Prompt to archive/);
  assert.ok(!readme.includes('MAESTRO_AUTO_ARCHIVE` | `true`'));

  const examples = read('EXAMPLES.md');
  assert.match(examples, /archives automatically only when `MAESTRO_AUTO_ARCHIVE` is explicitly true/);
  assert.ok(!examples.includes('MAESTRO_AUTO_ARCHIVE` is true or unset'));
});

test('doc-drift: startup initializes the workspace before resolving workspace settings', () => {
  const orchestrationSteps = read('src/references/orchestration-steps.md');
  const initializeIndex = orchestrationSteps.indexOf('Call `initialize_workspace');
  const settingsIndex = orchestrationSteps.indexOf(
    'Call resolve_settings after workspace initialization'
  );
  assert.notEqual(initializeIndex, -1);
  assert.notEqual(settingsIndex, -1);
  assert.ok(
    initializeIndex < settingsIndex
  );

  for (const surface of [
    'src/platforms/shared/runtime-context-template.md',
    'GEMINI.md',
    'QWEN.md',
  ]) {
    const content = read(surface);
    const preparationIndex = content.indexOf('Run workspace preparation:');
    const resolutionIndex = content.indexOf(
      'Resolve settings after workspace initialization:'
    );
    assert.notEqual(preparationIndex, -1, `${surface}: workspace preparation guidance is missing`);
    assert.notEqual(resolutionIndex, -1, `${surface}: settings resolution guidance is missing`);
    assert.ok(
      preparationIndex < resolutionIndex,
      `${surface}: settings are resolved before workspace initialization`
    );
  }

  const flow = read('docs/flow.md');
  const flowInitializeIndex = flow.indexOf('→ initialize_workspace');
  const flowSettingsIndex = flow.indexOf('→ resolve_settings');
  assert.notEqual(flowInitializeIndex, -1, 'docs/flow.md: workspace initialization is missing');
  assert.notEqual(flowSettingsIndex, -1, 'docs/flow.md: settings resolution is missing');
  assert.ok(
    flowInitializeIndex < flowSettingsIndex,
    'docs/flow.md: settings are resolved before workspace initialization'
  );
});

test('doc-drift: retired schema DSL is absent from the package surface', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.files.includes('dist/src/lib/schema'), false);
  assert.equal(fs.existsSync(path.join(REPO, 'src/lib/schema/index.ts')), false);
  assert.ok(!read('src/tooling/artifact-policy.ts').includes("'dist/src/lib/schema'"));
  assert.match(read('CHANGELOG.md'), /removed the undocumented `dist\/src\/lib\/schema` deep import/);
});

test('doc-drift: agent-count claim phrase present in user-facing surfaces', () => {
  const canonicalCount = canonicalAgentCount();
  const surfaces = [
    'docs/overview.md',
    'README.md',
    'claude/README.md',
    'GEMINI.md',
    'QWEN.md',
    'docs/runtime-gemini.md',
    'docs/runtime-claude.md',
    'docs/runtime-qwen.md',
    'src/references/architecture.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    const hasClaim =
      body.includes(`${canonicalCount} specialist`) ||
      body.includes(`${canonicalCount} agent`) ||
      body.includes(`${canonicalCount} specialized`);
    assert.ok(hasClaim, `${surface}: missing "${canonicalCount} specialists/agents" claim`);
  }
});

test('doc-drift: no stale inject-frontmatter transform in docs', () => {
  const body = read('docs/architecture.md');
  assert.ok(!body.includes('inject-frontmatter'), 'docs/architecture.md still references removed inject-frontmatter transform');
});

test('doc-drift: root pointer docs include Qwen runtime docs', () => {
  for (const surface of ['OVERVIEW.md', 'USAGE.md', 'ARCHITECTURE.md']) {
    const body = read(surface);
    assert.ok(body.includes('docs/runtime-qwen.md'), `${surface}: missing Qwen runtime documentation link`);
  }
});

test('doc-drift: GitHub templates include Qwen runtime impact choices', () => {
  const surfaces = [
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    assert.ok(body.includes('Qwen Code'), `${surface}: missing Qwen Code runtime option`);
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

test('doc-drift: examples guide is linked and pruned from npm package files', () => {
  assert.equal(fs.existsSync(path.join(REPO, 'EXAMPLES.md')), true, 'EXAMPLES.md is missing');

  const readme = read('README.md');
  assert.ok(readme.includes('[EXAMPLES.md](EXAMPLES.md)'), 'README.md does not link EXAMPLES.md');

  const cheatsheet = read('docs/maestro-cheatsheet.md');
  assert.ok(cheatsheet.includes('`EXAMPLES.md`'), 'docs/maestro-cheatsheet.md does not mention EXAMPLES.md');

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.files.includes('EXAMPLES.md'), false, 'package.json files should not include EXAMPLES.md');
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
  ];
  for (const form of expectedForms) {
    assert.ok(body.includes(form), `EXAMPLES.md missing command form ${form}`);
  }
});

test('doc-drift: examples guide cites canonical in-repo sources', () => {
  const body = read('EXAMPLES.md');
  const expectedSources = [
    'src/entry-points/core-command-registry.ts',
    'src/entry-points/registry.ts',
    'src/generator/entry-point-expander.ts',
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

test('doc-drift: Qwen location documented as qwen/ in all surfaces', () => {
  const runtimeQwen = read('docs/runtime-qwen.md');
  assert.ok(!runtimeQwen.includes('lives at the repository root'), 'docs/runtime-qwen.md: still claims repo root');
  assert.ok(runtimeQwen.includes('`qwen/`'), 'docs/runtime-qwen.md: does not mention qwen/ subdirectory');
  assert.ok(!runtimeQwen.match(/generated at `agents\/\*\.md`/), 'docs/runtime-qwen.md: still says agents/*.md (should reference qwen/agents/)');
  const overview = read('docs/overview.md');
  assert.ok(!overview.includes('root directory — `QWEN.md`, `qwen-extension.json`, shared'), 'docs/overview.md: still claims Qwen shares root directory');
  const architecture = read('docs/architecture.md');
  assert.ok(architecture.includes('| `qwen/` |'), 'docs/architecture.md: outputDir row missing `qwen/` for Qwen');
});

test('doc-drift: docs/usage.md MCP Quick Reference includes all 10 session tools', () => {
  const body = read('docs/usage.md');
  const sessionTools = [
    'create_session',
    'get_session_status',
    'update_session',
    'transition_phase',
    'archive_session',
    'enter_design_gate',
    'record_design_approval',
    'get_design_gate_status',
    'scan_phase_changes',
    'reconcile_phase',
  ];
  for (const tool of sessionTools) {
    assert.ok(body.includes(`\`${tool}\``), `docs/usage.md Quick Reference missing \`${tool}\``);
  }
});

test('doc-drift: runtime docs use generated-version markers', () => {
  for (const runtime of ['gemini', 'claude', 'codex', 'qwen']) {
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

test('doc-drift: docs/architecture.md module tree shows correct handler + session tool counts', () => {
  const body = read('docs/architecture.md');
  assert.ok(!body.includes('# 8 handler implementations'), 'docs/architecture.md: still says 8 handler implementations');
  assert.ok(!body.includes('# 17 handler implementations'), 'docs/architecture.md: still says 17 handler implementations');
  assert.ok(!body.includes('# 21 handler implementations'), 'docs/architecture.md: still says 21 handler implementations');
  assert.ok(!body.includes('# 22 handler implementations'), 'docs/architecture.md: still says 22 handler implementations');
  assert.ok(!body.includes('# 23 handler implementations'), 'docs/architecture.md: still says 23 handler implementations');
  assert.ok(!body.includes('# 24 handler implementations'), 'docs/architecture.md: still says 24 handler implementations');
  assert.ok(!body.includes('# 25 handler implementations'), 'docs/architecture.md: still says 25 handler implementations');
  assert.ok(!body.includes('# 26 handler implementations'), 'docs/architecture.md: still says 26 handler implementations');
  assert.ok(body.includes('# 27 handler implementations'), 'docs/architecture.md: does not report 27 handlers');
  assert.ok(!body.includes('session/index.js        # 5 tools'), 'docs/architecture.md: still says session pack has 5 tools');
  assert.ok(!body.includes('session/index.js        # 13 tools'), 'docs/architecture.md: still says 13 session tools');
  assert.ok(body.includes('session/index.js        # 12 tools'), 'docs/architecture.md: does not report 12 session tools');
});

test('doc-drift: docs/architecture.md content-tools list includes Qwen', () => {
  const body = read('docs/architecture.md');
  const idx = body.indexOf('The content tools');
  assert.ok(idx >= 0, 'docs/architecture.md: Content Serving section not found');
  const section = body.slice(idx, idx + 500);
  assert.ok(section.includes('Qwen'), 'docs/architecture.md content-tools list: does not include Qwen');
});

test('doc-drift: claude/README.md commands use runtime-remapped names', () => {
  const body = read('claude/README.md');
  for (const remapped of ['/review-code', '/debug-workflow', '/resume-session']) {
    assert.ok(body.includes(remapped), `claude/README.md: missing runtime-remapped command ${remapped}`);
  }
});

test('doc-drift: package-facing runtime docs use dist source root', () => {
  const surfaces = [
    'claude/README.md',
    'docs/runtime-claude.md',
    'plugins/maestro/README.md',
    'plugins/maestro/references/runtime-guide.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    assert.ok(body.includes('dist/src'), `${surface}: missing compiled dist/src runtime root`);
    assert.ok(!body.includes('package-root `src/`'), `${surface}: still claims package-root src runtime root`);
    assert.ok(!body.includes('package-root `src`'), `${surface}: still claims package-root src runtime root`);
    assert.ok(!body.includes('package-root src'), `${surface}: still claims package-root src runtime root`);
  }
});

test('doc-drift: runtime docs cite TypeScript source configs', () => {
  const surfaces = [
    'docs/runtime-claude.md',
    'docs/runtime-codex.md',
    'docs/runtime-gemini.md',
    'docs/runtime-qwen.md',
    'src/platforms/claude/runtime-doc.md',
    'src/platforms/codex/runtime-doc.md',
    'src/platforms/gemini/runtime-doc.md',
    'src/platforms/qwen/runtime-doc.md',
  ];
  for (const surface of surfaces) {
    const body = read(surface);
    assert.ok(!body.includes('src/platforms/claude/runtime-config.js'), `${surface}: cites stale Claude JS source config`);
    assert.ok(!body.includes('src/platforms/codex/runtime-config.js'), `${surface}: cites stale Codex JS source config`);
    assert.ok(!body.includes('src/platforms/gemini/runtime-config.js'), `${surface}: cites stale Gemini JS source config`);
    assert.ok(!body.includes('src/platforms/qwen/runtime-config.js'), `${surface}: cites stale Qwen JS source config`);
  }
});

test('doc-drift: docs/runtime-qwen.md tool mapping has correct Qwen overrides', () => {
  const body = read('docs/runtime-qwen.md');
  const expectedMappings = {
    google_web_search: 'web_search',
    replace: 'edit',
    ask_user: 'ask_user_question',
    write_todos: 'todo_write',
    activate_skill: 'skill',
    read_many_files: 'read_many_files',
  };
  for (const [canonical, qwen] of Object.entries(expectedMappings)) {
    const pattern = new RegExp(`\\| \`${canonical}\` \\| \`${qwen}\` \\|`);
    assert.ok(pattern.test(body), `docs/runtime-qwen.md: mapping row missing: ${canonical} → ${qwen}`);
  }
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
