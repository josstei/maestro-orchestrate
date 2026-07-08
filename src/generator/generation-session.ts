import { createFileWriter } from './file-writer.js';
import type { GeneratedOutput, GenerationSessionOptions } from './types.js';

interface GenerationSessionStats {
  written: number;
  unchanged: number;
  errors: number;
  write_errors: number;
  processing_errors: string[];
}

function createGenerationSession({ rootDir, dryRun = false, diffMode = false, quiet = false }: GenerationSessionOptions) {
  const writer = createFileWriter({ rootDir, dryRun, diffMode, quiet });
  const processingErrors: string[] = [];
  const readOnlyMode = dryRun || diffMode;
  const plannedPaths: string[] = [];

  function reportError(message: string, error: unknown): void {
    const formatted =
      error instanceof Error ? `${message}: ${error.message}` : message;
    console.error(`ERROR: ${formatted}`);
    processingErrors.push(formatted);
  }

  function write(outputPath: string, content: string): void {
    plannedPaths.push(outputPath);
    writer.write(outputPath, content);
  }

  function writeAll(outputs: GeneratedOutput[]): void {
    for (const output of outputs) {
      write(output.outputPath, output.content);
    }
  }

  function clean(outputPaths: string[]): void {
    try {
      writer.clean(outputPaths);
    } catch (error) {
      reportError('cleaning generated files', error);
    }
  }

  function getStats(): GenerationSessionStats {
    const fileStats = writer.getStats();
    return {
      written: fileStats.written,
      unchanged: fileStats.unchanged,
      errors: fileStats.errors + processingErrors.length,
      write_errors: fileStats.errors,
      processing_errors: processingErrors.slice(),
    };
  }

  function getPlannedPaths(): string[] {
    return plannedPaths.slice();
  }

  return {
    diffMode,
    dryRun,
    clean,
    getPlannedPaths,
    getStats,
    isReadOnlyMode() {
      return readOnlyMode;
    },
    reportError,
    write,
    writeAll,
  };
}

export { createGenerationSession };
