const FEATURE_BLOCK_REGEX =
  /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm;

const COLLAPSED_NEWLINE_REGEX = /\n{3,}/g;
export type FeatureBlockMode = 'strict' | 'lenient';
export interface FeatureBlockOptions {
  readonly mode?: FeatureBlockMode;
}

/**
 * @throws {Error} In strict mode, when a feature flag is not present in the features object
 */
function stripFeatureBlocks(
  content: string,
  features: Readonly<Record<string, boolean>>,
  opts?: FeatureBlockOptions
): string {
  const mode = (opts && opts.mode) || 'strict';

  const replaced = content.replace(
    FEATURE_BLOCK_REGEX,
    (_match: string, flagName: string, body: string) => {
      if (!(flagName in features)) {
        if (mode === 'strict') {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return '';
      }
      return features[flagName] ? body : '';
    }
  );

  return replaced.replace(COLLAPSED_NEWLINE_REGEX, '\n\n');
}

export { stripFeatureBlocks };
