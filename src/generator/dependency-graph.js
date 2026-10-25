'use strict';

// Build-time only: runtime modules never load the parser or this graph.
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin } = require('node:module');
const acorn = require('acorn');
const walk = require('acorn-walk');

const LAYERS = Object.freeze({
  lib: ['lib'],
  core: ['lib', 'core', 'generated'],
  config: ['lib', 'core', 'config'],
  state: ['lib', 'core', 'config', 'state'],
  hooks: ['lib', 'core', 'config', 'state', 'hooks'],
});
const DYNAMIC_KINDS = new Set(['runtime-configs', 'hook-adapters', 'hook-handlers']);
const posix = (value) => value.split(path.sep).join('/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const isWithin = (root, file) => file === root || file.startsWith(root + path.sep);
const isBuildOnly = (file) => /^(generator|transforms|entry-points)\//.test(file)
  || file === 'manifest.js' || file === 'platforms/metadata.js';

function collectModules(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return collectModules(path.join(dir, entry.name), relative + '/');
    return entry.isFile() && /\.(?:[cm]?js|json)$/.test(entry.name) ? [relative] : [];
  }).sort(compare);
}

function literalSpecifier(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function patternNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'RestElement') return patternNames(node.argument);
  if (node.type === 'AssignmentPattern') return patternNames(node.left);
  if (node.type === 'ArrayPattern') return node.elements.flatMap(patternNames);
  if (node.type === 'ObjectPattern') return node.properties.flatMap((entry) => patternNames(entry.value || entry.argument));
  return [];
}

