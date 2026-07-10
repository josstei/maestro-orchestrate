import fs from 'node:fs';
import path from 'node:path';
import * as markdownState from '../../core/markdown-state.js';
import { moduleDirname } from '../../core/module-path.js';
import { NotFoundError, ValidationError } from '../../lib/errors/index.js';
import { z } from 'zod';
import {
  hasRuntimeContentRegistry,
  listBlueprintsFromRegistry,
  readBlueprintFromRegistry,
} from '../content/runtime-content.js';
import { PHASE_ID } from '../tool-packs/zod-fragments.js';
const BLUEPRINT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const RUNTIME_SRC_ROOT = path.join(moduleDirname(import.meta.url), '..', '..');

function sourceCheckoutRoot(runtimeSrcRoot: any) {
  return path.resolve(runtimeSrcRoot, '..', '..');
}

function blueprintDirs(runtimeSrcRoot: any): [string, string] {
  return [
    path.join(runtimeSrcRoot, 'templates', 'session-blueprints'),
    path.join(sourceCheckoutRoot(runtimeSrcRoot), 'src', 'templates', 'session-blueprints'),
  ];
}

function resolveBlueprintDir(runtimeSrcRoot: any) {
  const [runtimeBlueprintDir, sourceBlueprintDir] = blueprintDirs(runtimeSrcRoot);
  return [runtimeBlueprintDir, sourceBlueprintDir].find((dir) => fs.existsSync(dir)) || runtimeBlueprintDir;
}

/**
 * Shape contract for an authored session blueprint's frontmatter. Parsing
 * validates and transforms in one pass: each authored phase is normalized
 * into the exact create_session phase-item shape with a 1-based id, and
 * unknown keys are stripped (zod default) so the output carries exactly
 * the five phase-item fields.
 */
const BLUEPRINT_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  design_outline: z.string().default(''),
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        agent: z.string().trim().min(1),
        parallel: z.boolean().default(false),
        blocked_by: z.array(PHASE_ID).default([]),
      })
    )
    .min(1)
    .transform((phases: any) =>
      phases.map((phase: any, index: any) => ({
        id: index + 1,
        name: phase.name,
        agent: phase.agent,
        parallel: phase.parallel,
        blocked_by: phase.blocked_by,
      }))
    ),
});

/**
 * Resolve an authored session blueprint from the installed package payload.
 *
 * @param {string} blueprintId - Authored blueprint identifier.
 * @returns {{ content: string, path: string }} Blueprint markdown content and source path.
 * @throws {NotFoundError} When the id is invalid or no blueprint exists.
 */
function resolveBlueprintSource(blueprintId: any, runtimeSrcRoot: any = RUNTIME_SRC_ROOT) {
  if (typeof blueprintId !== 'string' || !BLUEPRINT_ID_PATTERN.test(blueprintId)) {
    throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
  }

  if (hasRuntimeContentRegistry(runtimeSrcRoot)) {
    const blueprint = readBlueprintFromRegistry(blueprintId, runtimeSrcRoot);
    if (!blueprint) {
      throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
    }

    return blueprint;
  }

  const BLUEPRINT_DIR = resolveBlueprintDir(runtimeSrcRoot);
  const filePath = path.join(BLUEPRINT_DIR, `${blueprintId}.md`);
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
  }

  return {
    content: fs.readFileSync(filePath, 'utf8'),
    path: filePath,
  };
}

/**
 * Parse a blueprint markdown source with structured JSON frontmatter.
 *
 * @param {{ content: string, path: string }} source - Blueprint markdown content and source path.
 * @returns {object} Parsed blueprint frontmatter.
 * @throws {ValidationError} When the blueprint is malformed.
 */
function parseBlueprint(source: any) {
  try {
    return BLUEPRINT_SCHEMA.parse(markdownState.parse(source.content).data);
  } catch (err: any) {
    throw new ValidationError(`Invalid session blueprint: ${path.basename(source.path)}`, {
      details: { file: source.path, message: err.message },
    });
  }
}

/**
 * Read and parse all authored session blueprints in deterministic order.
 *
 * @returns {object[]} Parsed blueprint frontmatter objects.
 */
function readBlueprints(runtimeSrcRoot: any = RUNTIME_SRC_ROOT) {
  if (hasRuntimeContentRegistry(runtimeSrcRoot)) {
    return listBlueprintsFromRegistry(runtimeSrcRoot)
      .map((blueprint: any) => parseBlueprint(blueprint))
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
  }

  const BLUEPRINT_DIR = resolveBlueprintDir(runtimeSrcRoot);
  return fs
    .readdirSync(BLUEPRINT_DIR, { withFileTypes: true })
    .filter((entry: any) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry: any) =>
      parseBlueprint({
        content: fs.readFileSync(path.join(BLUEPRINT_DIR, entry.name), 'utf8'),
        path: path.join(BLUEPRINT_DIR, entry.name),
      })
    )
    .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
}

/**
 * List available session blueprints.
 *
 * @returns {{ blueprints: Array<{ id: string, title: string }> }}
 */
function handleListSessionBlueprints(options: any = {}) {
  const runtimeSrcRoot = options.runtimeSrcRoot || RUNTIME_SRC_ROOT;
  return {
    blueprints: readBlueprints(runtimeSrcRoot).map((blueprint: any) => ({
      id: blueprint.id,
      title: blueprint.title,
    })),
  };
}

/**
 * Instantiate a session blueprint into create_session-compatible phases.
 *
 * @param {{ blueprint_id: string, task: string }} params - Blueprint id and concrete task.
 * @returns {{ task: string, phases: Array<object>, design_outline: string }}
 * @throws {NotFoundError} When the blueprint id is unknown.
 * @throws {ValidationError} When the blueprint frontmatter fails the blueprint schema.
 */
function handleInstantiateSessionBlueprint(params: any, options: any = {}) {
  const runtimeSrcRoot = options.runtimeSrcRoot || RUNTIME_SRC_ROOT;
  const blueprint = parseBlueprint(resolveBlueprintSource(params.blueprint_id, runtimeSrcRoot));

  return {
    task: params.task,
    phases: blueprint.phases,
    design_outline: blueprint.design_outline,
  };
}

export { handleInstantiateSessionBlueprint, handleListSessionBlueprints };
