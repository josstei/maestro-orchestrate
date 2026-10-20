'use strict';

/**
 * Shared argv parsing and failure handling for the CLIs under scripts/
 * (the generator, release and installer scripts).
 */

/**
 * Prints help and exits 0 if --help or -h appears anywhere in argv. Call it
 * before parsing so help wins over any invalid argument.
 */
function exitOnHelp(argv, printHelp) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }
}

/**
 * Parses argv left to right into `defaults` plus the given flags. A `flags`
 * entry ({ '--flag': 'option' }) takes the next argument as the option's
 * value, whatever it looks like; a `booleans` entry sets its option to true.
 * Reaching --help or -h prints help and exits 0. Any other argument, or a
 * value flag at the end of argv, throws.
 */
function parseFlagArgs(argv, { defaults = {}, flags = {}, booleans = {}, printHelp }) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (Object.hasOwn(booleans, arg)) {
      options[booleans[arg]] = true;
      continue;
    }

    if (!Object.hasOwn(flags, arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (index + 1 >= argv.length) {
      throw new Error(`Missing value for ${arg}`);
    }

    options[flags[arg]] = argv[index + 1];
    index += 1;
  }

  return options;
}

function runCli(failurePrefix, main) {
  try {
    main();
  } catch (error) {
    console.error(`${failurePrefix}: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  exitOnHelp,
  parseFlagArgs,
  runCli,
};
