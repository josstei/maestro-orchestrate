'use strict';

const { createFileWriter } = require('./file-writer');

function createGenerationSession({ rootDir, dryRun = false, diffMode = false }) {
  const writer = createFileWriter({ rootDir, dryRun, diffMode });
  const processingErrors = [];
  const readOnlyMode = dryRun || diffMode;

  function reportError(message, error) {
    const formatted =
      error && error.message ? `${message}: ${error.message}` : message;
    console.error(`ERROR: ${formatted}`);
    processingErrors.push(formatted);
  }

  function write(outputPath, content) {
    writer.write(outputPath, content);
  }

  function writeAll(outputs) {
    for (const output of outputs) {
      write(output.outputPath, output.content);
    }
  }

  function clean(outputPaths) {
    try {
      writer.clean(outputPaths);
    } catch (error) {
      reportError('cleaning generated files', error);
    }
  }

  function getStats() {
    const fileStats = writer.getStats();
    return {
      written: fileStats.written,
      unchanged: fileStats.unchanged,
      errors: fileStats.errors + processingErrors.length,
      write_errors: fileStats.errors,
      processing_errors: processingErrors.slice(),
    };
  }

  return {
    diffMode,
    dryRun,
    clean,
    getStats,
    isReadOnlyMode() {
      return readOnlyMode;
    },
    reportError,
    write,
    writeAll,
  };
}

module.exports = {
  createGenerationSession,
};
