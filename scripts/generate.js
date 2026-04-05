#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { resolve: resolveTransform } = require('../src/transforms');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diffMode = args.includes('--diff');
const cleanMode = args.includes('--clean');

async function main() {
  const manifest = require(path.join(SRC, 'manifest'));
  const runtimeFiles = fs.readdirSync(path.join(SRC, 'runtimes'))
    .filter((f) => f.endsWith('.js') && f !== 'shared.js');

  const runtimes = {};
  for (const file of runtimeFiles) {
    const config = require(path.join(SRC, 'runtimes', file));
    runtimes[config.name] = config;
  }

  const stats = { written: 0, unchanged: 0, errors: 0 };

  if (cleanMode && !dryRun) {
    for (const entry of manifest) {
      for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
        const absPath = path.join(ROOT, outputPath);
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
          content = fn(content, runtime, { src: entry.src, param });
        }

        const absOutputPath = path.join(ROOT, outputPath);

        if (diffMode) {
          if (!fs.existsSync(absOutputPath)) {
            console.log(`+++ NEW: ${outputPath}`);
          } else {
            const current = fs.readFileSync(absOutputPath, 'utf8');
            if (current !== content) {
              const tmpPath = absOutputPath + '.gen-tmp';
              fs.writeFileSync(tmpPath, content, 'utf8');
              try {
                execSync(`diff -u "${absOutputPath}" "${tmpPath}"`, { encoding: 'utf8' });
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

  if (dryRun) {
    console.log('\n(dry-run — no files written)');
  } else if (!diffMode) {
    console.log(`\nGeneration complete: ${stats.written} written, ${stats.unchanged} unchanged, ${stats.errors} errors`);
  }

  if (stats.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Generator failed:', err.message);
  process.exit(1);
});
