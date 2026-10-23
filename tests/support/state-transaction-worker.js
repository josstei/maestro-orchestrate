'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withStateMutation } = require('../../src/state/coordinator');

const [base, boundary] = process.argv.slice(2);
const active = path.join(base, 'state', 'active-session.md');
const archive = path.join(base, 'state', 'archive', 'session.md');
const design = path.join(base, 'plans', 'design.md');
const archivedDesign = path.join(base, 'plans', 'archive', 'design.md');
const gate = path.join(base, 'state', 'session.design-gate.json');
const control = path.join(base, 'state', '.maestro');

function pause(name) {
  if (boundary !== name) return;
  fs.writeSync(1, `paused:${name}\n`);
  // A deterministic process barrier, including on Windows where SIGSTOP is absent.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

const rename = fs.renameSync;
fs.renameSync = function (source, destination) {
  if (destination === active) pause('before-public-rename');
  const result = rename.apply(this, arguments);
  if (destination === active) pause('applied-write');
  if (destination === archive) pause('applied-session-rename');
  if (destination === archivedDesign) pause('applied-document-rename');
  if (destination === path.join(control, 'revision')) pause('revision');
  if (destination === path.join(control, 'current.json')) {
    const cursor = JSON.parse(fs.readFileSync(destination, 'utf8')).cursor;
    pause(`checkpoint-${cursor}`);
  }
  if (path.basename(destination) === 'intent.json') pause('prepared');
  return result;
};
const mkdir = fs.mkdirSync;
fs.mkdirSync = function (filename) {
  const result = mkdir.apply(this, arguments);
  if (filename === path.dirname(archive)) pause('applied-state-directory');
  if (filename === path.dirname(archivedDesign)) pause('applied-plan-directory');
  return result;
};
const unlink = fs.unlinkSync;
fs.unlinkSync = function (filename) {
  const result = unlink.apply(this, arguments);
  if (filename === gate) pause('applied-gate-removal');
  if (filename === path.join(control, 'current.json')) pause('journal-removal');
  if (path.dirname(filename) === path.join(control, 'lock')) pause('owner-removal');
  return result;
};

withStateMutation(base, { operation: 'archive_session', sessionId: 'session' }, (tx) => {
  tx.writeFile(active, 'completed\n');
  tx.mkdir(path.dirname(archive), { recursive: true });
  tx.rename(active, archive);
  tx.mkdir(path.dirname(archivedDesign), { recursive: true });
  tx.rename(design, archivedDesign);
  tx.unlink(gate);
  return { success: true, archive_path: archive, archived_files: [archive, archivedDesign] };
}).then(() => {
  process.stdout.write('completed\n');
}).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
