'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  plansDirPath,
  toAbsoluteDocPath,
  materializePlansDocument,
  writePlansDocumentContent,
  resolveDocumentInput,
  relocatePlansDocumentToArchive,
} = require('../../src/mcp/handlers/plans-document');
const { ValidationError, NotFoundError } = require('../../src/lib/errors');

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-plans-'));
  fs.mkdirSync(path.join(workspace, 'docs', 'maestro', 'plans'), {
    recursive: true,
  });
  return workspace;
}

describe('plans-document', () => {
  describe('plansDirPath', () => {
    it('resolves to <state_dir>/plans', () => {
      const workspace = makeWorkspace();
      assert.equal(
        plansDirPath(workspace),
        path.join(workspace, 'docs', 'maestro', 'plans')
      );
    });
  });

  describe('toAbsoluteDocPath', () => {
    it('returns absolute paths unchanged', () => {
      assert.equal(
        toAbsoluteDocPath('/root', '/tmp/file.md'),
        '/tmp/file.md'
      );
    });

    it('joins relative paths against projectRoot', () => {
      assert.equal(
        toAbsoluteDocPath('/root', 'sub/file.md'),
        path.join('/root', 'sub', 'file.md')
      );
    });
  });

  describe('writePlansDocumentContent', () => {
    it('writes content to plans/<filename> and returns the path', () => {
      const workspace = makeWorkspace();
      const dest = writePlansDocumentContent(
        workspace,
        'plan.md',
        '# Plan\n',
        'implementation_plan_filename'
      );
      assert.equal(dest, path.join(plansDirPath(workspace), 'plan.md'));
      assert.equal(fs.readFileSync(dest, 'utf8'), '# Plan\n');
    });

    it('rejects empty filenames', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          writePlansDocumentContent(
            workspace,
            '',
            '# body\n',
            'implementation_plan_filename'
          ),
        (err) =>
          err instanceof ValidationError &&
          /implementation_plan_filename is required/.test(err.message)
      );
    });

    it('rejects filenames with separators', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          writePlansDocumentContent(
            workspace,
            'sub/plan.md',
            '# body\n',
            'implementation_plan_filename'
          ),
        (err) =>
          err instanceof ValidationError && /pure basename/.test(err.message)
      );
    });

    it('rejects empty content', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          writePlansDocumentContent(
            workspace,
            'plan.md',
            '',
            'implementation_plan_filename'
          ),
        (err) =>
          err instanceof ValidationError &&
          /implementation_plan_content/.test(err.message)
      );
    });
  });

  describe('materializePlansDocument', () => {
    it('copies external files into plans/', () => {
      const workspace = makeWorkspace();
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-tmp-'));
      const source = path.join(tmp, 'design.md');
      fs.writeFileSync(source, '# design\n');

      const dest = materializePlansDocument(
        workspace,
        source,
        'design_document'
      );
      assert.equal(
        dest,
        path.join(plansDirPath(workspace), 'design.md')
      );
      assert.equal(fs.readFileSync(dest, 'utf8'), '# design\n');
      assert.ok(fs.existsSync(source), 'source file must remain intact');
    });

    it('returns the source path unchanged when already inside plans/', () => {
      const workspace = makeWorkspace();
      const target = path.join(plansDirPath(workspace), 'design.md');
      fs.writeFileSync(target, '# already-in-plans\n');
      const dest = materializePlansDocument(
        workspace,
        target,
        'design_document'
      );
      assert.equal(dest, path.resolve(target));
    });

    it('throws NotFoundError when the source is missing', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          materializePlansDocument(
            workspace,
            '/nonexistent/design.md',
            'design_document'
          ),
        (err) =>
          err instanceof NotFoundError && /does not exist/.test(err.message)
      );
    });
  });

  describe('resolveDocumentInput', () => {
    const spec = {
      pathKey: 'implementation_plan',
      contentKey: 'implementation_plan_content',
      filenameKey: 'implementation_plan_filename',
    };

    it('returns null when neither variant is provided (required=false)', () => {
      const workspace = makeWorkspace();
      assert.equal(resolveDocumentInput({}, workspace, spec), null);
    });

    it('throws ValidationError when required and neither variant is provided', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          resolveDocumentInput({}, workspace, { ...spec, required: true }),
        (err) => err instanceof ValidationError
      );
    });

    it('uses a custom missingMessage when supplied', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          resolveDocumentInput({}, workspace, {
            ...spec,
            required: true,
            missingMessage: 'custom-missing-message',
          }),
        (err) => err.message === 'custom-missing-message'
      );
    });

    it('rejects both variants provided simultaneously', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          resolveDocumentInput(
            {
              implementation_plan: '/tmp/a.md',
              implementation_plan_content: '# x\n',
              implementation_plan_filename: 'b.md',
            },
            workspace,
            spec
          ),
        (err) =>
          err instanceof ValidationError &&
          /mutually exclusive/.test(err.message)
      );
    });

    it('normalizes a path variant to absolute without copying', () => {
      const workspace = makeWorkspace();
      const result = resolveDocumentInput(
        { implementation_plan: '/tmp/absent.md' },
        workspace,
        spec
      );
      assert.equal(result, '/tmp/absent.md');
    });

    it('joins workspace-relative paths against projectRoot', () => {
      const workspace = makeWorkspace();
      const result = resolveDocumentInput(
        { implementation_plan: 'docs/plan.md' },
        workspace,
        spec
      );
      assert.equal(result, path.join(workspace, 'docs/plan.md'));
    });

    it('materializes the content variant into plans/', () => {
      const workspace = makeWorkspace();
      const result = resolveDocumentInput(
        {
          implementation_plan_content: '# inline\n',
          implementation_plan_filename: 'inline-plan.md',
        },
        workspace,
        spec
      );
      assert.equal(result, path.join(plansDirPath(workspace), 'inline-plan.md'));
      assert.equal(fs.readFileSync(result, 'utf8'), '# inline\n');
    });

    it('requires both content and filename for the content variant', () => {
      const workspace = makeWorkspace();
      assert.throws(
        () =>
          resolveDocumentInput(
            { implementation_plan_content: '# body\n' },
            workspace,
            spec
          ),
        (err) =>
          err instanceof ValidationError &&
          /implementation_plan_filename is required/.test(err.message)
      );
      assert.throws(
        () =>
          resolveDocumentInput(
            { implementation_plan_filename: 'plan.md' },
            workspace,
            spec
          ),
        (err) =>
          err instanceof ValidationError &&
          /implementation_plan_content is required/.test(err.message)
      );
    });
  });

  describe('relocatePlansDocumentToArchive', () => {
    it('moves a plans file into the archive directory', () => {
      const workspace = makeWorkspace();
      const plansDir = plansDirPath(workspace);
      const archiveDir = path.join(plansDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const source = path.join(plansDir, 'design.md');
      fs.writeFileSync(source, '# design\n');

      const dest = relocatePlansDocumentToArchive(
        source,
        workspace,
        archiveDir
      );
      assert.equal(dest, path.join(archiveDir, 'design.md'));
      assert.equal(fs.existsSync(source), false);
      assert.equal(fs.readFileSync(dest, 'utf8'), '# design\n');
    });

    it('returns null when the path is outside plans/', () => {
      const workspace = makeWorkspace();
      const archiveDir = path.join(plansDirPath(workspace), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-outside-'));
      const outside = path.join(tmp, 'elsewhere.md');
      fs.writeFileSync(outside, '# out\n');

      const dest = relocatePlansDocumentToArchive(
        outside,
        workspace,
        archiveDir
      );
      assert.equal(dest, null);
      assert.ok(fs.existsSync(outside), 'outside file is untouched');
    });

    it('returns null when the source file no longer exists', () => {
      const workspace = makeWorkspace();
      const archiveDir = path.join(plansDirPath(workspace), 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const missing = path.join(plansDirPath(workspace), 'missing.md');
      const dest = relocatePlansDocumentToArchive(
        missing,
        workspace,
        archiveDir
      );
      assert.equal(dest, null);
    });
  });
});
