#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseFlagArgs, runCli } = require('./lib/cli');

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

  if (options.tag === undefined) {
    throw new Error('Missing value for --tag');
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

function isPrereleaseVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+-.+/.test(version);
}

function isStableVersion(version) {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
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

function moveLatest(pkg, runner, logger, latest, target, reason) {
  runner('npm', ['dist-tag', 'add', `${pkg.name}@${target}`, 'latest'], {
    stdio: 'inherit',
  });
  logger.log(`Moved npm latest dist-tag from ${latest || '<unset>'} to stable ${target}.`);
  return {
    latest,
    reason,
    status: 'moved',
    target,
  };
}

function ensureLatestTagPolicy(pkg, runner, logger) {
  const tags = queryNpm(runner, ['dist-tag', 'ls', pkg.name], parseDistTagOutput, {});
  const latest = tags.latest || null;

  if (isPrereleaseVersion(pkg.version)) {
    if (!latest || !isPrereleaseVersion(latest)) {
      return {
        latest,
        reason: latest
          ? `latest already points to stable version ${latest}.`
          : 'latest dist-tag is not set.',
        status: 'ok',
        target: null,
      };
    }

    const stableVersion = highestStableVersion(
      queryNpm(runner, ['view', pkg.name, 'versions', '--json'], parseVersionsOutput, [])
    );
    if (stableVersion) {
      const reason = `latest pointed to prerelease ${latest}; moved it back to stable ${stableVersion}.`;
      return moveLatest(pkg, runner, logger, latest, stableVersion, reason);
    }

    const reason = `latest points to prerelease ${latest}, but no stable versions are published; stable release must move latest.`;
    logger.warn(`Warning: ${reason}`);
    return {
      latest,
      reason,
      status: 'deferred',
      target: null,
    };
  }

  if (latest !== pkg.version) {
    const reason = `latest pointed to ${latest || '<unset>'}; moved it to stable ${pkg.version}.`;
    return moveLatest(pkg, runner, logger, latest, pkg.version, reason);
  }

  return {
    latest,
    reason: `latest already points to stable version ${pkg.version}.`,
    status: 'ok',
    target: pkg.version,
  };
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
