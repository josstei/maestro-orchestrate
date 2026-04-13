#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve: resolveTransform } = require('../src/transforms');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const VERSION_JSON_FILENAME = 'version.json';

const DETACHED_PAYLOAD_BASE_ALLOWLIST = [
  'core/',
  'config/',
  'hooks/',
  'mcp/',
  'platforms/shared/',
  'state/',
  'agents/',
  'skills/',
  'references/',
  'templates/',
  'entry-points/',
];

function buildPayloadAllowlist(runtimeName) {
  return [
    ...DETACHED_PAYLOAD_BASE_ALLOWLIST,
    `platforms/${runtimeName}/runtime-config.js`,
  ];
}

function shouldIncludeInPayload(relativePath, allowlist) {
  const list = allowlist || DETACHED_PAYLOAD_BASE_ALLOWLIST;
  return list.some((prefix) => relativePath.startsWith(prefix));
}

function shouldDescendInto(relativeDir, allowlist) {
  const dir = relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`;
  const list = allowlist || DETACHED_PAYLOAD_BASE_ALLOWLIST;
  return list.some(
    (prefix) => prefix.startsWith(dir) || dir.startsWith(prefix)
  );
}

function buildDetachedPayload(srcDir, outputDir, runtimeName) {
  const allowlist = runtimeName ? buildPayloadAllowlist(runtimeName) : DETACHED_PAYLOAD_BASE_ALLOWLIST;
  const stats = { copied: 0, removed: 0, skipped: 0 };
  const keptOutputs = new Set();

  function walkAndCopy(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(srcDir, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (shouldDescendInto(relativePath, allowlist)) {
          walkAndCopy(fullPath);
        } else {
          stats.skipped++;
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldIncludeInPayload(relativePath, allowlist)) {
        stats.skipped++;
        continue;
      }

      keptOutputs.add(relativePath);
      const outputPath = path.join(outputDir, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const content = fs.readFileSync(fullPath, 'utf8');
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
      if (existing !== content) {
        fs.writeFileSync(outputPath, content, 'utf8');
        stats.copied++;
      }
    }
  }

  function cleanStale(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(outputDir, fullPath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        cleanStale(fullPath);
        if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
        }
      } else if (!keptOutputs.has(relativePath)) {
        fs.unlinkSync(fullPath);
        stats.removed++;
      }
    }
  }

  walkAndCopy(srcDir);
  if (runtimeName) {
    keptOutputs.add(VERSION_JSON_FILENAME);
  }
  cleanStale(outputDir);
  return stats;
}

/**
 * Resolve an output path safely within the project root.
 * Throws if the resolved path escapes the project directory.
 */
function safeResolve(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Path traversal detected: "${relativePath}" resolves outside project root`);
  }
  return resolved;
}

/**
 * Expand a glob pattern relative to srcDir.
 * Supports `*` (wildcard within a single directory) and `**` (recursive).
 * Returns sorted relative paths (posix separators).
 */
function expandGlob(pattern, srcDir) {
  const segments = pattern.split('/');
  const results = [];

  function walk(dir, segIndex) {
    if (segIndex >= segments.length) return;

    const segment = segments[segIndex];
    const isLast = segIndex === segments.length - 1;

    if (segment === '**') {
      // Match zero or more directories — try current level and recurse
      // Try skipping ** (match zero dirs)
      walk(dir, segIndex + 1);
      // Recurse into subdirectories
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), segIndex); // stay on ** for deeper recursion
        }
      }
    } else {
      // Build regex from segment (handles * wildcard and literal chars)
      const re = new RegExp(
        '^' + segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
      );

      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (!re.test(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (isLast) {
          if (entry.isFile()) {
            results.push(path.relative(srcDir, fullPath));
          }
        } else {
          if (entry.isDirectory()) {
            walk(fullPath, segIndex + 1);
          }
        }
      }
    }
  }

  walk(srcDir, 0);
  return results.sort();
}

/**
 * Compute the output path for a source-relative path in a given runtime.
 * Handles:
 *   - snake_case agent naming for runtimes with agentNaming: 'snake_case'
 *   - Prepending outputDir (skipped for './')
 *   - Rewriting skills/shared/X → skills/X
 */
function computeOutputPath(srcRelPath, runtime) {
  let outPath = srcRelPath;

  // Rewrite skills/shared/X → skills/X
  if (outPath.startsWith('skills/shared/')) {
    outPath = 'skills/' + outPath.slice('skills/shared/'.length);
  }

  // For agent files, apply naming convention
  if (outPath.startsWith('agents/') && runtime.agentNaming === 'snake_case') {
    const dir = path.dirname(outPath);
    const base = path.basename(outPath);
    outPath = dir + '/' + base.replace(/-/g, '_');
  }

  // Prepend runtime outputDir (skip for './')
  if (runtime.outputDir && runtime.outputDir !== './') {
    outPath = runtime.outputDir + outPath;
  }

  return outPath;
}

