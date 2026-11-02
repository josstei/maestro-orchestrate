'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise native path semantics on every CI host without changing global path
// functions. The filesystem stub models Windows' legacy/native realpath split.
function loadPaths(pathApi, nativeRealpath = (filename) => filename) {
  const realpathSync = (filename) => filename;
  realpathSync.native = nativeRealpath;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/state/paths.js'), 'utf8'), {
    module,
    require(name) {
      if (name === 'node:path') return pathApi;
      if (name === 'node:fs') return { realpathSync };
      if (name === '../config/setting-resolver') return { resolveSetting: () => undefined };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}

describe('state path containment across platforms', () => {
  it('accepts Windows separator and case variants without changing returned path spelling', () => {
    const { resolveStateDirUnder } = loadPaths(path.win32);
    const target = 'C:\\Users\\Runner\\Project\\.maestro';
    assert.equal(resolveStateDirUnder('c:/users/runner/project', target), target);
    assert.equal(resolveStateDirUnder('C:\\', target), target);
  });

  it('compares native Windows aliases, including a state directory not created yet', () => {
    const { resolveStateDirUnder } = loadPaths(path.win32, (filename) => {
      if (filename.endsWith('\\new-state')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return filename.replace(/runner~1/i, 'runneradmin');
    });
    const root = 'c:/Users/runneradmin/Project';
    for (const name of ['.maestro', 'new-state']) {
      const target = `C:\\Users\\RUNNER~1\\Project\\${name}`;
      assert.equal(resolveStateDirUnder(root, target), target);
    }
  });

  it('rejects Windows sibling directories, parent directories and other volumes', () => {
    const { resolveStateDirUnder } = loadPaths(path.win32);
    for (const target of ['C:\\work-copy\\state', 'C:\\', 'D:\\work\\state']) {
      assert.throws(() => resolveStateDirUnder('C:\\work', target), /state_dir must be within the project root/);
    }
  });

  it('preserves POSIX case sensitivity and rejects native paths outside the workspace', () => {
    const { resolveStateDirUnder } = loadPaths(path.posix, (filename) =>
      filename === '/work/Project/state' ? '/outside/state' : filename);
    for (const target of ['/work/project/state', '/work/Project/state']) {
      assert.throws(() => resolveStateDirUnder('/work/Project', target), /state_dir must be within the project root/);
    }
  });
});
