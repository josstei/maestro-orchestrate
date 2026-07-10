import {
  PACKAGE_MCP_SERVER,
  RUNTIME_CONTENT_ROOT,
  listRuntimeDefinitions,
} from '../platforms/runtime-declarations.js';
import type { RuntimeDefinition } from '../platforms/runtime-declarations.js';
import {
  RUNTIME_PACKAGE_INVARIANTS,
  npmFiles,
  releasePaths,
} from './artifact-policy.js';

const TOPOLOGY_DECISION = Object.freeze({
  id: 'option-2-source-only-generated-dist',
  date: '2026-07-09',
  mode: 'source-only-generated-dist',
  canonicalSource: 'src/**/*.ts plus canonical runtime Markdown/templates under src/',
  runtimeFormat: 'NodeNext ESM JavaScript generated under dist/src/ by npm run build',
  note:
    'The development branch does not track dist/src. Runtime bins, public MCP wrappers, package, and release artifacts execute generated dist/src output; package and release artifacts ship dist/src runtime entries plus a generated runtime content registry, not package-root raw src.',
});

type RuntimeInvariantMap = Readonly<Record<string, readonly string[]>>;

interface RuntimePayloadContractInputs {
  readonly definitions?: readonly RuntimeDefinition[];
  readonly invariants?: RuntimeInvariantMap;
  readonly npmProjection?: readonly string[];
  readonly releaseProjection?: readonly string[];
}

const RUNTIME_PAYLOAD_CONTRACT = Object.freeze(
  listRuntimeDefinitions().map((definition) => Object.freeze({
    name: definition.name,
    startup: Object.freeze({
      manifest: definition.payload.startupManifest,
      ...PACKAGE_MCP_SERVER,
    }),
    content: RUNTIME_CONTENT_ROOT,
    generatedSurfaces: definition.payload.generatedSurfaces,
    packageInvariants: RUNTIME_PACKAGE_INVARIANTS[definition.name],
    docs: definition.payload.docs,
  }))
);

function getRuntimePayloadContract(runtimeName: string) {
  return RUNTIME_PAYLOAD_CONTRACT.find((runtime) => runtime.name === runtimeName) || null;
}

function normalizeContractPath(contractPath: string): string {
  return contractPath.replace(/\/$/, '');
}

function projectionCoversPath(projection: readonly string[], contractPath: string): boolean {
  const normalized = normalizeContractPath(contractPath);
  return projection.some((entry) => {
    const allowed = normalizeContractPath(entry);
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

function runtimePayloadContractIssues(inputs: RuntimePayloadContractInputs = {}): readonly string[] {
  const definitions = inputs.definitions || listRuntimeDefinitions();
  const invariants = inputs.invariants || RUNTIME_PACKAGE_INVARIANTS;
  const npmProjection = inputs.npmProjection || npmFiles();
  const releaseProjection = inputs.releaseProjection || releasePaths();
  const issues: string[] = [];
  const runtimeNames = new Set(definitions.map((definition) => definition.name));

  for (const definition of definitions) {
    const runtimeInvariants = invariants[definition.name];
    if (!runtimeInvariants) {
      issues.push(`${definition.name}: missing independently authored package invariants`);
      continue;
    }

    if (!runtimeInvariants.includes(definition.payload.startupManifest)) {
      issues.push(`${definition.name}: startup manifest is absent from package invariants`);
    }

    for (const invariant of runtimeInvariants) {
      if (!projectionCoversPath(npmProjection, invariant)) {
        issues.push(`${definition.name}: package invariant is absent from npm projection: ${invariant}`);
      }
    }

    for (const surface of definition.payload.generatedSurfaces) {
      if (!projectionCoversPath(releaseProjection, surface)) {
        issues.push(`${definition.name}: generated surface is absent from release projection: ${surface}`);
      }
    }

    for (const docPath of definition.payload.docs) {
      if (!projectionCoversPath(releaseProjection, docPath)) {
        issues.push(`${definition.name}: runtime doc is absent from release projection: ${docPath}`);
      }
    }
  }

  for (const runtimeName of Object.keys(invariants)) {
    if (!runtimeNames.has(runtimeName as RuntimeDefinition['name'])) {
      issues.push(`${runtimeName}: package invariants have no runtime definition`);
    }
  }

  return Object.freeze(issues);
}

function assertRuntimePayloadContract(inputs: RuntimePayloadContractInputs = {}): void {
  const issues = runtimePayloadContractIssues(inputs);
  if (issues.length > 0) {
    throw new Error(`Runtime payload contract disagreements:\n- ${issues.join('\n- ')}`);
  }
}

export {
  RUNTIME_PAYLOAD_CONTRACT,
  TOPOLOGY_DECISION,
  assertRuntimePayloadContract,
  getRuntimePayloadContract,
  runtimePayloadContractIssues,
};
export type { RuntimePayloadContractInputs };
