import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyDiagnosticEvidence } from '../../dist/src/tooling/verify-diagnostic-evidence.js';
import { generateArtifactManifest } from '../../dist/src/tooling/diagnostics/artifact-manifest.js';
import { makeTempDir } from '../support/filesystem.js';

const ROOT = path.resolve('.');
const REAL_EVIDENCE = path.resolve('docs/evidence/tui-eval/2026-08-07T054800Z-8759873');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function rewriteInventoryEntry(evidenceDir, filename) {
  const manifestPath = path.join(evidenceDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifest.evidence_files.find((candidate) => candidate.path === filename);
  const content = fs.readFileSync(path.join(evidenceDir, filename));
  entry.bytes = content.length;
  entry.sha256 = crypto.createHash('sha256').update(content).digest('hex');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('diagnostic evidence verification', () => {
  it('verifies the committed AGY evidence bundle from a nested evidence path', () => {
    const result = verifyDiagnosticEvidence(REAL_EVIDENCE, ROOT);
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('fails verification when a required dispatch file is missing', (t) => {
    const tmp = makeTempDir(t, 'evidence-missing-dispatch-');
    copyDirSync(REAL_EVIDENCE, tmp);
    fs.unlinkSync(path.join(tmp, 'agent-dispatches.redacted.jsonl'));

    const result = verifyDiagnosticEvidence(tmp, ROOT);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('agent-dispatches.redacted.jsonl')));
  });

  it('fails verification when an evidence file hash is modified', (t) => {
    const tmp = makeTempDir(t, 'evidence-tampered-hash-');
    copyDirSync(REAL_EVIDENCE, tmp);
    fs.appendFileSync(path.join(tmp, 'run-summary.md'), '\ntampered line\n');

    const result = verifyDiagnosticEvidence(tmp, ROOT);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('Hash mismatch')));
  });

  it('fails verification when the evaluated commit is not reachable from the declared branch', (t) => {
    const tmp = makeTempDir(t, 'evidence-invalid-branch-');
    copyDirSync(REAL_EVIDENCE, tmp);
    const manifestPath = path.join(tmp, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.repository.branch = 'does-not-exist';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = verifyDiagnosticEvidence(tmp, ROOT);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("Declared branch 'does-not-exist'")));
  });

  it('fails verification when timeline offsets disagree with wall timestamps', (t) => {
    const tmp = makeTempDir(t, 'evidence-invalid-timeline-');
    copyDirSync(REAL_EVIDENCE, tmp);
    const timelinePath = path.join(tmp, 'timeline.json');
    const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
    timeline[0].offset_ms = 1;
    fs.writeFileSync(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`);
    rewriteInventoryEntry(tmp, 'timeline.json');

    const result = verifyDiagnosticEvidence(tmp, ROOT);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('offset_ms does not match')));
  });

  it('rejects production-ready status without retained tool outputs', (t) => {
    const tmp = makeTempDir(t, 'evidence-unsupported-readiness-');
    copyDirSync(REAL_EVIDENCE, tmp);
    const readinessPath = path.join(tmp, 'production-readiness.json');
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    for (const key of ['html_validation', 'accessibility', 'responsive_viewports', 'console_check', 'link_check']) {
      readiness[key].status = 'passed';
      readiness[key].tool = 'fixture-tool';
      readiness[key].version = '1.0.0';
      readiness[key].output_file = null;
    }
    readiness.production_ready = true;
    fs.writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`);
    rewriteInventoryEntry(tmp, 'production-readiness.json');
    const manifestPath = path.join(tmp, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.outcome.production_ready = true;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = verifyDiagnosticEvidence(tmp, ROOT);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('not backed by an inventoried tool output')));
  });

  it('generateArtifactManifest handles option-looking and shell-special filenames safely', (t) => {
    const tmp = makeTempDir(t, 'artifact-manifest-shell-safe-');
    fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'sub', '-file-with-$special;name.txt'), 'hello');

    const manifest = generateArtifactManifest(tmp, tmp);
    assert.equal(manifest.files.length, 1);
    assert.equal(manifest.files[0].bytes, 5);
  });
});
