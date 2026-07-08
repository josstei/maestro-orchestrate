const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
export type JsonFrontmatter = Record<string, unknown>;

export interface ParsedMarkdownState<TData extends JsonFrontmatter = JsonFrontmatter> {
  readonly data: TData;
  readonly body: string;
}

/**
 * Serializes structured data and a body string into the
 * JSON-frontmatter format used by session state files.
 *
 * @param data - JSON-serializable data for the frontmatter block
 * @param body - Optional body content placed after the closing delimiter
 */
function serialize(data: JsonFrontmatter, body = ''): string {
  return `---\n${JSON.stringify(data, null, 2)}\n---\n${body || ''}`;
}

/**
 * Parses a session state string containing JSON frontmatter and an optional body.
 *
 * @throws {Error} When no frontmatter delimiters are found in the content
 */
function parse<TData extends JsonFrontmatter = JsonFrontmatter>(content: string): ParsedMarkdownState<TData> {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error('No YAML frontmatter found in session state');
  }

  return {
    data: JSON.parse(match[1] || '{}') as TData,
    body: match[2] || '',
  };
}

export { serialize, parse };
