#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseFlagArgs, runCli } = require('./lib/cli');
const { isPrereleaseVersion, isStableVersion } = require('./lib/release');

const ROOT = path.resolve(__dirname, '..');
const PRERELEASE_TAGS = new Set(['rc', 'preview', 'nightly']);

function printHelp() {
  console.log(`Publish a Maestro npm package if the exact version is absent.

Usage:
  node scripts/npm-publish-idempotent.js [--tag TAG] [--access public]
`);
}

function parseArgs(argv) {
  const options = parseFlagArgs(argv, {
    flags: { '--access': 'access', '--tag': 'tag' },
    printHelp,
  });

  // Without this, `--access ''` would silently publish with the default access.
  if (options.access === '') {
    throw new Error('Missing value for --access');
  }

  return options;
}

function readPackage(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new Error('package.json missing package name');
  }

  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json missing package version');
  }

  return pkg;
}

function isNpmNotFoundError(error) {
  const text = [
    error && error.message,
    error && error.stdout && error.stdout.toString(),
    error && error.stderr && error.stderr.toString(),
  ].filter(Boolean).join('\n');

  return /\bE404\b|404 Not Found|is not in this registry/i.test(text);
}

function compareStableVersions(left, right) {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function highestStableVersion(versions) {
  return versions
    .filter(isStableVersion)
    .sort(compareStableVersions)
    .at(-1) || null;
}

function parseDistTagOutput(output) {
  const tags = {};
  const text = String(output || '');

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:\s]+):\s*(\S+)\s*$/);
    if (match) {
      tags[match[1]] = match[2];
    }
  }

  return tags;
}

function parseVersionsOutput(output) {
  const trimmed = String(output || '').trim();

  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof parsed === 'string') {
    return [parsed];
  }

  return [];
}

function queryNpm(runner, args, parse, notFoundValue) {
  try {
    return parse(runner('npm', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return notFoundValue;
    }

    throw error;
  }
}

function validatePublishTag(pkg, tag) {
  const prerelease = isPrereleaseVersion(pkg.version);

  if (prerelease && (!tag || tag === 'latest')) {
    throw new Error(
      `Refusing to publish prerelease ${pkg.name}@${pkg.version} with the latest tag; use rc, preview, or nightly.`
    );
  }

  if (!prerelease && PRERELEASE_TAGS.has(tag)) {
    throw new Error(
      `Refusing to publish stable ${pkg.name}@${pkg.version} with prerelease tag "${tag}".`
    );
  }
}

function moveLatest(pkg, runner, logger, latest, target) {
  runner('npm', ['dist-tag', 'add', `${pkg.name}@${target}`, 'latest'], {
    stdio: 'inherit',
  });
  logger.log(`Moved npm latest dist-tag from ${latest || '<unset>'} to stable ${target}.`);
}

/**
 * Keeps npm's latest dist-tag on a stable version. A stable publish moves
 * latest to itself. A prerelease publish never takes latest, but moves it back
 * to the highest stable version if an earlier prerelease holds it, or warns
 * when no stable version exists yet. Latest is never removed.
 */
function ensureLatestTagPolicy(pkg, runner, logger) {
  const latest = queryNpm(runner, ['dist-tag', 'ls', pkg.name], parseDistTagOutput, {}).latest || null;

  if (!isPrereleaseVersion(pkg.version)) {
    if (latest !== pkg.version) {
      moveLatest(pkg, runner, logger, latest, pkg.version);
    }
    return;
  }

  if (!latest || !isPrereleaseVersion(latest)) {
    return;
  }

  const stableVersion = highestStableVersion(
    queryNpm(runner, ['view', pkg.name, 'versions', '--json'], parseVersionsOutput, [])
  );
  if (stableVersion) {
    moveLatest(pkg, runner, logger, latest, stableVersion);
  } else {
    logger.warn(
      `Warning: latest points to prerelease ${latest}, but no stable versions are published; stable release must move latest.`
    );
  }
}

function publishIfNeeded(options = {}) {
  const root = options.root || ROOT;
  const runner = options.execFileSync || execFileSync;
  const logger = options.logger || console;
  const pkg = readPackage(root);
  const packageSpec = `${pkg.name}@${pkg.version}`;
  validatePublishTag(pkg, options.tag);

  const alreadyPublished = queryNpm(
    runner,
    ['view', packageSpec, 'version'],
    (stdout) => stdout.toString().trim().length > 0,
    false
  );

  if (!alreadyPublished) {
    const publishArgs = ['publish'];
    if (options.tag) {
      publishArgs.push('--tag', options.tag);
    }
    publishArgs.push('--access', options.access || 'public');

    runner('npm', publishArgs, {
      cwd: root,
      stdio: 'inherit',
    });
  }

  ensureLatestTagPolicy(pkg, runner, logger);

  return {
    packageSpec,
    published: !alreadyPublished,
  };
}

if (require.main === module) {
  runCli('npm publish failed', () => {
    const result = publishIfNeeded(parseArgs(process.argv.slice(2)));

    if (result.published) {
      console.log(`Published ${result.packageSpec}`);
    } else {
      console.log(`Skipping npm publish; ${result.packageSpec} already exists`);
    }
  });
}

module.exports = {
  parseArgs,
  publishIfNeeded,
};
