import fs from 'fs';
import path from 'path';
import * as markdownState from '../../core/markdown-state.js';
import { atomicWriteSync } from '../../lib/io/index.js';
import { normalizeUniqueStringList } from '../../lib/validation/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

const PROFILE_SCHEMA_VERSION = 1;
const PROFILE_BODY = '# Project Memory Profile\n';

const PROFILE_ARRAY_FIELDS = Object.freeze([
  'build_commands',
  'test_commands',
  'lint_commands',
  'conventions',
  'do_not_touch',
  'preferred_agents',
  'blocked_agents',
]);

type StoreClock = { now: () => Date };

function createSystemClock() {
  return { now: () => new Date() };
}

function profilePath(projectRoot: any) {
  return path.join(resolveStateDirPath(projectRoot), 'memory', 'project-profile.md');
}

function emptyProfile() {
  const profile: Record<string, any> = { schema_version: PROFILE_SCHEMA_VERSION };
  for (const field of PROFILE_ARRAY_FIELDS) {
    profile[field] = [];
  }
  profile.updated = null;
  return profile;
}

function foldCommands(existing: any, incoming: any) {
  const incomingClean = normalizeUniqueStringList(incoming);
  const incomingSet = new Set(incomingClean);
  const retained = normalizeUniqueStringList(existing).filter(
    (command: any) => !incomingSet.has(command)
  );
  return [...incomingClean, ...retained];
}

function mergeValidationCommands(profile: any, incoming: any) {
  const base = profile && typeof profile === 'object' ? profile : {};
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    ...base,
    build_commands: foldCommands(base.build_commands, source.build),
    test_commands: foldCommands(base.test_commands, source.test),
    lint_commands: foldCommands(base.lint_commands, source.lint),
    updated: new Date().toISOString(),
  };
}

function readProfile(projectRoot: any) {
  let content;
  try {
    content = fs.readFileSync(profilePath(projectRoot), 'utf8');
  } catch {
    return emptyProfile();
  }
  let data;
  try {
    data = markdownState.parse(content).data;
  } catch {
    return emptyProfile();
  }
  const profile = emptyProfile();
  profile.schema_version = PROFILE_SCHEMA_VERSION;
  for (const field of PROFILE_ARRAY_FIELDS) {
    profile[field] = normalizeUniqueStringList(data[field]);
  }
  profile.updated = typeof data.updated === 'string' ? data.updated : null;
  return profile;
}

function writeProfile(
  projectRoot: any,
  profile: any,
  { clock = createSystemClock() }: { clock?: StoreClock } = {}
) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const next: Record<string, any> = { schema_version: PROFILE_SCHEMA_VERSION };
  for (const field of PROFILE_ARRAY_FIELDS) {
    next[field] = normalizeUniqueStringList(source[field]);
  }
  next.updated = clock.now().toISOString();
  atomicWriteSync(profilePath(projectRoot), markdownState.serialize(next, PROFILE_BODY));
  return next;
}

export {
  PROFILE_ARRAY_FIELDS,
  PROFILE_SCHEMA_VERSION,
  emptyProfile,
  mergeValidationCommands,
  readProfile,
  writeProfile,
};
