import fs from 'node:fs';
import path from 'node:path';
import * as markdownState from '../../core/markdown-state.js';
import { NotFoundError, ValidationError } from '../../lib/errors/index.js';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PHASE_ID } from '../tool-packs/zod-fragments.js';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const BLUEPRINT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const BLUEPRINT_DIR = path.join(moduleDirname, '..', '..', 'templates', 'session-blueprints');
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
        .array(z.object({
        name: z.string().trim().min(1),
        agent: z.string().trim().min(1),
        parallel: z.boolean().default(false),
        blocked_by: z.array(PHASE_ID).default([]),
    }))
        .min(1)
        .transform((phases) => phases.map((phase, index) => ({
        id: index + 1,
        name: phase.name,
        agent: phase.agent,
        parallel: phase.parallel,
        blocked_by: phase.blocked_by,
    }))),
});
/**
 * Resolve an authored session blueprint file from the installed package payload.
 *
 * @param {string} blueprintId - Authored blueprint identifier.
 * @returns {string} Absolute blueprint markdown path.
 * @throws {NotFoundError} When the id is invalid or no blueprint exists.
 */
function resolveBlueprintPath(blueprintId) {
    if (typeof blueprintId !== 'string' || !BLUEPRINT_ID_PATTERN.test(blueprintId)) {
        throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
    }
    const filePath = path.join(BLUEPRINT_DIR, `${blueprintId}.md`);
    if (!fs.existsSync(filePath)) {
        throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
    }
    return filePath;
}
/**
 * Parse a blueprint markdown file with structured JSON frontmatter.
 *
 * @param {string} filePath - Absolute markdown file path.
 * @returns {object} Parsed blueprint frontmatter.
 * @throws {ValidationError} When the blueprint is malformed.
 */
function parseBlueprint(filePath) {
    try {
        return BLUEPRINT_SCHEMA.parse(markdownState.parse(fs.readFileSync(filePath, 'utf8')).data);
    }
    catch (err) {
        throw new ValidationError(`Invalid session blueprint: ${path.basename(filePath)}`, {
            details: { file: filePath, message: err.message },
        });
    }
}
/**
 * Read and parse all authored session blueprints in deterministic order.
 *
 * @returns {object[]} Parsed blueprint frontmatter objects.
 */
function readBlueprints() {
    return fs
        .readdirSync(BLUEPRINT_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => parseBlueprint(path.join(BLUEPRINT_DIR, entry.name)))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
/**
 * List available session blueprints.
 *
 * @returns {{ blueprints: Array<{ id: string, title: string }> }}
 */
function handleListSessionBlueprints() {
    return {
        blueprints: readBlueprints().map((blueprint) => ({
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
function handleInstantiateSessionBlueprint(params) {
    const blueprint = parseBlueprint(resolveBlueprintPath(params.blueprint_id));
    return {
        task: params.task,
        phases: blueprint.phases,
        design_outline: blueprint.design_outline,
    };
}
export { handleInstantiateSessionBlueprint, handleListSessionBlueprints };
