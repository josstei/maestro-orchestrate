#!/usr/bin/env node
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, resolvePackageRoot, runAsMain } from './lib/cli.js';
import { isStable } from './lib/semver.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = resolvePackageRoot(moduleDirname);
const PRERELEASE_TAGS = new Set(['rc', 'preview', 'nightly']);

type Runner = (command: string, args: string[], options?: any) => Buffer | string;
type Logger = Pick<typeof console, 'log' | 'warn'>;
type PackageMetadata = {
  name: string;
  version: string;
};
type PublishOptions = {
  root?: string;
  execFileSync?: Runner;
  logger?: Logger;
  access?: string;
  tag?: string | null;
};
type ParsedPublishOptions = {
  access: string;
  tag: string | null;
};
type LatestPolicyResult = {
  latest: string | null;
  reason: string;
  status: 'ok' | 'moved' | 'deferred';
  target: string | null;
};

function printHelp() {
  console.log(`Publish a Maestro npm package if the exact version is absent.

Usage:
  node dist/src/tooling/npm-publish-idempotent.js [--tag TAG] [--access public]
`);
}

function parseArgs(argv: string[]): ParsedPublishOptions {
  const options: ParsedPublishOptions = {
    access: 'public',
    tag: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--access') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --access');
      }
      options.access = value;
      index += 1;
      continue;
    }

    if (arg === '--tag') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --tag');
      }
      options.tag = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.access) {
    throw new Error('Missing value for --access');
  }

  if (options.tag === undefined) {
    throw new Error('Missing value for --tag');
  }

  return options;
}

function readPackage(root: string): PackageMetadata {
  const pkg = readJson(path.join(root, 'package.json'));

  if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new Error('package.json missing package name');
  }

  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json missing package version');
  }

  return pkg;
}

function isNpmNotFoundError(error: any): boolean {
  const text = [
    error && error.message,
    error && error.stdout && error.stdout.toString(),
    error && error.stderr && error.stderr.toString(),
  ].filter(Boolean).join('\n');

  return /\bE404\b|404 Not Found|is not in this registry/i.test(text);
}

function isPrereleaseVersion(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+-.+/.test(version);
}

function isStableVersion(version: string): boolean {
  return isStable(version);
}

function compareStableVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function highestStableVersion(versions: string[]): string | null {
  return versions
    .filter(isStableVersion)
    .sort(compareStableVersions)
    .at(-1) || null;
}

function parseDistTagOutput(output: Buffer | string): Record<string, string> {
  const tags: Record<string, string> = {};
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : String(output || '');

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:\s]+):\s*(\S+)\s*$/);
    if (match) {
      const [, name, version] = match;
      if (name && version) {
        tags[name] = version;
      }
    }
  }

  return tags;
}

function parseVersionsOutput(output: Buffer | string): string[] {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : String(output || '');
  const trimmed = text.trim();

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

function packageVersionExists(packageSpec: string, runner: Runner): boolean {
  try {
    const stdout = runner('npm', ['view', packageSpec, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return stdout.toString().trim().length > 0;
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function getDistTags(packageName: string, runner: Runner): Record<string, string> {
  try {
    const stdout = runner('npm', ['dist-tag', 'ls', packageName], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseDistTagOutput(stdout);
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return {};
    }

    throw error;
  }
}

function getPublishedVersions(packageName: string, runner: Runner): string[] {
  try {
    const stdout = runner('npm', ['view', packageName, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseVersionsOutput(stdout);
  } catch (error) {
    if (isNpmNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

function validatePublishTag(pkg: PackageMetadata, tag: string | null | undefined): void {
  const prerelease = isPrereleaseVersion(pkg.version);

  if (prerelease && (!tag || tag === 'latest')) {
    throw new Error(
      `Refusing to publish prerelease ${pkg.name}@${pkg.version} with the latest tag; use rc, preview, or nightly.`
    );
  }

  if (!prerelease && tag && PRERELEASE_TAGS.has(tag)) {
    throw new Error(
      `Refusing to publish stable ${pkg.name}@${pkg.version} with prerelease tag "${tag}".`
    );
  }
}

function ensureLatestTagPolicy(pkg: PackageMetadata, runner: Runner, logger: Logger = console): LatestPolicyResult {
  const tags = getDistTags(pkg.name, runner);
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

    const stableVersion = highestStableVersion(getPublishedVersions(pkg.name, runner));
    if (stableVersion) {
      runner('npm', ['dist-tag', 'add', `${pkg.name}@${stableVersion}`, 'latest'], {
        stdio: 'inherit',
      });
      logger.log(`Moved npm latest dist-tag from ${latest} to stable ${stableVersion}.`);
      return {
        latest,
        reason: `latest pointed to prerelease ${latest}; moved it back to stable ${stableVersion}.`,
        status: 'moved',
        target: stableVersion,
      };
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
    runner('npm', ['dist-tag', 'add', `${pkg.name}@${pkg.version}`, 'latest'], {
      stdio: 'inherit',
    });
    logger.log(`Moved npm latest dist-tag from ${latest || '<unset>'} to stable ${pkg.version}.`);
    return {
      latest,
      reason: `latest pointed to ${latest || '<unset>'}; moved it to stable ${pkg.version}.`,
      status: 'moved',
      target: pkg.version,
    };
  }

  return {
    latest,
    reason: `latest already points to stable version ${pkg.version}.`,
    status: 'ok',
    target: pkg.version,
  };
}

function publishIfNeeded(options: PublishOptions = {}): { latestPolicy: LatestPolicyResult; packageSpec: string; published: boolean } {
  const root = options.root || ROOT;
  const runner = options.execFileSync || execFileSync;
  const logger = options.logger || console;
  const pkg = readPackage(root);
  const packageSpec = `${pkg.name}@${pkg.version}`;
  validatePublishTag(pkg, options.tag);

  if (packageVersionExists(packageSpec, runner)) {
    const latestPolicy = ensureLatestTagPolicy(pkg, runner, logger);
    return {
      latestPolicy,
      packageSpec,
      published: false,
    };
  }

  const publishArgs = ['publish'];
  if (options.tag) {
    publishArgs.push('--tag', options.tag);
  }
  publishArgs.push('--access', options.access || 'public');

  runner('npm', publishArgs, {
    cwd: root,
    stdio: 'inherit',
  });

  const latestPolicy = ensureLatestTagPolicy(pkg, runner, logger);

  return {
    latestPolicy,
    packageSpec,
    published: true,
  };
}

runAsMain(import.meta.url, 'npm publish', () => {
  const options = parseArgs(process.argv.slice(2));
  const result = publishIfNeeded(options);

  if (result.published) {
    console.log(`Published ${result.packageSpec}`);
  } else {
    console.log(`Skipping npm publish; ${result.packageSpec} already exists`);
  }
});

export { ensureLatestTagPolicy, getDistTags, getPublishedVersions, highestStableVersion, isNpmNotFoundError, isPrereleaseVersion, isStableVersion, packageVersionExists, parseDistTagOutput, parseArgs, parseVersionsOutput, publishIfNeeded, readPackage, validatePublishTag };
