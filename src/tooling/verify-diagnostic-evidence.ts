import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  AgentDispatchRecordSchema,
  ArtifactManifestSchema,
  CodeReviewOutcomeSchema,
  DelegationOutcomeSchema,
  EvidenceManifestSchema,
  McpCallRecordSchema,
  OrchestrationOutcomeSchema,
  ProductionReadinessSchema,
  TimelineSchema,
} from './diagnostics/evidence-schema.js';

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  evidence_dir: string;
}

const REQUIRED_FILES = [
  'manifest.json',
  'environment.json',
  'timeline.json',
  'mcp-calls.redacted.jsonl',
  'agent-dispatches.redacted.jsonl',
  'orchestration-outcome.json',
  'artifact-manifest.json',
  'delegation-outcome.json',
  'code-review-outcome.json',
  'validation-output.txt',
  'production-readiness.json',
  'run-summary.md',
] as const;

const PLACEHOLDER_HASHES = [
  /^a1b2c3d4e5f6/i,
  /^c1d2e3f4a5b6/i,
  /^0123456789abcdef/i,
  /^1234567890abcdef/i,
];

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveGitRoot(startPath: string): string {
  for (const candidate of [startPath, process.cwd()]) {
    try {
      return runGit(candidate, ['rev-parse', '--show-toplevel']);
    } catch {}
  }
  throw new Error(`Unable to resolve a Git repository root from '${startPath}' or the current working directory`);
}

