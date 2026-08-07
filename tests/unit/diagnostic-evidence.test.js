import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyDiagnosticEvidence } from '../../dist/src/tooling/verify-diagnostic-evidence.js';
import { generateArtifactManifest } from '../../dist/src/tooling/diagnostics/artifact-manifest.js';
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
  const fixtureDir = path.resolve('tests/unit/fixtures/synthetic-evidence-run');

  it('verifies synthetic fixture directory structure', () => {
    assert.equal(fs.existsSync(path.join(fixtureDir, 'manifest.json')), true);
    assert.equal(fs.existsSync(path.join(fixtureDir, 'mcp-calls.redacted.jsonl')), true);
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

  it('fails verification when commit SHA is synthetic or placeholder', (t) => {
    const tmp = makeTempDir(t, 'evidence-placeholder-sha-');
    copyDirSync(fixtureDir, tmp);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    manifest.repository.commit_sha = '728126379a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d';
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('placeholder commit SHA')));
  });

  it('fails verification when MCP trace is missing calls required by outcome', (t) => {
    const tmp = makeTempDir(t, 'evidence-missing-mcp-calls-');
    copyDirSync(fixtureDir, tmp);

    // Empty mcp-calls.redacted.jsonl
    fs.writeFileSync(path.join(tmp, 'mcp-calls.redacted.jsonl'), '');

    // Re-hash manifest.json
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    const entry = manifest.evidence_files.find((e) => e.path === 'mcp-calls.redacted.jsonl');
    const content = fs.readFileSync(path.join(tmp, 'mcp-calls.redacted.jsonl'));
    entry.sha256 = crypto.createHash('sha256').update(content).digest('hex');
    entry.bytes = content.length;
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const result = verifyDiagnosticEvidence(tmp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('MCP trace missing')));
  });

  it('generateArtifactManifest handles files safely without shell injection', (t) => {
    const tmp = makeTempDir(t, 'artifact-manifest-shell-safe-');
    fs.mkdirSync(path.join(tmp, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'sub', 'file-with-$special;name.txt'), 'hello');

    const manifest = generateArtifactManifest(tmp, tmp);
    assert.equal(manifest.files.length, 1);
    assert.equal(manifest.files[0].bytes, 5);
  });
});
