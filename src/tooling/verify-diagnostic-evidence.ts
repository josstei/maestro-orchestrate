import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function verifyDiagnosticEvidence(evidenceDir: string): VerificationResult {
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

  // 3. Verify evidence file hashes
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

  // 4. Validate other schemas
  try {
    const timelineData = JSON.parse(fs.readFileSync(path.join(absDir, 'timeline.json'), 'utf8'));
    TimelineSchema.parse(timelineData);
  } catch (err: any) {
    errors.push(`timeline.json schema validation error: ${err?.message || String(err)}`);
  }

  try {
    const orchestrationData = JSON.parse(fs.readFileSync(path.join(absDir, 'orchestration-outcome.json'), 'utf8'));
    OrchestrationOutcomeSchema.parse(orchestrationData);
  } catch (err: any) {
    errors.push(`orchestration-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let delegationOutcome;
  try {
    const delegationData = JSON.parse(fs.readFileSync(path.join(absDir, 'delegation-outcome.json'), 'utf8'));
    delegationOutcome = DelegationOutcomeSchema.parse(delegationData);
  } catch (err: any) {
    errors.push(`delegation-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let codeReviewOutcome;
  try {
    const codeReviewData = JSON.parse(fs.readFileSync(path.join(absDir, 'code-review-outcome.json'), 'utf8'));
    codeReviewOutcome = CodeReviewOutcomeSchema.parse(codeReviewData);
  } catch (err: any) {
    errors.push(`code-review-outcome.json schema validation error: ${err?.message || String(err)}`);
  }

  let readinessData;
  try {
    const readinessContent = JSON.parse(fs.readFileSync(path.join(absDir, 'production-readiness.json'), 'utf8'));
    readinessData = ProductionReadinessSchema.parse(readinessContent);
  } catch (err: any) {
    errors.push(`production-readiness.json schema validation error: ${err?.message || String(err)}`);
  }

  try {
    const artifactData = JSON.parse(fs.readFileSync(path.join(absDir, 'artifact-manifest.json'), 'utf8'));
    ArtifactManifestSchema.parse(artifactData);
  } catch (err: any) {
    errors.push(`artifact-manifest.json schema validation error: ${err?.message || String(err)}`);
  }

  // 5. Redaction checks
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

  // 6. Semantic consistency rules
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
