'use strict';

const fs = require('fs');
const path = require('path');

let counter = 0;

function atomicWriteSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpFile = filePath + `.tmp.${process.pid}.${++counter}`;
  try {
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

module.exports = { atomicWriteSync };
