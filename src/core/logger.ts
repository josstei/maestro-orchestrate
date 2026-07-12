function log(level: string, message: string): void {
  process.stderr.write(`[${level}] maestro: ${message}\n`);
}

function fatal(message: string): never {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

export { log, fatal };