/** Parse dependency syntax without treating comments or strings as imports. */
function parseDependencies(source, file, addIssue) {
  const comments = [];
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 'latest', sourceType: 'module', locations: true,
      allowHashBang: true, allowReturnOutsideFunction: true, onComment: comments,
    });
  } catch (error) {
    addIssue('PARSE_ERROR', file, error.loc?.line || 1, error.message);
    return [];
  }
  const annotations = comments.filter((comment) => comment.value.includes('maestro-dependencies:'))
    .map((comment) => ({ ...comment, kind: comment.value.trim().match(/^maestro-dependencies:\s*([a-z-]+)$/)?.[1], used: false }));
  for (const annotation of annotations) {
    if (!DYNAMIC_KINDS.has(annotation.kind)) {
      addIssue('UNKNOWN_ANNOTATION', file, annotation.loc.start.line, `Unknown dependency annotation: ${annotation.value.trim()}`);
    }
  }

  // A shadowed/rebound loader is outside the supported static subset. Fail
  // explicitly rather than mistaking its calls for Node's CommonJS loader.
  let shadowsRequire = false;
  walk.full(ast, (node) => {
    const names = node.type === 'VariableDeclarator' ? patternNames(node.id)
      : /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)
        ? [...patternNames(node.id), ...node.params.flatMap(patternNames)]
        : node.type === 'CatchClause' ? patternNames(node.param)
          : /^(ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier)$/.test(node.type)
            ? patternNames(node.local) : [];
    if (names.includes('require')) {
      shadowsRequire = true;
      addIssue('UNSUPPORTED_REQUIRE', file, node.loc.start.line, 'Shadowed require is unsupported');
    }
  });

  const dependencies = [];
  function add(node, argument, kind, parent) {
    const specifier = literalSpecifier(argument);
    if (specifier !== null) {
      if ((specifier === 'node:module' || specifier === 'module') && kind !== 'require.resolve') {
        const safeNames = new Set(['isBuiltin', 'builtinModules']);
        const properties = parent?.type === 'VariableDeclarator' && parent.init === node
          && parent.id.type === 'ObjectPattern' ? parent.id.properties : null;
        const safeDestructure = properties && properties.every((property) => property.type === 'Property'
          && !property.computed && safeNames.has(property.key.name));
        const safeMember = parent?.type === 'MemberExpression' && parent.object === node
          && !parent.computed && safeNames.has(parent.property.name);
        const safeImport = node.type === 'ImportDeclaration' && node.specifiers.every((entry) =>
          entry.type === 'ImportSpecifier' && safeNames.has(entry.imported.name));
        if (!safeDestructure && !safeMember && !safeImport) {
          addIssue('UNSUPPORTED_REQUIRE', file, node.loc.start.line,
            'Indirect module loaders (including createRequire) are unsupported');
        }
      }
      dependencies.push({ specifier, kind, line: node.loc.start.line });
      return;
    }
    const annotation = annotations.find((comment) => !comment.used
      && (comment.loc.end.line === node.loc.start.line - 1 || comment.loc.end.line === node.loc.start.line)
      && comment.end < node.start);
    if (annotation) annotation.used = true;
    if (!annotation || !DYNAMIC_KINDS.has(annotation.kind)) {
      addIssue('DYNAMIC_DEPENDENCY', file, node.loc.start.line, 'Computed dependency needs a recognized maestro-dependencies annotation');
      return;
    }
    dependencies.push({ dynamic: annotation.kind, kind, line: node.loc.start.line });
  }
  walk.fullAncestor(ast, (node, _state, ancestors) => {
    const parent = ancestors[ancestors.length - 2];
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'module') {
      const property = node.computed ? literalSpecifier(node.property) : node.property.name;
      if (!['exports', 'filename', 'id', 'loaded', 'paths'].includes(property)) {
        addIssue('UNSUPPORTED_REQUIRE', file, node.loc.start.line, 'Indirect module.require is unsupported; use a direct require');
      }
    }
    if (node.type === 'Identifier' && node.name === 'module') {
      const member = parent?.type === 'MemberExpression' && parent.object === node;
      const other = parent?.type === 'BinaryExpression'
        ? (parent.left === node ? parent.right : parent.left) : null;
      const mainGuard = ['===', '!==', '==', '!='].includes(parent?.operator)
        && other?.type === 'MemberExpression' && other.object.name === 'require'
        && !other.computed && other.property.name === 'main';
      if (!member && !mainGuard) {
        addIssue('UNSUPPORTED_REQUIRE', file, node.loc.start.line, 'Escaped or aliased module loader is unsupported');
      }
    }
    if (node.type === 'Identifier' && node.name === 'require') {
      const isCall = parent?.type === 'CallExpression' && parent.callee === node;
      const isResolve = parent?.type === 'MemberExpression' && parent.object === node
        && !parent.computed && parent.property.name === 'resolve'
        && ancestors[ancestors.length - 3]?.type === 'CallExpression'
        && ancestors[ancestors.length - 3].callee === parent;
      const isMain = parent?.type === 'MemberExpression' && parent.object === node
        && !parent.computed && parent.property.name === 'main';
      if (!isCall && !isResolve && !isMain) {
        addIssue('UNSUPPORTED_REQUIRE', file, node.loc.start.line, 'Aliased, reassigned or indirect require is unsupported');
      }
    }
    if (node.type === 'CallExpression') {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        if (!shadowsRequire) add(node, node.arguments.length === 1 ? node.arguments[0] : null, 'require', parent);
      } else if (node.callee.type === 'MemberExpression' && node.callee.object.name === 'require'
        && !node.callee.computed && node.callee.property.name === 'resolve') {
        if (!shadowsRequire) add(node, node.arguments.length === 1 ? node.arguments[0] : null, 'require.resolve', parent);
      }
    } else if (node.type === 'ImportExpression') {
      add(node, node.source, 'import');
    } else if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration'
      || (node.type === 'ExportNamedDeclaration' && node.source)) {
      add(node, node.source, 'import');
    }
  });
  for (const annotation of annotations) {
    if (!annotation.used && DYNAMIC_KINDS.has(annotation.kind)) {
      addIssue('STALE_ANNOTATION', file, annotation.loc.start.line, `Unused dependency annotation: ${annotation.kind}`);
    }
  }
  return dependencies;
}

