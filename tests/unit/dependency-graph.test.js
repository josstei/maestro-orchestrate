'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDependencyGraph } = require('../../src/generator/dependency-graph');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

function fixture(files) {
  const rootDir = makeTempDir('maestro-graph-');
  for (const [file, source] of Object.entries(files)) writeTree(rootDir, file, source);
  return rootDir;
}
const codes = (graph) => graph.issues.map((issue) => issue.code);
const graphOf = (files, options = {}) => buildDependencyGraph({ rootDir: fixture(files), ...options });

describe('dependency graph', () => {
  it('finds static CommonJS, require.resolve, ESM, reexports, and literal imports', () => {
    const graph = graphOf({
      'mcp/main.js': [
        "require('./plain'); require.resolve('./config');",
        "import x from './esm.js'; export { x } from './esm.js';",
        "export * from './other.js'; import('./late.js'); require(`./folder`);",
        'if (require.main === module) console.log(x);',
      ].join('\n'),
      'mcp/plain.js': '', 'mcp/config.json': '{}', 'mcp/esm.js': 'export const x = 1;',
      'mcp/other.js': '', 'mcp/late.js': '', 'mcp/folder/index.js': '',
    }, { roots: ['mcp/main.js'] });
    assert.deepEqual(graph.issues, []);
    assert.deepEqual(graph.nodes, [
      'mcp/config.json', 'mcp/esm.js', 'mcp/folder/index.js', 'mcp/late.js',
      'mcp/main.js', 'mcp/other.js', 'mcp/plain.js',
    ]);
    assert.deepEqual([...new Set(graph.edges.map((edge) => edge.kind))].sort(), ['import', 'require', 'require.resolve']);
  });

  it('ignores pretend imports inside comments, strings, regexes, and template text', () => {
    const graph = graphOf({ 'lib/main.js': [
      '// require("./missing")',
      'const text = "require(\'./missing\')";',
      'const template = `import("./missing")`;',
      'const pattern = /require\("missing"\)/;',
    ].join('\n') });
    assert.deepEqual(graph.issues, []);
    assert.deepEqual(graph.edges, []);
  });

  it('still visits actual imports inside template expressions', () => {
    const graph = graphOf({ 'lib/main.js': 'const text = `${require("./actual")}`;', 'lib/actual.js': '' });
    assert.deepEqual(graph.issues, []);
    assert.equal(graph.edges[0].to, 'lib/actual.js');
  });

  for (const [name, files, expected] of [
    ['rejects missing modules, computed imports, and malformed JavaScript', {
      'lib/missing.js': "require('./absent');",
      'lib/computed.js': 'require(name); import(name);',
      'lib/malformed.js': 'function {',
    }, ['DYNAMIC_DEPENDENCY', 'DYNAMIC_DEPENDENCY', 'MISSING_DEPENDENCY', 'PARSE_ERROR']],
    ['rejects nonexistent Node builtins', {
      'core/main.js': "require('node:definitely-not-real');",
    }, ['INVALID_BUILTIN']],
    ['permits build dependencies but rejects runtime imports of parser/build modules', {
      'generator/compiler.js': "require('acorn');",
      'mcp/runtime.js': "require('../generator/compiler'); require('acorn');",
    }, ['EXTERNAL_DEPENDENCY', 'RUNTIME_BUILD_DEPENDENCY']],
    ['rejects runtime imports of build helpers excluded from extension archives', {
      'mcp/main.js': [
        "require('../platforms/qwen/policy-pack');",
        "require('../lib/discovery');",
        "require('../lib/yaml-emit');",
      ].join('\n'),
      'platforms/qwen/policy-pack.js': '',
      'lib/discovery/index.js': '',
      'lib/yaml-emit.js': '',
    }, Array(3).fill('RUNTIME_BUILD_DEPENDENCY')],
  ]) {
    it(name, () => assert.deepEqual(codes(graphOf(files)).sort(), expected));
  }

  for (const [name, source] of Object.entries({
    alias: "const load = require; load('./missing');",
    resolveAlias: "const resolve = require.resolve; resolve('./missing');",
    shadow: "function load(require) { require('./missing'); }",
    declaration: "const require = () => {}; require('./missing');",
    reassignment: "require = (name) => name; require('./actual');",
    indirect: "require['resolve']('./missing');",
    module: "module.require('./missing');",
    moduleComputed: "module['require']('./missing');",
    moduleAlias: "const load = module.require; load('./missing');",
    moduleDestructured: "const { require: load } = module; load('./missing');",
    moduleObjectAlias: "const loader = module; loader.require('./missing');",
    moduleArgument: "function load(m) { m.require('./missing'); } load(module);",
    moduleSequence: "const loader = (0, module); loader.require('./missing');",
    moduleParent: "module.parent.require('./missing');",
    createRequire: "const { createRequire } = require('node:module'); createRequire(__filename)('./missing');",
    createRequireNamespace: "const loader = require('node:module'); loader.createRequire(__filename)('./missing');",
    createRequireImport: "import { createRequire as loader } from 'node:module'; loader(import.meta.url)('./missing');",
    mainModule: "require.main.require('./missing');",
    mainModuleAlias: "const loader = require.main; loader.require('./missing');",
    mainModuleComputed: "require.main['require']('./missing');",
  })) {
    it(`rejects unsupported ${name} require usage`, () => {
      const graph = graphOf({ 'lib/main.js': source, 'lib/actual.js': '' });
      assert.ok(codes(graph).includes('UNSUPPORTED_REQUIRE'), JSON.stringify(graph));
      if (name === 'shadow' || name === 'declaration') assert.deepEqual(graph.edges, []);
    });
  }

  it('resolves actual symlink targets before checking layer containment', () => {
    const rootDir = fixture({ 'lib/main.js': "require('./linked');", 'core/actual.js': '' });
    fs.symlinkSync(path.join(rootDir, 'core', 'actual.js'), path.join(rootDir, 'lib', 'linked.js'));
    const graph = buildDependencyGraph({ rootDir, roots: ['lib/main.js'] });
    assert.ok(codes(graph).includes('LAYER_BOUNDARY'));
    assert.ok(codes(graph).includes('SYMLINK_DEPENDENCY'));
    assert.equal(graph.edges[0].to, 'core/actual.js');
  });

  it('rejects package-main directories instead of following the unused index fallback', () => {
    const rootDir = fixture({
      'mcp/main.js': "require('./folder');",
      'mcp/folder/package.json': '{"main":"entry.js"}',
      'mcp/folder/entry.js': "module.exports = 'actual entry';",
      'mcp/folder/index.js': "module.exports = 'unused fallback';",
    });
    assert.equal(require(path.join(rootDir, 'mcp/folder')), 'actual entry');
    const graph = buildDependencyGraph({ rootDir, roots: ['mcp/main.js'] });
    assert.deepEqual(codes(graph), ['UNSUPPORTED_PACKAGE_MAIN']);
    assert.match(graph.issues[0].message, /import its target file explicitly/);
    assert.ok(!graph.nodes.includes('mcp/folder/index.js'));
  });

  for (const suffix of ['', '.md']) {
    it(`rejects imported ${suffix || 'extensionless'} executable files instead of treating them as data`, () => {
      const rootDir = fixture({
        'mcp/main.js': `require('./hidden${suffix}');`,
        [`mcp/hidden${suffix}`]: "module.exports = require('./helper');",
        'mcp/helper.js': "module.exports = 'nested dependency';",
      });
      assert.equal(require(path.join(rootDir, `mcp/hidden${suffix}`)), 'nested dependency');
      assert.deepEqual(codes(buildDependencyGraph({ rootDir, roots: ['mcp/main.js'] })), ['UNSUPPORTED_MODULE_TYPE']);
    });
  }

  it('keeps require.resolve data files without interpreting them as executable imports', () => {
    const graph = graphOf({
      'mcp/main.js': "require.resolve('./guide.md');",
      'mcp/guide.md': '# A guide containing require("./not-a-dependency")',
    }, { roots: ['mcp/main.js'] });
    assert.deepEqual(graph.issues, []);
    assert.deepEqual(graph.nodes, ['mcp/guide.md', 'mcp/main.js']);
  });

  it('rejects symlink escapes from canonical source', () => {
    const outside = fixture({ 'outside.js': '' });
    const rootDir = fixture({ 'lib/main.js': "require('./linked');" });
    fs.symlinkSync(path.join(outside, 'outside.js'), path.join(rootDir, 'lib', 'linked.js'));
    assert.deepEqual(codes(buildDependencyGraph({ rootDir })), ['OUTSIDE_ROOT']);
  });

  it('checks physical containment even when a generated file has fresh override bytes', () => {
    const outside = fixture({ 'registry.json': '{}' });
    const rootDir = fixture({ 'core/main.js': "require('../generated/registry.json');" });
    fs.mkdirSync(path.join(rootDir, 'generated'));
    fs.symlinkSync(path.join(outside, 'registry.json'), path.join(rootDir, 'generated', 'registry.json'));
    const graph = buildDependencyGraph({ rootDir, sourceOverrides: new Map([['generated/registry.json', '{}']]) });
    assert.deepEqual(codes(graph), ['OUTSIDE_ROOT']);
  });

  it('checks symlink ancestors of not-yet-written override files', () => {
    const outside = fixture({ 'other.json': '{}' });
    const rootDir = fixture({ 'core/main.js': "require('../generated/fresh.json');" });
    fs.symlinkSync(outside, path.join(rootDir, 'generated'), 'dir');
    const graph = buildDependencyGraph({ rootDir, sourceOverrides: new Map([['generated/fresh.json', '{}']]) });
    assert.deepEqual(codes(graph), ['OUTSIDE_ROOT']);
  });

  it('reports cycles with a deterministic concrete path', () => {
    const rootDir = fixture({ 'lib/a.js': "require('./b');", 'lib/b.js': "require('./a');" });
    const first = buildDependencyGraph({ rootDir });
    assert.deepEqual(first, buildDependencyGraph({ rootDir }));
    assert.deepEqual(codes(first), ['DEPENDENCY_CYCLE']);
    assert.match(first.issues[0].message, /lib\/a.js -> lib\/b.js -> lib\/a.js/);
  });

  it('expands finite dynamic targets with a runtime filter and fresh registry overrides', () => {
    const rootDir = fixture({
      'platforms/runtime-config-map.js': '// maestro-dependencies: runtime-configs\nrequire(configPath);',
      'platforms/shared/hook-runner.js': [
        '// maestro-dependencies: hook-adapters', 'require(adapterPath);',
        '// maestro-dependencies: hook-handlers', 'require(logicPath);',
      ].join('\n'),
      'platforms/claude/runtime-config.js': '', 'platforms/claude/hook-adapter.js': '',
      'platforms/antigravity/runtime-config.js': '', 'platforms/antigravity/hook-adapter.js': '',
      'generated/hook-registry.json': '{"stale":{"module":"hooks/stale.js"}}',
      'hooks/fresh.js': '',
    });
    const options = { rootDir, runtime: 'claude', roots: ['platforms/runtime-config-map.js', 'platforms/shared/hook-runner.js'],
      sourceOverrides: new Map([['generated/hook-registry.json', '{"fresh":{"module":"hooks/fresh.js"}}']]) };
    const graph = buildDependencyGraph(options);
    assert.deepEqual(graph.issues, []);
    assert.ok(graph.nodes.includes('hooks/fresh.js'));
    assert.ok(graph.nodes.includes('platforms/claude/hook-adapter.js'));
    assert.ok(!graph.nodes.some((file) => file.includes('antigravity') || file.includes('stale')));
    const all = buildDependencyGraph({ ...options, runtime: undefined });
    assert.ok(all.nodes.includes('platforms/antigravity/runtime-config.js'));
  });

  it('rejects unknown, stale and targetless dynamic annotations', () => {
    const graph = graphOf({
      'mcp/unknown.js': '// maestro-dependencies: magic\nrequire(value);',
      'mcp/stale.js': '// maestro-dependencies: runtime-configs\nrequire("node:fs");',
      'mcp/empty.js': '// maestro-dependencies: runtime-configs\nrequire(value);',
    });
    assert.ok(codes(graph).includes('UNKNOWN_ANNOTATION'));
    assert.ok(codes(graph).includes('STALE_ANNOTATION'));
    assert.ok(codes(graph).includes('INVALID_ANNOTATION_TARGETS'));
  });

  it('keeps content roots and reports only reachable dependencies for payload requests', () => {
    const graph = graphOf({ 'mcp/main.js': "require('./helper');", 'mcp/helper.js': '',
      'agents/coder.md': '# Coder', 'unused.js': 'require(missing);' }, { roots: ['mcp/main.js', 'agents/coder.md'] });
    assert.deepEqual(graph.issues, []);
    assert.deepEqual(graph.nodes, ['agents/coder.md', 'mcp/helper.js', 'mcp/main.js']);
  });

  it('validates the canonical graph without runtime parser dependencies', () => {
    const full = buildDependencyGraph({ rootDir: SRC_ROOT });
    assert.deepEqual(full.issues, []);
    for (const runtime of ['antigravity', 'claude', 'codex', 'qwen']) {
      const graph = buildDependencyGraph({ rootDir: SRC_ROOT, runtime, roots: ['mcp/maestro-server.js'] });
      assert.deepEqual(graph.issues, []);
      assert.ok(!graph.nodes.some((file) => file.startsWith('generator/')));
      assert.ok(graph.nodes.includes(`platforms/${runtime}/runtime-config.js`));
    }
  });
});
