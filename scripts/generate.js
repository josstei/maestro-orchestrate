#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve: resolveTransform } = require('../src/transforms');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

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
        } else {
          outputs[runtimeName] = computeOutputPath(srcRelPath, runtime);
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

/**
 * Expand the entry-point registry through a runtime-specific template.
 * Returns an array of { outputPath, content } objects.
 */
function expandEntryPoints(runtimeName) {
  const registry = require(path.join(SRC, 'entry-points', 'registry'));
  const templateDir = path.join(SRC, 'entry-points', 'templates');

  let templateFile, outputPathFn;
  if (runtimeName === 'gemini') {
    templateFile = path.join(templateDir, 'gemini-command.toml.tmpl');
    outputPathFn = (entry) => `commands/maestro/${entry.name}.toml`;
  } else if (runtimeName === 'claude') {
    templateFile = path.join(templateDir, 'claude-skill.md.tmpl');
    outputPathFn = (entry) => `claude/skills/${entry.name}/SKILL.md`;
  } else if (runtimeName === 'codex') {
    templateFile = path.join(templateDir, 'codex-skill.md.tmpl');
    outputPathFn = (entry) => `plugins/maestro/skills/maestro-${entry.name}/SKILL.md`;
  } else {
    throw new Error(`Unknown runtime for entry-point expansion: "${runtimeName}"`);
  }

  const template = fs.readFileSync(templateFile, 'utf8');

  return registry.map((entry) => {
    let content = template;

    // ── Simple variables ──────────────────────────────────────────────
    content = content.replace(/\{\{name\}\}/g, entry.name);
    content = content.replace(/\{\{Name\}\}/g, toTitle(entry.name));
    content = content.replace(/\{\{description\}\}/g, entry.description);

    // ── Workflow numbered list ────────────────────────────────────────
    const workflowNumbered = entry.workflow
      .map((step, i) => `${i + 1}. ${step}`)
      .join('\n');
    content = content.replace(/\{\{workflow_numbered\}\}/g, workflowNumbered);

    // ── Constraints bulleted list ────────────────────────────────────
    const constraintsList = (entry.constraints || [])
      .map((c) => `- ${c}`)
      .join('\n');
    content = content.replace(/\{\{constraints_list\}\}/g, constraintsList);

    // ── Gemini: skills_block ─────────────────────────────────────────
    // Activate skills and reference delegation protocol.
    if (runtimeName === 'gemini') {
      const skills = entry.skills || [];
      let skillsBlock = '';
      if (skills.length > 0) {
        const skillList = skills.map((s) => `\`${s}\``).join(' and ');
        skillsBlock = `Activate the ${skillList} skill${skills.length > 1 ? 's' : ''}. The delegation skill ensures agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.`;
      }
      content = content.replace(/\{\{skills_block\}\}/g, skillsBlock);
    }

    // ── Claude: protocol_block ───────────────────────────────────────
    // If the entry has agents (needs delegation), include protocol section.
    if (runtimeName === 'claude') {
      let protocolBlock = '';
      if (entry.agents && entry.agents.length > 0) {
        protocolBlock =
          '## Protocol\n\nBefore delegating, activate the `delegation` skill to ensure agent-base-protocol and filesystem-safety-protocol are injected into the delegation prompt.\n';
      }
      content = content.replace(/\{\{protocol_block\}\}/g, protocolBlock);
    }

    // ── Codex: refs_list ─────────────────────────────────────────────
    // Build Read directives for architecture, delegation skill, and agent files.
    if (runtimeName === 'codex') {
      const refs = [];
      if (entry.refs && entry.refs.includes('architecture')) {
        refs.push('Read `../../references/architecture.md`.');
      }
      if (entry.skills && entry.skills.includes('delegation')) {
        refs.push('Read `../delegation/SKILL.md`.');
      }
      if (entry.agents && entry.agents.length > 0) {
        for (const agent of entry.agents) {
          refs.push(`Read \`../../agents/${agent}.md\`.`);
        }
      }
      if (entry.skills && entry.skills.includes('session-management')) {
        refs.push('Read `../session-management/SKILL.md`.');
      }
      const refsList = refs.join('\n');
      content = content.replace(/\{\{refs_list\}\}/g, refsList);
    }

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
  const runtimeFiles = fs.readdirSync(path.join(SRC, 'runtimes'))
    .filter((f) => f.endsWith('.js') && f !== 'shared.js');

  const runtimes = {};
  for (const file of runtimeFiles) {
    const config = require(path.join(SRC, 'runtimes', file));
    runtimes[config.name] = config;
  }

  const manifestRules = require(path.join(SRC, 'manifest'));
  const manifest = expandManifest(manifestRules, runtimes, SRC);

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

  // ── Generate entry-point files from registry + templates ───────────
  for (const runtimeName of Object.keys(runtimes)) {
    const entryPoints = expandEntryPoints(runtimeName);
    for (const { outputPath, content } of entryPoints) {
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
        console.error(`ERROR processing entry-point -> ${outputPath}: ${err.message}`);
        stats.errors++;
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

    // Also add entry-point output paths
    for (const runtimeName of Object.keys(runtimes)) {
      const entryPoints = expandEntryPoints(runtimeName);
      for (const { outputPath } of entryPoints) {
        manifestPaths.add(outputPath);
      }
    }

    // Generator-owned directories to scan
    const ownedDirs = [
      'agents',
      'claude/agents',
      'plugins/maestro',
      'skills',
      'claude/skills',
      'lib',
      'claude/lib',
      'claude/scripts',
      'templates',
      'claude/templates',
      'references',
      'claude/references',
      'hooks',
      'claude/hooks',
      'mcp',
      'claude/mcp',
      'commands',
      'policies',
    ];

    // Generator-owned root-level files
    const ownedRootFiles = [
      'GEMINI.md',
      'gemini-extension.json',
      '.geminiignore',
      'claude/README.md',
      'claude/.mcp.json',
      'claude/mcp-config.example.json',
    ];

    // Generator-owned directories with filtering for scripts/
    const scriptsDir = path.join(ROOT, 'scripts');
    const ownedScriptFiles = fs.readdirSync(scriptsDir)
      .filter((f) => f.endsWith('.js') && f !== 'generate.js')
      .map((f) => `scripts/${f}`);

    // Also add runtime-specific plugin directories
    ownedDirs.push('claude/.claude-plugin');

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
    for (const f of ownedScriptFiles) {
      allOwnedFiles.push(f);
    }

    const staleFiles = allOwnedFiles.filter((f) => !manifestPaths.has(f));
    if (staleFiles.length > 0) {
      console.log('\nWARNING: Stale files found (not in manifest):');
      for (const f of staleFiles) {
        console.log(`  STALE: ${f}`);
      }
    }
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

module.exports = { expandManifest, expandEntryPoints };
