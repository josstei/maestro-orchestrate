import fs from 'fs';
import path from 'path';
import { NotFoundError } from '../../lib/errors/index.js';
import {
  ensurePlansDocumentInPlans,
  resolveDocumentInput,
  writePlansDocumentContent,
} from '../handlers/document-input.js';

function materializeSessionDocument(projectRoot: any, documentPath: any, documentKind: any) {
  if (typeof documentPath !== 'string' || documentPath.length === 0) {
    return null;
  }
  const absolutePath = path.isAbsolute(documentPath)
    ? documentPath
    : path.join(projectRoot, documentPath);
  if (!fs.existsSync(absolutePath)) {
    const context =
      documentKind === 'design_document'
        ? ' (recorded via record_design_approval but not found at create_session time — confirm the file was materialized after Plan Mode exit)'
        : ' (confirm the plan was written to disk before calling create_session)';
    throw new NotFoundError(`${documentKind} does not exist: ${absolutePath}${context}`);
  }
  return ensurePlansDocumentInPlans(projectRoot, absolutePath);
}

function resolveImplementationPlan(params: any, projectRoot: any) {
  return resolveDocumentInput(params, {
    pathKey: 'implementation_plan',
    contentKey: 'implementation_plan_content',
    filenameKey: 'implementation_plan_filename',
    requireMessage: null,
    resolvePath: (p: any) => materializeSessionDocument(projectRoot, p, 'implementation_plan'),
    writeContent: (filename: any, content: any) =>
      writePlansDocumentContent(projectRoot, filename, content, 'implementation_plan_filename'),
  });
}

function archivePlansDocuments(basePath: any, projectRoot: any, documentPaths: any) {
  const archivedFiles = [];
  const plansArchiveDir = path.join(basePath, 'plans', 'archive');
  fs.mkdirSync(plansArchiveDir, { recursive: true });

  const resolvedPlansDir = path.resolve(path.join(basePath, 'plans')) + path.sep;

  for (const documentPath of documentPaths.filter(Boolean)) {
    const absoluteDocumentPath = path.resolve(
      path.isAbsolute(documentPath)
        ? documentPath
        : path.join(projectRoot, documentPath)
    );

    if (!absoluteDocumentPath.startsWith(resolvedPlansDir)) {
      continue;
    }

    if (fs.existsSync(absoluteDocumentPath)) {
      const destinationPath = path.join(
        plansArchiveDir,
        path.basename(absoluteDocumentPath)
      );
      fs.renameSync(absoluteDocumentPath, destinationPath);
      archivedFiles.push(destinationPath);
    }
  }

  return archivedFiles;
}

export { archivePlansDocuments, materializeSessionDocument, resolveImplementationPlan };
