'use strict';

/**
 * Shared argv parsing and failure handling for the CLIs under scripts/
 * (the generator and release scripts).
 */

/**
 * Parses `flags` (`--name value`, the value non-empty) and `booleans` (switches, default false)
 * into their option names, plus at most one bare argument, named `positional`, into
 * `options.positionals`. -h/--help prints `usage` and exits.
 */
function parseFlagArgs(argv, { flags = {}, booleans = {}, positional, usage }) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    process.exit(0);
  }

  const options = positional ? { positionals: [] } : {};
  for (const name of Object.values(booleans)) options[name] = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (Object.hasOwn(booleans, arg)) {
      options[booleans[arg]] = true;
    } else if (Object.hasOwn(flags, arg)) {
      index += 1;
      if (!argv[index]) throw new Error(`Missing value for ${arg}`);
      options[flags[arg]] = argv[index];
    } else if (arg.startsWith('-') || !positional) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (options.positionals.length > 0) {
      throw new Error(`Expected at most one ${positional}`);
    } else {
      options.positionals.push(arg);
    }
  }

  return options;
}

// Runs only when `entry` is the main module, so tests can require a CLI for its exports.
function runCli(entry, { failure, ...spec }, main) {
  if (require.main !== entry) return;
  try {
    main(parseFlagArgs(process.argv.slice(2), spec));
  } catch (error) {
    console.error(`${failure}: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseFlagArgs,
  runCli,
};
