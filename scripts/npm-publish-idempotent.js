#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseFlagArgs, runCli } = require('./lib/cli');
const { readJson, requireNonEmpty } = require('./release-artifact-manifest');

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
    defaults: { access: 'public', tag: null },
    flags: { '--access': 'access', '--tag': 'tag' },
    printHelp,
  });

  if (!options.access) {
    throw new Error('Missing value for --access');
  }

  return options;
}

function isNpmNotFoundError(error) {
  // join() decodes the Buffer stdout/stderr that execFileSync attaches.
  const text = [error?.message, error?.stdout, error?.stderr].filter(Boolean).join('\n');
  return /\bE404\b|404 Not Found|is not in this registry/i.test(text);
}

function isPrereleaseVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+-.+/.test(version);
}

function isStableVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
}

// Of two equal versions (2.0.0, 02.0.0) the later entry wins.
function highestStableVersion(versions) {
  return versions.filter(isStableVersion).reduce((highest, version) => {
    if (highest === null) return version;
    const [a, b] = [version, highest].map((stable) => stable.split('.').map(Number));
    return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0 ? version : highest;
  }, null);
}

function parseDistTagOutput(output) {
  const matches = String(output || '').split(/\r?\n/).map((line) => line.match(/^([^:\s]+):\s*(\S+)\s*$/));
  return Object.fromEntries(matches.filter(Boolean).map(([, tag, version]) => [tag, version]));
}

// `npm view --json` prints an array, or a bare string for a single version.
function parseVersionsOutput(output) {
  const text = String(output || '').trim();
  return text ? [JSON.parse(text)].flat() : [];
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

function ensureLatestTagPolicy(pkg, runner, logger) {
  const tags = queryNpm(runner, ['dist-tag', 'ls', pkg.name], parseDistTagOutput, {});
  const latest = tags.latest || null;
  const policy = (status, reason, target = null) => ({ latest, reason, status, target });
  const moveLatest = (target, reason) => {
    runner('npm', ['dist-tag', 'add', `${pkg.name}@${target}`, 'latest'], {
      stdio: 'inherit',
    });
    logger.log(`Moved npm latest dist-tag from ${latest || '<unset>'} to stable ${target}.`);
    return policy('moved', reason, target);
  };

  if (!isPrereleaseVersion(pkg.version)) {
    return latest === pkg.version
      ? policy('ok', `latest already points to stable version ${pkg.version}.`, pkg.version)
      : moveLatest(pkg.version, `latest pointed to ${latest || '<unset>'}; moved it to stable ${pkg.version}.`);
  }

  if (!latest || !isPrereleaseVersion(latest)) {
    return policy('ok', latest ? `latest already points to stable version ${latest}.` : 'latest dist-tag is not set.');
  }

  const stable = highestStableVersion(
    queryNpm(runner, ['view', pkg.name, 'versions', '--json'], parseVersionsOutput, [])
  );
  if (stable) {
    return moveLatest(stable, `latest pointed to prerelease ${latest}; moved it back to stable ${stable}.`);
  }

  const reason = `latest points to prerelease ${latest}, but no stable versions are published; stable release must move latest.`;
  logger.warn(`Warning: ${reason}`);
  return policy('deferred', reason);
}

function publishIfNeeded(options = {}) {
  const root = options.root || ROOT;
  const runner = options.execFileSync || execFileSync;
  const logger = options.logger || console;
  const pkg = readJson(root, 'package.json');
  requireNonEmpty(pkg.name, 'package.json name', 'string');
  requireNonEmpty(pkg.version, 'package.json');
  const packageSpec = `${pkg.name}@${pkg.version}`;
  validatePublishTag(pkg, options.tag);

  const alreadyPublished = queryNpm(
    runner,
    ['view', packageSpec, 'version'],
    (stdout) => stdout.toString().trim().length > 0,
    false
  );

  if (!alreadyPublished) {
    const tagArgs = options.tag ? ['--tag', options.tag] : [];
    runner('npm', ['publish', ...tagArgs, '--access', options.access || 'public'], {
      cwd: root,
      stdio: 'inherit',
    });
  }

  return {
    latestPolicy: ensureLatestTagPolicy(pkg, runner, logger),
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
  highestStableVersion,
  isNpmNotFoundError,
  parseDistTagOutput,
  parseArgs,
  publishIfNeeded,
};
