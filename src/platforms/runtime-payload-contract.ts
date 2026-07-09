import { PACKAGE_MCP_SERVER, RUNTIME_CONTENT_ROOT, listRuntimeDeclarations } from './runtime-declarations.js';

const TOPOLOGY_DECISION = Object.freeze({
  id: 'option-2-source-only-generated-dist',
  date: '2026-07-09',
  mode: 'source-only-generated-dist',
  canonicalSource: 'src/**/*.ts plus canonical runtime Markdown/templates under src/',
  runtimeFormat: 'NodeNext ESM JavaScript generated under dist/src/ by npm run build',
  note:
    'The development branch does not track dist/src. Runtime bins, public MCP wrappers, package, and release artifacts execute generated dist/src output; package and release artifacts ship dist/src runtime entries plus a generated runtime content registry, not package-root raw src.',
});

const RUNTIME_PAYLOAD_CONTRACT = Object.freeze(
  listRuntimeDeclarations().map((runtime) => ({
    name: runtime.name,
    startup: {
      manifest: runtime.payload.startupManifest,
      ...PACKAGE_MCP_SERVER,
    },
    content: RUNTIME_CONTENT_ROOT,
    generatedSurfaces: runtime.payload.generatedSurfaces,
    packageInvariants: runtime.payload.packageInvariants,
    docs: runtime.payload.docs,
  }))
);

function getRuntimePayloadContract(runtimeName: string) {
  return RUNTIME_PAYLOAD_CONTRACT.find((runtime) => runtime.name === runtimeName) || null;
}

export { RUNTIME_PAYLOAD_CONTRACT, TOPOLOGY_DECISION, getRuntimePayloadContract };