function resolveBranchRef(root: string, branch: string): string | null {
  for (const candidate of [branch, `refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    try {
      runGit(root, ['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {}
  }
  return null;
}

function isPlaceholderHash(value: string): boolean {
  return PLACEHOLDER_HASHES.some((pattern) => pattern.test(value));
}

function safeEvidencePath(evidenceDir: string, relativePath: string): string | null {
  const resolved = path.resolve(evidenceDir, relativePath);
  const relative = path.relative(evidenceDir, resolved);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved;
}

function parseJson<T>(filePath: string, parser: { parse(value: unknown): T }, label: string, errors: string[]): T | null {
  try {
    return parser.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error: any) {
    errors.push(`${label} validation error: ${error?.message || String(error)}`);
    return null;
  }
}

function parseJsonl<T>(filePath: string, parser: { parse(value: unknown): T }, label: string, errors: string[]): T[] {
  const records: T[] = [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((line) => line.trim());
  lines.forEach((line, index) => {
    try {
      records.push(parser.parse(JSON.parse(line)));
    } catch (error: any) {
      errors.push(`${label} line ${index + 1} validation error: ${error?.message || String(error)}`);
    }
  });
  return records;
}

function verifyReadiness(
  readiness: any,
  inventory: Map<string, any>,
  productionReady: boolean,
  errors: string[],
): void {
  if (productionReady !== readiness.production_ready) {
    errors.push('Manifest production_ready outcome disagrees with production-readiness.json');
  }
  if (!readiness.production_ready) return;

  const checks = [
    ['html_validation', readiness.html_validation],
    ['accessibility', readiness.accessibility],
    ['responsive_viewports', readiness.responsive_viewports],
    ['console_check', readiness.console_check],
    ['link_check', readiness.link_check],
  ] as const;
  for (const [name, check] of checks) {
    if (check.status !== 'passed' || !check.tool || !check.version || !check.output_file) {
      errors.push(`Production-readiness check '${name}' is not backed by an inventoried tool output`);
      continue;
    }
    if (!inventory.has(check.output_file)) {
      errors.push(`Production-readiness output '${check.output_file}' is not listed in the evidence inventory`);
    }
  }
  if (!readiness.code_review_passed || readiness.unresolved_blocking_findings !== 0) {
    errors.push('production_ready=true requires a passing review and zero unresolved blocking findings');
  }
  if (readiness.console_check.error_count !== 0) {
    errors.push('production_ready=true requires zero browser-console errors');
  }
  if (readiness.link_check.broken_count !== 0) {
    errors.push('production_ready=true requires zero broken links');
  }
}

export function verifyDiagnosticEvidence(
  evidenceDir: string,
  projectRoot?: string,
): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const absDir = path.resolve(evidenceDir);

  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return {
      valid: false,
      errors: [`Evidence directory '${evidenceDir}' does not exist or is not a directory`],
      warnings,
      evidence_dir: evidenceDir,
    };
  }

  for (const filename of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(absDir, filename))) {
      errors.push(`Missing required evidence file: '${filename}'`);
    }
  }
  if (errors.length > 0) return { valid: false, errors, warnings, evidence_dir: absDir };

  const manifest = parseJson(
    path.join(absDir, 'manifest.json'),
    EvidenceManifestSchema,
    'manifest.json',
    errors,
  );
  if (!manifest) return { valid: false, errors, warnings, evidence_dir: absDir };

  let gitRoot: string | null = null;
  try {
    gitRoot = resolveGitRoot(projectRoot ? path.resolve(projectRoot) : absDir);
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  if (gitRoot) {
    try {
      runGit(gitRoot, ['cat-file', '-e', `${manifest.repository.commit_sha}^{commit}`]);
    } catch {
      errors.push(`Commit SHA '${manifest.repository.commit_sha}' does not exist in repository history`);
    }
    const branchRef = resolveBranchRef(gitRoot, manifest.repository.branch);
    if (!branchRef) {
      errors.push(`Declared branch '${manifest.repository.branch}' is not available as a local or origin-tracking ref`);
    } else {
      try {
        runGit(gitRoot, ['merge-base', '--is-ancestor', manifest.repository.commit_sha, branchRef]);
      } catch {
        errors.push(
          `Commit SHA '${manifest.repository.commit_sha}' is not reachable from declared branch '${manifest.repository.branch}'`,
        );
      }
    }
  }

  const runSuffix = manifest.run_id.split('-').at(-1);
  if (runSuffix && !manifest.repository.commit_sha.startsWith(runSuffix)) {
    errors.push(`Run ID suffix '${runSuffix}' does not match evaluated commit SHA`);
  }

  const inventory = new Map<string, any>();
  for (const entry of manifest.evidence_files) {
    if (inventory.has(entry.path)) {
      errors.push(`Duplicate evidence inventory entry: '${entry.path}'`);
      continue;
    }
    inventory.set(entry.path, entry);
    const filePath = safeEvidencePath(absDir, entry.path);
    if (!filePath) {
      errors.push(`Evidence inventory path escapes evidence directory: '${entry.path}'`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      errors.push(`Manifest listed file '${entry.path}' is missing`);
      continue;
    }
    const stats = fs.statSync(filePath);
    if (stats.size !== entry.bytes) {
      errors.push(`Byte-size mismatch for '${entry.path}': expected ${entry.bytes}, got ${stats.size}`);
    }
    const actualHash = sha256(filePath);
    if (actualHash !== entry.sha256) {
      errors.push(`Hash mismatch for '${entry.path}': expected ${entry.sha256}, got ${actualHash}`);
    }
    if (isPlaceholderHash(entry.sha256)) {
      errors.push(`Evidence inventory contains a placeholder hash for '${entry.path}'`);
    }
  }
  for (const filename of REQUIRED_FILES.filter((name) => name !== 'manifest.json')) {
    if (!inventory.has(filename)) errors.push(`Required evidence file '${filename}' is absent from the manifest inventory`);
  }

  const timeline = parseJson(path.join(absDir, 'timeline.json'), TimelineSchema, 'timeline.json', errors) || [];
  const orchestration = parseJson(
    path.join(absDir, 'orchestration-outcome.json'),
    OrchestrationOutcomeSchema,
    'orchestration-outcome.json',
    errors,
  );
  const artifacts = parseJson(
    path.join(absDir, 'artifact-manifest.json'),
    ArtifactManifestSchema,
    'artifact-manifest.json',
    errors,
  );
  const delegation = parseJson(
    path.join(absDir, 'delegation-outcome.json'),
    DelegationOutcomeSchema,
    'delegation-outcome.json',
    errors,
  );
  const review = parseJson(
    path.join(absDir, 'code-review-outcome.json'),
    CodeReviewOutcomeSchema,
    'code-review-outcome.json',
    errors,
  );
  const readiness = parseJson(
    path.join(absDir, 'production-readiness.json'),
    ProductionReadinessSchema,
    'production-readiness.json',
    errors,
  );
  const mcpCalls = parseJsonl(
    path.join(absDir, 'mcp-calls.redacted.jsonl'),
    McpCallRecordSchema,
    'mcp-calls.redacted.jsonl',
    errors,
  );
  const dispatches = parseJsonl(
    path.join(absDir, 'agent-dispatches.redacted.jsonl'),
    AgentDispatchRecordSchema,
    'agent-dispatches.redacted.jsonl',
    errors,
  );

  const startMs = Date.parse(manifest.timestamps.start);
  const endMs = Date.parse(manifest.timestamps.end);
  if (endMs - startMs !== manifest.timestamps.wall_duration_ms) {
    errors.push('Manifest wall_duration_ms does not equal end minus start timestamps');
  }

  const callIds = new Set(mcpCalls.map((record) => record.call_id));
  const dispatchIds = new Set(dispatches.map((record) => record.dispatch_id));
  for (const event of timeline) {
    const wallOffset = Date.parse(event.timestamp) - startMs;
    if (Math.abs(wallOffset - event.offset_ms) > 1000) {
      errors.push(`Timeline event '${event.operation}' offset_ms does not match its wall timestamp`);
    }
    for (const id of event.linked_mcp_call_ids) {
      if (!callIds.has(id)) errors.push(`Timeline references uncaptured MCP call ID '${id}'`);
    }
    for (const id of event.linked_dispatch_ids) {
      if (!dispatchIds.has(id)) errors.push(`Timeline references uncaptured dispatch ID '${id}'`);
    }
  }

  const toolNames = new Set(mcpCalls.filter((call) => call.status === 'success').map((call) => call.tool_name));
  if (orchestration) {
    const requiredTools = [
      ['workspace_initialized', 'initialize_workspace'],
      ['session_created', 'create_session'],
      ['transition_completed', 'transition_phase'],
    ] as const;
    for (const [field, tool] of requiredTools) {
      if (orchestration[field] && !toolNames.has(tool)) {
        errors.push(`MCP trace missing '${tool}' required by orchestration outcome`);
      }
    }
    if (orchestration.code_review_status === 'passed' && !toolNames.has('record_code_review')) {
      errors.push("MCP trace missing 'record_code_review' required by passing review outcome");
    }
    if (orchestration.archive_status === 'archived' && !toolNames.has('archive_session')) {
      errors.push("MCP trace missing 'archive_session' required by archived outcome");
    }
  }

  for (const dispatch of dispatches) {
    if (dispatch.runtime !== manifest.runtime.name || dispatch.model !== manifest.runtime.model) {
      errors.push(`Dispatch '${dispatch.dispatch_id}' runtime/model does not match manifest runtime/model`);
    }
    if (dispatch.end_offset_ms < dispatch.start_offset_ms) {
      errors.push(`Dispatch '${dispatch.dispatch_id}' has a negative duration`);
    }
    if (dispatch.response_sha256 && isPlaceholderHash(dispatch.response_sha256)) {
      errors.push(`Dispatch '${dispatch.dispatch_id}' contains a placeholder response hash`);
    }
    if (!dispatch.output_retained) {
      warnings.push(`Dispatch '${dispatch.dispatch_id}' output was not retained; its response hash is provenance-only`);
    } else if (!dispatch.output_file || !inventory.has(dispatch.output_file)) {
      errors.push(`Dispatch '${dispatch.dispatch_id}' retained output is not inventoried`);
    }
  }

  if (manifest.outcome.delegation_successful && delegation) {
    const implementationDispatch = dispatches.find(
      (dispatch) => dispatch.agent === delegation.assigned_agent && dispatch.status === 'success',
    );
    if (!implementationDispatch) {
      errors.push('delegation_successful=true but no successful assigned-agent dispatch was captured');
    } else {
      if (!delegation.dispatch_ids.includes(implementationDispatch.dispatch_id)) {
        errors.push('Delegation outcome does not reference the captured implementation dispatch');
      }
      if (delegation.response_sha256 !== implementationDispatch.response_sha256) {
        errors.push('Delegation response hash does not match captured implementation dispatch');
      }
    }
  }

  if (manifest.outcome.code_review_passed && review) {
    const reviewDispatch = dispatches.find(
      (dispatch) => dispatch.dispatch_id === review.dispatch_id && dispatch.status === 'success',
    );
    if (!reviewDispatch) {
      errors.push('code_review_passed=true but no successful reviewer dispatch was captured');
    } else if (review.review_output_hash !== reviewDispatch.response_sha256) {
      errors.push('Review output hash does not match captured reviewer dispatch');
    }
  }

  const transitionedFiles = new Set<string>();
  for (const call of mcpCalls.filter((record) => record.tool_name === 'transition_phase')) {
    for (const key of ['files_created', 'files_modified', 'files_deleted']) {
      const values = (call.request_summary as Record<string, unknown>)[key];
      if (Array.isArray(values)) values.forEach((value) => transitionedFiles.add(String(value)));
    }
  }
  const artifactPaths = new Set((artifacts?.files || []).map((file: any) => file.relative_path));
  for (const file of transitionedFiles) {
    if (!artifactPaths.has(file)) errors.push(`Transitioned file '${file}' is missing from artifact manifest`);
  }
  for (const file of artifacts?.files || []) {
    if (!file.content_available) {
      warnings.push(`Artifact '${file.relative_path}' content was not retained; its hash is a recorded runtime value`);
    }
  }

  const validationText = fs.readFileSync(path.join(absDir, 'validation-output.txt'), 'utf8');
  const tests = [...validationText.matchAll(/ℹ tests (\d+)/g)].at(-1);
  const pass = [...validationText.matchAll(/ℹ pass (\d+)/g)].at(-1);
  const fail = [...validationText.matchAll(/ℹ fail (\d+)/g)].at(-1);
  if (manifest.outcome.overall) {
    if (!tests || !pass || !fail) errors.push('validation-output.txt does not contain complete Node test totals');
    if (tests && pass && tests[1] !== pass[1]) errors.push('validation-output.txt test and pass totals differ');
    if (fail && Number(fail[1]) !== 0) errors.push(`validation-output.txt reports ${fail[1]} failing tests`);
    if (!validationText.includes('check:source')) errors.push('validation-output.txt does not capture npm run check:source');
    if (!validationText.includes('check:release')) errors.push('validation-output.txt does not capture npm run check:release');
  }

  if (readiness) verifyReadiness(readiness, inventory, manifest.outcome.production_ready, errors);

  for (const filename of REQUIRED_FILES) {
    const text = fs.readFileSync(path.join(absDir, filename), 'utf8');
    if (/\/(?:home|Users)\/[A-Za-z0-9_-]+/.test(text)) {
      errors.push(`Unredacted home-directory path found in '${filename}'`);
    }
    if (/gh[pousr]_[A-Za-z0-9]{36}/.test(text) || /sk-[A-Za-z0-9]{32,}/.test(text)) {
      errors.push(`Unredacted secret token pattern found in '${filename}'`);
    }
  }

  if (manifest.report_path && gitRoot) {
    const reportPath = path.resolve(gitRoot, manifest.report_path);
    const relative = path.relative(gitRoot, reportPath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(reportPath)) {
      errors.push(`Report document '${manifest.report_path}' cannot be resolved inside repository root`);
    } else {
      const report = fs.readFileSync(reportPath, 'utf8');
      if (/file:\/\/\/(?:home|Users)\//i.test(report)) {
        errors.push(`Report document '${manifest.report_path}' contains machine-local file links`);
      }
      if (!report.includes(manifest.repository.commit_sha)) {
        errors.push(`Report document '${manifest.report_path}' does not reference evaluated commit SHA`);
      }
    }
  }

  if (manifest.outcome.overall) {
    if (!manifest.outcome.protocol_compliant) errors.push('overall=true requires protocol_compliant=true');
    if (!manifest.outcome.delegation_successful) errors.push('overall=true requires delegation_successful=true');
    if (!manifest.outcome.code_review_passed) errors.push('overall=true requires code_review_passed=true');
  }
  if (delegation?.parent_direct_implementation && manifest.outcome.protocol_compliant) {
    errors.push('parent_direct_implementation=true conflicts with protocol_compliant=true');
  }

  return { valid: errors.length === 0, errors, warnings, evidence_dir: absDir };
}

if (process.argv[1] && process.argv[1].endsWith('verify-diagnostic-evidence.js')) {
  const args = process.argv.slice(2);
  const targetDir = args[0];
  const rootIndex = args.indexOf('--project-root');
  const projectRoot = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
  if (!targetDir || (rootIndex >= 0 && !projectRoot)) {
    console.error('Usage: node verify-diagnostic-evidence.js <evidence-dir> [--project-root <repo-root>]');
    process.exit(1);
  }
  const result = verifyDiagnosticEvidence(targetDir, projectRoot);
  if (result.valid) {
    console.log(`[PASS] Evidence directory '${targetDir}' passed diagnostic verification.`);
    result.warnings.forEach((warning) => console.warn(`  [WARN] ${warning}`));
    process.exit(0);
  }
  console.error(`[FAIL] Evidence directory '${targetDir}' failed diagnostic verification:`);
  result.errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