function normalizeOutputBase(outputBase, runtimeName) {
  if (!outputBase) {
    return '';
  }

  if (typeof outputBase === 'string') {
    return outputBase;
  }

  if (typeof outputBase === 'object') {
    return outputBase[runtimeName] || '';
  }

  throw new Error(`Invalid outputBase: ${JSON.stringify(outputBase)}`);
}

function joinRelativePath(base, relativePath) {
  if (!base) {
    return relativePath;
  }

  return path.posix.join(base, relativePath);
}

function buildRuntimeOutputPath(runtime, relativePath) {
  if (!runtime.outputDir || runtime.outputDir === './') {
    return relativePath;
  }

  return runtime.outputDir + relativePath;
}

function assertNoMirroredSharedOutputs(manifest) {
  for (const entry of manifest) {
    for (const outputPath of Object.values(entry.outputs)) {
      if (
        outputPath === 'mcp/maestro-server-core.js' ||
        outputPath === 'claude/mcp/maestro-server-core.js' ||
        outputPath === 'plugins/maestro/mcp/maestro-server-core.js' ||
        outputPath === 'lib/mcp/generated/resource-registry.js' ||
        outputPath === 'plugins/maestro/lib/mcp/generated/resource-registry.js' ||
        outputPath === 'plugins/maestro/lib/mcp/generated/agent-registry.js' ||
        outputPath.startsWith('lib/') ||
        outputPath.startsWith('claude/lib/') ||
        outputPath.startsWith('plugins/maestro/lib/')
      ) {
        throw new Error(`Manifest output is not allowed in src-first mode: "${outputPath}"`);
      }
    }
  }
}

/**
 * Expand convention-based manifest rules into explicit entries.
 *
 * Three rule formats:
 *   1. Legacy: has `outputs` field — passed through unchanged
 *   2. Explicit src + runtimes: has `src` and `runtimes` (no `glob`) — expands to outputs per runtime
 *   3. Glob: has `glob` and `runtimes` — scans srcDir, produces one entry per matched file
 *
 * Does NOT merge entries for the same source file — different rules may have different transforms.
 */
function expandManifest(rules, runtimes, srcDir) {
  const entries = [];

  for (const rule of rules) {
    // Legacy format: pass through unchanged
    if (rule.outputs) {
      entries.push(rule);
      continue;
    }

    // Validate required fields before expansion
    if (!rule.runtimes || !Array.isArray(rule.runtimes)) {
      throw new Error(`Manifest rule missing "runtimes": ${JSON.stringify(rule)}`);
    }
    if (!rule.glob && !rule.src) {
      throw new Error(`Manifest rule needs "glob" or "src": ${JSON.stringify(rule)}`);
    }

    // Determine source files to expand
    let srcFiles;
    if (rule.glob) {
      srcFiles = expandGlob(rule.glob, srcDir);
      if (rule.exclude) {
        const excludeSet = new Set(rule.exclude);
        srcFiles = srcFiles.filter((f) => !excludeSet.has(f));
      }
    } else {
      srcFiles = [rule.src];
    }

    for (const srcRelPath of srcFiles) {
      const outputs = {};
      for (const runtimeName of rule.runtimes) {
        const runtime = runtimes[runtimeName];
        if (rule.outputName) {
          // Use explicit outputName, but still prepend outputDir
          let outPath = rule.outputName;
          if (runtime.outputDir && runtime.outputDir !== './') {
            outPath = runtime.outputDir + outPath;
          }
          outputs[runtimeName] = outPath;
        } else if (rule.preserveSourcePath) {
          const outputBase = normalizeOutputBase(rule.outputBase, runtimeName);
          outputs[runtimeName] = buildRuntimeOutputPath(
            runtime,
            joinRelativePath(outputBase, srcRelPath)
          );
        } else {
          const outputBase = normalizeOutputBase(rule.outputBase, runtimeName);
          outputs[runtimeName] = buildRuntimeOutputPath(
            runtime,
            joinRelativePath(outputBase, computeOutputPath(srcRelPath, { ...runtime, outputDir: './' }))
          );
        }
      }
      entries.push({
        src: srcRelPath,
        transforms: rule.transforms,
        outputs,
      });
    }
  }

  return entries;
}

