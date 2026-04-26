'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_KEYS = ['contents', 'systemInstruction', 'tools'];

function trim(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) {
      throw new Error(`Fixture at ${inputPath} missing required key '${key}'. Refusing to trim.`);
    }
  }
  const trimmed = {
    contents: data.contents.slice(0, 2),
    systemInstruction: data.systemInstruction,
    tools: data.tools,
    generationConfig: data.generationConfig,
  };
  fs.writeFileSync(outputPath, JSON.stringify(trimmed, null, 2));
  return Buffer.byteLength(JSON.stringify(trimmed));
}

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.error('Usage: node _trim-fixture.js <src> <dst>');
    process.exit(2);
  }
  const size = trim(src, dst);
  console.log(`Trimmed ${path.basename(src)} -> ${path.basename(dst)}: ${size} bytes`);
}

module.exports = { trim };
