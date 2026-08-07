import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyDiagnosticEvidence } from '../../dist/src/tooling/verify-diagnostic-evidence.js';
import { makeTempDir } from '../support/filesystem.js';

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

describe('diagnostic evidence verification', () => {
  const fixtureDir = path.resolve('docs/evidence/tui-eval/2026-08-07T041500Z-7281263');

  it('verifies a valid evidence directory successfully', () => {
    const result = verifyDiagnosticEvidence(fixtureDir);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails verification when a required file is missing', (t) => {
    const tmp = makeTempDir(t, 'evidence-missing-file-');
    copyDirSync(fixtureDir, tmp);
    fs.unlinkSync(path.join(tmp, 'timeline.json'));

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Missing required evidence file: 'timeline.json'")));
  });

  it('fails verification when an evidence file hash is modified', (t) => {
    const tmp = makeTempDir(t, 'evidence-tampered-hash-');
    copyDirSync(fixtureDir, tmp);
    fs.appendFileSync(path.join(tmp, 'validation-output.txt'), '\ntampered line\n');

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Hash mismatch')));
  });

  it('fails semantic validation when parent direct implementation is true but protocol_compliant is true', (t) => {
    const tmp = makeTempDir(t, 'evidence-direct-write-');
    copyDirSync(fixtureDir, tmp);

    const delegation = JSON.parse(fs.readFileSync(path.join(tmp, 'delegation-outcome.json'), 'utf8'));
    delegation.parent_direct_implementation = true;
    fs.writeFileSync(path.join(tmp, 'delegation-outcome.json'), JSON.stringify(delegation, null, 2));

    // Re-hash manifest.json
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    const entry = manifest.evidence_files.find((e) => e.path === 'delegation-outcome.json');
    const content = fs.readFileSync(path.join(tmp, 'delegation-outcome.json'));
    entry.sha256 = crypto.createHash('sha256').update(content).digest('hex');
    entry.bytes = content.length;
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('parent_direct_implementation occurred but protocol_compliant is true')));
  });

  it('fails semantic validation when production_ready is true but accessibility check failed', (t) => {
    const tmp = makeTempDir(t, 'evidence-readiness-fail-');
    copyDirSync(fixtureDir, tmp);

    const readiness = JSON.parse(fs.readFileSync(path.join(tmp, 'production-readiness.json'), 'utf8'));
    readiness.accessibility = false;
    fs.writeFileSync(path.join(tmp, 'production-readiness.json'), JSON.stringify(readiness, null, 2));

    // Re-hash manifest.json
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    const entry = manifest.evidence_files.find((e) => e.path === 'production-readiness.json');
    const content = fs.readFileSync(path.join(tmp, 'production-readiness.json'));
    entry.sha256 = crypto.createHash('sha256').update(content).digest('hex');
    entry.bytes = content.length;
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('production_ready is true but one or more required readiness criteria failed')));
  });
});