function getDependencyClosure(graph, roots) {
  const outgoing = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }
  const reachable = new Set();
  const visit = (file) => {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const dependency of outgoing.get(file) || []) visit(dependency);
  };
  for (const root of roots) visit(root);
  return [...reachable].sort(compare);
}

/**
 * Analyze canonical src/ without evaluating modules. Paths are relative to
 * rootDir; roots may also include content files. Supplying roots scans only
 * their closure. sourceOverrides is a Map of fresh, not-yet-written registries.
 */
function buildDependencyGraph({ rootDir, roots, runtime, sourceOverrides = new Map() }) {
  rootDir = fs.realpathSync(rootDir);
  const nodes = new Set();
  const edges = [];
  const issues = [];
  const addIssue = (code, file, line, message) => issues.push({ code, file, line, message });
  const read = (file) => sourceOverrides.has(file) ? sourceOverrides.get(file) : fs.readFileSync(path.join(rootDir, file), 'utf8');

  function checkedRealPath(candidate, from, specifier, line) {
    // A fresh registry may not exist yet. Resolve its nearest existing parent
    // too, so virtual bytes cannot bypass a symlink at the destination.
    let existing = candidate;
    while (true) {
      try { fs.lstatSync(existing); break; } catch (error) {
        if (error.code !== 'ENOENT' || existing === rootDir) {
          addIssue('UNRESOLVED_DEPENDENCY_PATH', from, line, `Cannot resolve dependency path: ${specifier}`);
          return null;
        }
        existing = path.dirname(existing);
      }
    }
    let real;
    try { real = path.resolve(fs.realpathSync(existing), path.relative(existing, candidate)); } catch {
      addIssue('UNRESOLVED_DEPENDENCY_PATH', from, line, `Cannot resolve dependency symlink: ${specifier}`);
      return null;
    }
    if (!isWithin(rootDir, real)) {
      addIssue('OUTSIDE_ROOT', from, line, `Dependency symlink escapes canonical source: ${specifier}`);
      return null;
    }
    if (real !== candidate) {
      addIssue('SYMLINK_DEPENDENCY', from, line,
        `Symlink dependency is unsupported in generated payloads: ${specifier}`);
    }
    return real;
  }

  function resolve(from, specifier, line) {
    const location = path.resolve(rootDir, path.dirname(from), specifier);
    for (const candidate of [location, location + '.js', location + '.json', path.join(location, 'index.js'), path.join(location, 'index.json')]) {
      const relative = posix(path.relative(rootDir, candidate));
      if (!isWithin(rootDir, candidate)) {
        addIssue('OUTSIDE_ROOT', from, line, `Dependency escapes canonical source: ${specifier}`);
        return null;
      }
      if (sourceOverrides.has(relative)) {
        return checkedRealPath(candidate, from, specifier, line) ? relative : null;
      }
      let stat;
      try { stat = fs.statSync(candidate); } catch { continue; }
      if (!stat.isFile()) continue;
      const real = checkedRealPath(candidate, from, specifier, line);
      if (!real) return null;
      return posix(path.relative(rootDir, real));
    }
    addIssue('MISSING_DEPENDENCY', from, line, `Missing dependency: ${specifier}`);
    return null;
  }

  function dynamicTargets(kind, from, line) {
    if (kind === 'hook-handlers') {
      try {
        const registry = JSON.parse(read('generated/hook-registry.json'));
        const targets = Object.values(registry).map((entry) => entry.module);
        if (targets.some((target) => typeof target !== 'string' || !target)) throw new Error('Invalid hook module');
        return [...new Set(targets)].sort(compare);
      } catch (error) {
        addIssue('INVALID_ANNOTATION_TARGETS', from, line, `Cannot expand hook-handlers: ${error.message}`);
        return [];
      }
    }
    const name = kind === 'runtime-configs' ? 'runtime-config.js' : 'hook-adapter.js';
    const platformsDir = path.join(rootDir, 'platforms');
    const entries = fs.existsSync(platformsDir) ? fs.readdirSync(platformsDir, { withFileTypes: true }) : [];
    const targets = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'shared' && (!runtime || entry.name === runtime))
      .map((entry) => `platforms/${entry.name}/${name}`)
      .filter((file) => sourceOverrides.has(file) || fs.existsSync(path.join(rootDir, file)))
      .sort(compare);
    if (targets.length === 0) addIssue('INVALID_ANNOTATION_TARGETS', from, line, `No targets for ${kind}${runtime ? ` (${runtime})` : ''}`);
    return targets;
  }

  function visit(file) {
    if (nodes.has(file)) return;
    nodes.add(file);
    if (!/\.[cm]?js$/.test(file)) return;
    const dependencies = parseDependencies(read(file), file, addIssue);
    for (const dependency of dependencies) {
      const specifiers = dependency.dynamic
        ? dynamicTargets(dependency.dynamic, file, dependency.line).map((target) => './' + posix(path.relative(path.dirname(file), target)))
        : [dependency.specifier];
      for (const specifier of specifiers) {
        if (specifier.startsWith('node:')) {
          if (!isBuiltin(specifier)) addIssue('INVALID_BUILTIN', file, dependency.line, `Unknown Node builtin: ${specifier}`);
          continue;
        }
        if (!specifier.startsWith('.')) {
          if (!isBuildOnly(file)) addIssue('EXTERNAL_DEPENDENCY', file, dependency.line,
            `require('${specifier}') — non-relative, non-node import in runtime code`);
          continue;
        }
        const target = resolve(file, specifier, dependency.line);
        if (!target) continue;
        edges.push({ from: file, to: target, specifier, kind: dependency.kind, line: dependency.line });
        const layer = file.split('/')[0];
        if (LAYERS[layer] && !LAYERS[layer].includes(target.split('/')[0])) {
          addIssue('LAYER_BOUNDARY', file, dependency.line, `require('${specifier}') — resolves to src/${target}`);
        }
        if (!isBuildOnly(file) && isBuildOnly(target)) {
          addIssue('RUNTIME_BUILD_DEPENDENCY', file, dependency.line, `Runtime code depends on build-only module: ${target}`);
        }
        visit(target);
      }
    }
  }

  const requestedRoots = roots || [...new Set([...collectModules(rootDir), ...sourceOverrides.keys()].filter((file) => /\.[cm]?js$/.test(file)))];
  for (const root of requestedRoots) {
    const resolved = resolve('', './' + root, 1);
    if (resolved) visit(resolved);
  }
  edges.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to) || a.line - b.line);
  const graph = { nodes: [...nodes].sort(compare), edges, issues };

  // One diagnostic per back edge, with the concrete cycle for review.
  const outgoing = new Map(graph.nodes.map((file) => [file, []]));
  for (const edge of edges) outgoing.get(edge.from).push(edge.to);
  const active = new Set();
  const done = new Set();
  function checkCycles(file, trail) {
    if (active.has(file)) {
      const cycle = [...trail.slice(trail.indexOf(file)), file];
      addIssue('DEPENDENCY_CYCLE', file, 1, `Dependency cycle: ${cycle.join(' -> ')}`);
      return;
    }
    if (done.has(file)) return;
    active.add(file);
    for (const target of outgoing.get(file) || []) checkCycles(target, [...trail, file]);
    active.delete(file);
    done.add(file);
  }
  for (const node of graph.nodes) checkCycles(node, []);
  issues.sort((a, b) => compare(a.file, b.file) || a.line - b.line || compare(a.code, b.code) || compare(a.message, b.message));
  // Nodes are populated only by visiting the requested roots and their imports.
  graph.reachable = graph.nodes.slice();
  return graph;
}

module.exports = { buildDependencyGraph, getDependencyClosure };
