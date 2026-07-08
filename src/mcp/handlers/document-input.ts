import fs from 'fs';
import path from 'path';
import { ValidationError } from '../../lib/errors/index.js';
import { atomicWriteSync } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

function resolveDocumentInputVariant(params: any, options: any) {
  const { pathKey, contentKey, filenameKey, requireMessage } = options;
  const has = (key: any) => typeof params[key] === 'string' && params[key].length > 0;
  const hasPath = has(pathKey);
  const hasContent = has(contentKey);
  const hasFilename = has(filenameKey);
  const contentVariantProvided = hasContent || hasFilename;

  if (hasPath && contentVariantProvided) {
    throw new ValidationError(`${pathKey} is mutually exclusive with ${contentKey}/${filenameKey}`);
  }

  if (contentVariantProvided) {
    if (!hasContent) throw new ValidationError(`${contentKey} is required`);
    if (!hasFilename) throw new ValidationError(`${filenameKey} is required`);
    return { kind: 'content', filename: params[filenameKey], content: params[contentKey] };
  }

  if (hasPath) return { kind: 'path', path: params[pathKey] };
  if (requireMessage) throw new ValidationError(requireMessage);
  return null;
}

function resolveDocumentInput(params: any, options: any) {
  const variant = resolveDocumentInputVariant(params, options);
  if (!variant) return null;
  if (variant.kind === 'content') return options.writeContent(variant.filename, variant.content);
  return options.resolvePath(variant.path);
}

function plansDirPath(projectRoot: any) {
  return path.join(resolveStateDirPath(projectRoot), 'plans');
}

function ensurePlansDocumentInPlans(projectRoot: any, sourcePath: any) {
  const plansDir = plansDirPath(projectRoot);
  const resolvedPlansDir = path.resolve(plansDir) + path.sep;
  const resolvedSource = path.resolve(sourcePath);

  if (resolvedSource.startsWith(resolvedPlansDir)) {
    return resolvedSource;
  }

  fs.mkdirSync(plansDir, { recursive: true });
  const destination = path.join(plansDir, path.basename(resolvedSource));
  fs.copyFileSync(resolvedSource, destination);
  return destination;
}

function assertPlansFilename(filename: any, paramName: any) {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new ValidationError(`${paramName} is required`);
  }
  if (filename.includes('\0')) {
    throw new ValidationError(`${paramName} contains null bytes`, {
      details: { value: filename },
    });
  }
  if (filename !== path.basename(filename) || filename === '..' || filename === '.') {
    throw new ValidationError(
      `${paramName} must be a pure basename (no path separators, no '.' or '..')`,
      { details: { value: filename } }
    );
  }
}

function writePlansDocumentContent(projectRoot: any, filename: any, content: any, filenameParam: any) {
  assertPlansFilename(filename, filenameParam);
  if (typeof content !== 'string' || content.length === 0) {
    throw new ValidationError(
      `${filenameParam.replace(/_filename$/, '_content')} must be a non-empty string`
    );
  }
  const destination = path.join(plansDirPath(projectRoot), filename);
  atomicWriteSync(destination, content);
  return destination;
}

export {
  resolveDocumentInput,
  resolveDocumentInputVariant,
  plansDirPath,
  ensurePlansDocumentInPlans,
  assertPlansFilename,
  writePlansDocumentContent,
};