/**
 * Produce a human-readable title from a kebab-case name.
 *   "review"           → "Review"
 *   "security-audit"   → "Security Audit"
 *   "perf-check"       → "Perf Check"
 *   "a11y-audit"       → "Accessibility Audit"
 *   "seo-audit"        → "SEO Audit"
 *   "compliance-check" → "Compliance Check"
 */
function toTitle(name) {
  const special = {
    'a11y-audit': 'Accessibility Audit',
    'seo-audit': 'SEO Audit',
  };
  if (special[name]) return special[name];
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const ENTRY_POINT_TEMPLATE_MAP = {
  gemini: { file: 'gemini-command.toml.tmpl', outputPath: (e) => `commands/maestro/${e.name}.toml` },
  claude: { file: 'claude-skill.md.tmpl', outputPath: (e) => `claude/skills/${e.name}/SKILL.md` },
  codex: { file: 'codex-skill.md.tmpl', outputPath: (e) => `plugins/maestro/skills/${e.name}/SKILL.md` },
};

const PREAMBLE_PLACEHOLDER_MAP = {
  gemini: 'skills_block',
  claude: 'protocol_block',
  codex: 'refs_list',
};

function expandEntryPoints(runtimeName) {
  const registry = require(path.join(SRC, 'entry-points', 'registry'));
  const preambleBuilders = require(path.join(SRC, 'entry-points', 'preamble-builders'));
  const templateDir = path.join(SRC, 'entry-points', 'templates');

  const mapping = ENTRY_POINT_TEMPLATE_MAP[runtimeName];
  if (!mapping) {
    throw new Error(`Unknown runtime for entry-point expansion: "${runtimeName}"`);
  }

  const template = fs.readFileSync(path.join(templateDir, mapping.file), 'utf8');
  const buildPreamble = preambleBuilders[runtimeName];
  const placeholder = PREAMBLE_PLACEHOLDER_MAP[runtimeName];

  return registry.map((entry) => {
    let content = template;

    content = content.replace(/\{\{name\}\}/g, entry.name);
    content = content.replace(/\{\{Name\}\}/g, toTitle(entry.name));
    content = content.replace(/\{\{description\}\}/g, entry.description);

    const workflowNumbered = entry.workflow
      .map((step, i) => `${i + 1}. ${step}`)
      .join('\n');
    content = content.replace(/\{\{workflow_numbered\}\}/g, workflowNumbered);

    const constraintsList = (entry.constraints || [])
      .map((c) => `- ${c}`)
      .join('\n');
    content = content.replace(/\{\{constraints_list\}\}/g, constraintsList);

    const preamble = buildPreamble(entry);
    content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), preamble);

    return {
      outputPath: mapping.outputPath(entry),
      content,
    };
  });
}

const GEMINI_SESSION_STATE_BLOCK = `The current session state is provided below:

<session-state>
!{extension_root="\${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"; script="$extension_root/src/scripts/read-active-session.js"; if [[ -f "$script" ]]; then node "$script"; else echo "No active session"; fi}
</session-state>

Use the injected session state above as the source of truth for resume position.

`;

