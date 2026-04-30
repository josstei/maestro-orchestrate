const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const listDir = (d) => fs.readdirSync(path.join(REPO, d));
const countMd = (d) => listDir(d).filter((f) => f.endsWith('.md')).length;

test('doc-drift: agent-count claim phrase present in user-facing surfaces', () => {
  const canonicalCount = countMd('src/agents');
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
  assert.equal(fs.existsSync(path.join(REPO, 'EXAMPLES.md')), true, 'EXAMPLES.md is missing');

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

test('doc-drift: runtime docs reference only the 4 canonical feature flags', () => {
  const canonical = [
    'exampleBlocks',
    'claudeStateContract',
    'scriptBasedStateContract',
    'codexStateContract',
  ];
  const removed = [
    'mcpSkillContentHandler',
    'policyEnforcer',
    'geminiHookModel',
    'geminiDelegation',
    'geminiToolExamples',
    'geminiAskFormat',
    'geminiStateContract',
    'geminiRuntimeConfig',
    'claudeHookModel',
    'claudeDelegation',
    'claudeToolExamples',
    'claudeRuntimeConfig',
    'codexDelegation',
    'codexRuntimeConfig',
    'qwenStateContract',
    'qwenRuntimeConfig',
  ];
  for (const runtime of ['gemini', 'claude', 'codex', 'qwen']) {
    const body = read(`docs/runtime-${runtime}.md`);
    const flagsMatch = body.match(/## Feature Flags[\s\S]*?(?=\n## |\n# |$)/);
    assert.ok(flagsMatch, `docs/runtime-${runtime}.md: missing Feature Flags section`);
    const section = flagsMatch[0];
    for (const flag of canonical) {
      assert.ok(section.includes(flag), `docs/runtime-${runtime}.md Feature Flags: missing canonical flag ${flag}`);
    }
    for (const flag of removed) {
      assert.ok(!section.includes(flag + ':'), `docs/runtime-${runtime}.md Feature Flags: still lists removed flag ${flag}`);
    }
  }
});

test('doc-drift: runtime-docs feature-flag booleans match src/platforms/*/runtime-config.js', () => {
  const expected = {
    gemini: { exampleBlocks: false, claudeStateContract: false, scriptBasedStateContract: true, codexStateContract: false },
    claude: { exampleBlocks: true, claudeStateContract: true, scriptBasedStateContract: false, codexStateContract: false },
    codex: { exampleBlocks: false, claudeStateContract: false, scriptBasedStateContract: false, codexStateContract: true },
    qwen: { exampleBlocks: false, claudeStateContract: false, scriptBasedStateContract: true, codexStateContract: false },
  };
  for (const [runtime, flags] of Object.entries(expected)) {
    const body = read(`docs/runtime-${runtime}.md`);
    const section = body.match(/## Feature Flags[\s\S]*?(?=\n## |\n# |$)/)[0];
    for (const [flag, value] of Object.entries(flags)) {
      const pattern = new RegExp(`${flag}:\\s*${value}\\b`);
      assert.ok(pattern.test(section), `docs/runtime-${runtime}.md: flag ${flag} should be ${value}`);
    }
  }
});

test('doc-drift: runtime docs use generated-version placeholders', () => {
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
  assert.ok(body.includes('# 12 handler implementations'), 'docs/architecture.md: does not report 12 handlers');
  assert.ok(!body.includes('session/index.js        # 5 tools'), 'docs/architecture.md: still says session pack has 5 tools');
  assert.ok(body.includes('session/index.js        # 10 tools'), 'docs/architecture.md: does not report 10 session tools');
});

test('doc-drift: docs/architecture.md content-tools list includes Qwen', () => {
  const body = read('docs/architecture.md');
  const idx = body.indexOf('The content tools');
  assert.ok(idx >= 0, 'docs/architecture.md: Content Serving section not found');
  const section = body.slice(idx, idx + 500);
  assert.ok(section.includes('Qwen'), 'docs/architecture.md content-tools list: does not include Qwen');
});

test('doc-drift: claude/README.md agents table lists every src/agents/*.md agent', () => {
  const body = read('claude/README.md');
  const canonicalAgents = listDir('src/agents')
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
  for (const agent of canonicalAgents) {
    assert.ok(body.includes(`| ${agent} |`), `claude/README.md: Agents table missing row for ${agent}`);
  }
});

test('doc-drift: claude/README.md agent rows carry a valid Tool Tier value', () => {
  const body = read('claude/README.md');
  const canonicalAgents = listDir('src/agents')
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
  const validTiers = ['Read-Only', 'Read \\+ Shell', 'Read \\+ Write', 'Full Access'];
  for (const agent of canonicalAgents) {
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
