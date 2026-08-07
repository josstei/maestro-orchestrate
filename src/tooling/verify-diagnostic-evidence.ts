import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
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

const REQUIRED_EVIDENCE_FILES = [
  'manifest.json',
  'environment.json',
  'timeline.json',
  'mcp-calls.redacted.jsonl',
  'orchestration-outcome.json',
  'artifact-manifest.json',
  'delegation-outcome.json',
  'code-review-outcome.json',
  'validation-output.txt',
  'production-readiness.json',
  'run-summary.md',
];

const PLACEHOLDER_HASH_PATTERNS = [
  /^a1b2c3d4e5f6/,
  /^c1d2e3f4a5b6/,
  /^0123456789abcdef/,
  /^1234567890abcdef/,
  /728126379a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d/,
  /8aba18f0a3e912bc345d1e2f3g4h5i6j7k8l9m0n/,
];

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyGitCommitExists(commitSha: string, projectRoot?: string): boolean {
  try {
    const cwd = projectRoot || process.cwd();
    execFileSync('git', ['cat-file', '-e', `${commitSha}^{commit}`], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function verifyDiagnosticEvidence(evidenceDir: string, projectRoot?: string): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const absDir = path.resolve(evidenceDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return {
      valid: false,
      errors: [`Evidence directory '${evidenceDir}' does not exist or is not a directory`],
      warnings: [],
      evidence_dir: evidenceDir,
    };
  }

  // 1. Check required files
  for (const filename of REQUIRED_EVIDENCE_FILES) {
    const file = path.join(absDir, filename);
    if (!fs.existsSync(file)) {
      errors.push(`Missing required evidence file: '${filename}'`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, evidence_dir: absDir };
  }

  // 2. Parse manifest.json
  let manifest;
  try {
    const manifestContent = JSON.parse(fs.readFileSync(path.join(absDir, 'manifest.json'), 'utf8'));
    manifest = EvidenceManifestSchema.parse(manifestContent);
  } catch (err: any) {
    errors.push(`manifest.json schema validation error: ${err?.message || String(err)}`);
    return { valid: false, errors, warnings, evidence_dir: absDir };
  }

  // 3. Verify Commit SHA existence and placeholder check
  const commitSha = manifest.repository.commit_sha;
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    errors.push(`Invalid commit SHA format in manifest: '${commitSha}' (must be 40 hex characters)`);
  } else {
    for (const pat of PLACEHOLDER_HASH_PATTERNS) {
      if (pat.test(commitSha)) {
        errors.push(`Manifest contains synthetic placeholder commit SHA: '${commitSha}'`);
        break;
      }
    }
    const root = projectRoot || path.resolve(absDir, '../../..');
    if (fs.existsSync(path.join(root, '.git'))) {
      if (!verifyGitCommitExists(commitSha, root)) {
        errors.push(`Commit SHA '${commitSha}' referenced in manifest does not exist in local git history`);
      }
    }
  }

  // 4. Verify evidence file hashes
  for (const entry of manifest.evidence_files) {
    const filePath = path.join(absDir, entry.path);
    if (!fs.existsSync(filePath)) {
      errors.push(`Manifest listed file '${entry.path}' missing from evidence directory`);
      continue;
    }
    const computedHash = computeSha256(filePath);
    if (computedHash !== entry.sha256) {
      errors.push(`Hash mismatch for '${entry.path}': expected ${entry.sha256}, got ${computedHash}`);
    }
  }

  // 5. Validate schemas and check placeholder hashes
  let timelineEvents: any[] = [];
  try {
    const timelineData = JSON.parse(fs.readFileSync(path.join(absDir, 'timeline.json'), 'utf8'));
    timelineEvents = TimelineSchema.parse(timelineData);
  } catch (err: any) {
    errors.push(`timeline.json schema validation error: ${err?.message || String(err)}`);
  }

  let orchestrationOutcome: any = {};
  try {
    const orchestrationData = JSON.parse(fs.readFileSync(path.join(absDir, 'orchestration-outcome.json'), 'utf8'));
    orchestrationOutcome = OrchestrationOutcomeSchema.parse(orchestrationData);
  } catch (err: any) {
    errors.push(`orchestration-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let delegationOutcome: any = {};
  try {
    const delegationData = JSON.parse(fs.readFileSync(path.join(absDir, 'delegation-outcome.json'), 'utf8'));
    delegationOutcome = DelegationOutcomeSchema.parse(delegationData);
  } catch (err: any) {
    errors.push(`delegation-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let codeReviewOutcome: any = {};
  try {
    const codeReviewData = JSON.parse(fs.readFileSync(path.join(absDir, 'code-review-outcome.json'), 'utf8'));
    codeReviewOutcome = CodeReviewOutcomeSchema.parse(codeReviewData);
    if (codeReviewOutcome.review_output_hash) {
      for (const pat of PLACEHOLDER_HASH_PATTERNS) {
        if (pat.test(codeReviewOutcome.review_output_hash)) {
          errors.push(`code-review-outcome contains synthetic placeholder review_output_hash: '${codeReviewOutcome.review_output_hash}'`);
          break;
        }
      }
    }
  } catch (err: any) {
    errors.push(`code-review-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let readinessData: any = {};
  try {
    const readinessContent = JSON.parse(fs.readFileSync(path.join(absDir, 'production-readiness.json'), 'utf8'));
    readinessData = ProductionReadinessSchema.parse(readinessContent);
  } catch (err: any) {
    errors.push(`production-readiness.json schema validation error: ${err?.message || String(err)}`);
  }

  let artifactManifest: any = {};
  try {
    const artifactData = JSON.parse(fs.readFileSync(path.join(absDir, 'artifact-manifest.json'), 'utf8'));
    artifactManifest = ArtifactManifestSchema.parse(artifactData);
    for (const f of artifactManifest.files || []) {
      for (const pat of PLACEHOLDER_HASH_PATTERNS) {
        if (pat.test(f.sha256)) {
          errors.push(`artifact-manifest contains synthetic placeholder file hash for '${f.relative_path}': '${f.sha256}'`);
          break;
        }
      }
    }
  } catch (err: any) {
    errors.push(`artifact-manifest.json schema validation error: ${err?.message || String(err)}`);
  }

  // 6. Parse mcp-calls.redacted.jsonl and correlate with outcomes
  const mcpCalls: any[] = [];
  const mcpCallTools = new Set<string>();
  const mcpCallIds = new Set<string>();
  const jsonlLines = fs
    .readFileSync(path.join(absDir, 'mcp-calls.redacted.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  for (let i = 0; i < jsonlLines.length; i++) {
    const line = jsonlLines[i];
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      const parsed = McpCallRecordSchema.parse(record);
      mcpCalls.push(parsed);
      mcpCallTools.add(parsed.tool_name);
      mcpCallIds.add(parsed.call_id);
    } catch (err: any) {
      errors.push(`mcp-calls.redacted.jsonl line ${i + 1} validation error: ${err?.message || String(err)}`);
    }
  }

  // Correlate outcomes with MCP calls
  if (orchestrationOutcome.workspace_initialized && !mcpCallTools.has('initialize_workspace')) {
    errors.push('MCP trace missing initialize_workspace call required by orchestration outcome');
  }
  if (orchestrationOutcome.session_created && !mcpCallTools.has('create_session')) {
    errors.push('MCP trace missing create_session call required by orchestration outcome');
  }
  if (orchestrationOutcome.transition_completed && !mcpCallTools.has('transition_phase')) {
    errors.push('MCP trace missing transition_phase call required by orchestration outcome');
  }
  if (orchestrationOutcome.code_review_status === 'passed' && !mcpCallTools.has('record_code_review')) {
    errors.push('MCP trace missing record_code_review call required by passing code review outcome');
  }
  if (orchestrationOutcome.archive_status === 'archived' && !mcpCallTools.has('archive_session')) {
    errors.push('MCP trace missing archive_session call required by archived outcome');
  }

  // Check timeline event references to MCP calls
  for (const event of timelineEvents) {
    for (const linkedId of event.linked_mcp_call_ids || []) {
      if (!mcpCallIds.has(linkedId)) {
        errors.push(`Timeline event '${event.stage_id}/${event.operation}' references uncaptured MCP call ID '${linkedId}'`);
      }
    }
  }

  // 7. Validation Output test totals check
  const valOutputText = fs.readFileSync(path.join(absDir, 'validation-output.txt'), 'utf8');
  const passMatch = valOutputText.match(/# pass (\d+)|ℹ pass (\d+)/);
  if (passMatch) {
    const passStr = passMatch[1] || passMatch[2] || '0';
    const totalPasses = parseInt(passStr, 10);
    if (manifest.outcome.overall && totalPasses < 100) {
      errors.push(`validation-output.txt test pass total (${totalPasses}) is incomplete for full repository run`);
    }
  }

  // 8. Redaction checks
  for (const filename of REQUIRED_EVIDENCE_FILES) {
    const filePath = path.join(absDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    if (/\/home\/[a-zA-Z0-9_-]+/.test(content) || /\/Users\/[a-zA-Z0-9_-]+/.test(content)) {
      errors.push(`Unredacted home directory path found in '${filename}'`);
    }
    if (/gh[pousr]_[a-zA-Z0-9]{36}/.test(content) || /sk-[a-zA-Z0-9]{32,}/.test(content)) {
      errors.push(`Unredacted secret token pattern found in '${filename}'`);
    }
  }

  // 9. Report file machine-local link check
  if (manifest.report_path) {
    const root = projectRoot || path.resolve(absDir, '../../..');
    const reportAbsPath = path.resolve(root, manifest.report_path);
    if (fs.existsSync(reportAbsPath)) {
      const reportText = fs.readFileSync(reportAbsPath, 'utf8');
      if (/file:\/\/\/(?:home|Users)\//i.test(reportText)) {
        errors.push(`Report document '${manifest.report_path}' contains machine-local 'file://' links`);
      }
    }
  }

  // 10. Semantic consistency rules
  if (manifest.outcome.overall) {
    if (!manifest.outcome.protocol_compliant) {
      errors.push('Semantic conflict: overall outcome is true but protocol_compliant is false');
    }
    if (!manifest.outcome.delegation_successful) {
      errors.push('Semantic conflict: overall outcome is true but delegation_successful is false');
    }
    if (!manifest.outcome.code_review_passed) {
      errors.push('Semantic conflict: overall outcome is true but code_review_passed is false');
    }
  }

  if (delegationOutcome?.parent_direct_implementation) {
    if (manifest.outcome.protocol_compliant) {
      errors.push('Semantic conflict: parent_direct_implementation occurred but protocol_compliant is true');
    }
  }

  if (readinessData?.production_ready) {
    if (
      !readinessData.html_validation ||
      !readinessData.accessibility ||
      !readinessData.responsive_viewports ||
      !readinessData.console_errors ||
      !readinessData.broken_links ||
      !readinessData.code_review_passed ||
      readinessData.unresolved_blocking_findings > 0
    ) {
      errors.push('Semantic conflict: production_ready is true but one or more required readiness criteria failed');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    evidence_dir: absDir,
  };
}

// CLI runner when executed directly
if (process.argv[1] && process.argv[1].endsWith('verify-diagnostic-evidence.js')) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node verify-diagnostic-evidence.js <evidence-dir>');
    process.exit(1);
  }
  const result = verifyDiagnosticEvidence(targetDir);
  if (result.valid) {
    console.log(`[PASS] Evidence directory '${targetDir}' passed diagnostic verification.`);
    process.exit(0);
  } else {
    console.error(`[FAIL] Evidence directory '${targetDir}' failed diagnostic verification:`);
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
}