function expandCoreCommands(runtimeName) {
  const registry = require(path.join(SRC, 'entry-points', 'core-command-registry'));
  const templateDir = path.join(SRC, 'entry-points', 'templates');

  let templateFile, outputPathFn;
  if (runtimeName === 'gemini') {
    templateFile = path.join(templateDir, 'gemini-core-command.toml.tmpl');
    outputPathFn = (entry) => `commands/maestro/${entry.name}.toml`;
  } else if (runtimeName === 'claude') {
    templateFile = path.join(templateDir, 'claude-core-command.md.tmpl');
    outputPathFn = (entry) => `claude/skills/${entry.name}/SKILL.md`;
  } else if (runtimeName === 'codex') {
    templateFile = path.join(templateDir, 'codex-core-command.md.tmpl');
    outputPathFn = (entry) => `plugins/maestro/skills/${entry.name}/SKILL.md`;
  } else {
    throw new Error(`Unknown runtime for core-command expansion: "${runtimeName}"`);
  }

  const template = fs.readFileSync(templateFile, 'utf8');

  return registry.map((entry) => {
    let content = template;

    content = content.replace(/\{\{name\}\}/g, entry.name);
    content = content.replace(/\{\{description\}\}/g, entry.description);
    content = content.replace(/\{\{firstLine\}\}/g, entry.firstLine);
    content = content.replace(/\{\{requestType\}\}/g, entry.requestType);
    content = content.replace(/\{\{executeInstructions\}\}/g, entry.executeInstructions);

    const preloadList = entry.preload.map((r) => `"${r}"`).join(', ');
    content = content.replace(/\{\{preloadList\}\}/g, preloadList);

    const sessionBlock = (runtimeName === 'gemini' && entry.geminiSessionStateInjection)
      ? GEMINI_SESSION_STATE_BLOCK
      : '';
    content = content.replace(/\{\{sessionStateBlock\}\}/g, sessionBlock);

    return {
      outputPath: outputPathFn(entry),
      content,
    };
  });
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');

async function main() {
  const runtimeFiles = fs.readdirSync(path.join(SRC, 'platforms'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .map((entry) => path.join(entry.name, 'runtime-config.js'))
    .filter((relativePath) => fs.existsSync(path.join(SRC, 'platforms', relativePath)));

  const runtimes = {};
  for (const file of runtimeFiles) {
    const config = require(path.join(SRC, 'platforms', file));
    runtimes[config.name] = config;
  }

  const manifestRules = require(path.join(SRC, 'manifest'));
  const manifest = expandManifest(manifestRules, runtimes, SRC);
  assertNoMirroredSharedOutputs(manifest);

  const stats = { written: 0, unchanged: 0, errors: 0 };

  if (cleanMode && !dryRun) {
    for (const entry of manifest) {
      for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
        const absPath = safeResolve(outputPath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      }
    }
    console.log('Cleaned all generator-owned files.');
  }

  for (const entry of manifest) {
    const srcPath = path.join(SRC, entry.src);

    if (!fs.existsSync(srcPath)) {
      console.error(`ERROR: Source not found: ${entry.src}`);
      stats.errors++;
      continue;
    }

    const sourceContent = fs.readFileSync(srcPath, 'utf8');

    for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
      const runtime = runtimes[runtimeName];
      if (!runtime) {
        console.error(`ERROR: Unknown runtime "${runtimeName}" for ${entry.src}`);
        stats.errors++;
        continue;
      }

      try {
        let content = sourceContent;
        for (const transformName of entry.transforms) {
          const { fn, param } = resolveTransform(transformName);
          content = fn(content, runtime, { src: entry.src, param, outputPath });
        }

        const absOutputPath = safeResolve(outputPath);

        if (diffMode) {
          if (!fs.existsSync(absOutputPath)) {
            console.log(`+++ NEW: ${outputPath}`);
          } else {
            const current = fs.readFileSync(absOutputPath, 'utf8');
            if (current !== content) {
              const tmpPath = absOutputPath + '.gen-tmp';
              fs.writeFileSync(tmpPath, content, 'utf8');
              try {
                execFileSync('diff', ['-u', absOutputPath, tmpPath], { encoding: 'utf8' });
              } catch (err) {
                console.log(`--- ${outputPath}`);
                console.log(err.stdout);
              } finally {
                fs.unlinkSync(tmpPath);
              }
            }
          }
        } else if (dryRun) {
          const exists = fs.existsSync(absOutputPath);
          const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;
          const status = !exists ? 'CREATE' : current === content ? 'UNCHANGED' : 'UPDATE';
          console.log(`[${status}] ${outputPath}`);
        } else {
          fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });
          const exists = fs.existsSync(absOutputPath);
          const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;

          if (current === content) {
            stats.unchanged++;
          } else {
            fs.writeFileSync(absOutputPath, content, 'utf8');
            stats.written++;
          }
        }
      } catch (err) {
        console.error(`ERROR processing ${entry.src} -> ${outputPath}: ${err.message}`);
        stats.errors++;
      }
    }
  }

  // ── Generate registry-driven files (entry-points + core commands) ──
  const registryExpanders = [
    { label: 'entry-point', fn: expandEntryPoints },
    { label: 'core-command', fn: expandCoreCommands },
  ];

  for (const { label, fn } of registryExpanders) {
    for (const runtimeName of Object.keys(runtimes)) {
      const expanded = fn(runtimeName);
      for (const { outputPath, content } of expanded) {
        const absOutputPath = safeResolve(outputPath);

        try {
          if (diffMode) {
            if (!fs.existsSync(absOutputPath)) {
              console.log(`+++ NEW: ${outputPath}`);
            } else {
              const current = fs.readFileSync(absOutputPath, 'utf8');
              if (current !== content) {
                const tmpPath = absOutputPath + '.gen-tmp';
                fs.writeFileSync(tmpPath, content, 'utf8');
                try {
                  execFileSync('diff', ['-u', absOutputPath, tmpPath], { encoding: 'utf8' });
                } catch (err) {
                  console.log(`--- ${outputPath}`);
                  console.log(err.stdout);
                } finally {
                  fs.unlinkSync(tmpPath);
                }
              }
            }
          } else if (dryRun) {
            const exists = fs.existsSync(absOutputPath);
            const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;
            const status = !exists ? 'CREATE' : current === content ? 'UNCHANGED' : 'UPDATE';
            console.log(`[${status}] ${outputPath}`);
          } else {
            fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });
            const exists = fs.existsSync(absOutputPath);
            const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;

            if (current === content) {
              stats.unchanged++;
            } else {
              fs.writeFileSync(absOutputPath, content, 'utf8');
              stats.written++;
            }
          }
        } catch (err) {
          console.error(`ERROR processing ${label} -> ${outputPath}: ${err.message}`);
          stats.errors++;
        }
      }
    }
  }

  if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (!dryRun && !diffMode) {
    // Collect all manifest output paths into a Set
    const manifestPaths = new Set();
    for (const entry of manifest) {
      for (const outputPath of Object.values(entry.outputs)) {
        manifestPaths.add(outputPath);
      }
    }

    for (const fn of [expandEntryPoints, expandCoreCommands]) {
      for (const runtimeName of Object.keys(runtimes)) {
        for (const { outputPath } of fn(runtimeName)) {
          manifestPaths.add(outputPath);
        }
      }
    }

    // Generator-owned directories to scan
    const ownedDirs = [
      'agents',
      'claude/agents',
      'claude/skills',
      'plugins/maestro/skills',
      'commands',
    ];

    // Generator-owned root-level files
    const ownedRootFiles = [];

    function walkDir(dir) {
      const results = [];
      const absDir = path.join(ROOT, dir);
      if (!fs.existsSync(absDir)) return results;
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          results.push(...walkDir(relPath));
        } else {
          results.push(relPath);
        }
      }
      return results;
    }

    const allOwnedFiles = [];
    for (const dir of ownedDirs) {
      allOwnedFiles.push(...walkDir(dir));
    }
    for (const f of ownedRootFiles) {
      const abs = path.join(ROOT, f);
      if (fs.existsSync(abs)) allOwnedFiles.push(f);
    }
    const staleFiles = allOwnedFiles.filter((f) => !manifestPaths.has(f));
    if (staleFiles.length > 0) {
      console.log('\nPruning stale files (not in manifest):');
      for (const f of staleFiles) {
        fs.unlinkSync(path.join(ROOT, f));
        console.log(`  PRUNED: ${f}`);
      }
    }

    function walkSubdirs(dir) {
      const results = [];
      const absDir = path.join(ROOT, dir);
      if (!fs.existsSync(absDir)) return results;
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const relPath = `${dir}/${entry.name}`;
        results.push(...walkSubdirs(relPath));
        results.push(relPath);
      }
      return results;
    }

    const ownedSubdirs = ownedDirs
      .flatMap((dir) => walkSubdirs(dir))
      .sort((a, b) => b.length - a.length);

    for (const dir of ownedSubdirs) {
      const absDir = path.join(ROOT, dir);
      if (!fs.existsSync(absDir)) continue;
      if (fs.readdirSync(absDir).length === 0) {
        fs.rmdirSync(absDir);
      }
    }
  }

  if (!dryRun && !diffMode) {
    const claudePayloadStats = buildDetachedPayload(SRC, path.join(ROOT, 'claude', 'src'), 'claude');
    const codexPayloadStats = buildDetachedPayload(SRC, path.join(ROOT, 'plugins', 'maestro', 'src'), 'codex');
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    const versionContent = JSON.stringify({ version: pkgVersion }, null, 2) + '\n';

    for (const payloadDir of [path.join(ROOT, 'claude', 'src'), path.join(ROOT, 'plugins', 'maestro', 'src')]) {
      const versionPath = path.join(payloadDir, VERSION_JSON_FILENAME);
      const existingContent = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8') : null;

      if (existingContent !== versionContent) {
        fs.writeFileSync(versionPath, versionContent, 'utf8');
      }
    }

    console.log(
      `\nDetached payloads: claude/src (${claudePayloadStats.copied} updated, ${claudePayloadStats.removed} removed), ` +
      `plugins/maestro/src (${codexPayloadStats.copied} updated, ${codexPayloadStats.removed} removed)`
    );
  }

  if (stats.errors > 0) process.exit(1);
}

// Only run main() when executed directly (not when required as a module)
if (require.main === module) {
  main().catch((err) => {
    console.error('Generator failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  assertNoMirroredSharedOutputs,
  buildPayloadAllowlist,
  buildRuntimeOutputPath,
  buildDetachedPayload,
  expandCoreCommands,
  expandManifest,
  expandEntryPoints,
  shouldDescendInto,
  shouldIncludeInPayload,
};
