import fs from 'node:fs';
import path from 'node:path';
import { readFileSafe, writeIfChanged } from '../io/index.js';
/**
 * Convert a simple glob pattern into a RegExp for matching filenames.
 *
 * Supports:
 *   - `*` matches any sequence of characters except path separators
 *   - Literal characters are escaped for safe regex usage
 *   - The pattern is anchored to match the full filename
 *
 */
function patternToRegex(pattern) {
    let regex = '';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i] || '';
        if (char === '*') {
            regex += '[^/]*';
        }
        else if ('.+?^${}()|[]\\'.includes(char)) {
            regex += '\\' + char;
        }
        else {
            regex += char;
        }
    }
    return new RegExp('^' + regex + '$');
}
/**
 * Parse a discovery pattern into its file-matching regex and whether
 * recursive scanning is implied by a `**\/` prefix.
 *
 */
function parsePattern(pattern) {
    if (pattern.startsWith('**/')) {
        return {
            regex: patternToRegex(pattern.slice(3)),
            impliedRecursive: true,
        };
    }
    return {
        regex: patternToRegex(pattern),
        impliedRecursive: false,
    };
}
/**
 * Collect file paths from a directory, optionally recursing into subdirectories.
 *
 */
function collectFiles(dir, recursive) {
    const results = [];
    if (!fs.existsSync(dir)) {
        return results;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && recursive) {
            results.push(...collectFiles(fullPath, true));
        }
        else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}
/**
 * Scan a directory for files matching a pattern and produce an array of
 * structured discovery entries.
 *
 */
function discover({ dir, pattern, identity, metadata, validate, recursive = false, }) {
    const { regex, impliedRecursive } = parsePattern(pattern);
    const shouldRecurse = recursive || impliedRecursive;
    const filePaths = collectFiles(dir, shouldRecurse);
    const entries = [];
    for (const filePath of filePaths) {
        const filename = path.basename(filePath);
        if (!regex.test(filename)) {
            continue;
        }
        const id = identity(filePath);
        let extra = {};
        if (metadata) {
            const content = readFileSafe(filePath);
            extra = metadata(filePath, content) || {};
        }
        const entry = { id, path: filePath, ...extra };
        if (validate && !validate(entry)) {
            continue;
        }
        entries.push(entry);
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    return entries;
}
/**
 * Serialize data as JSON and write it to a file, skipping the write when
 * the content has not changed.
 *
 */
function generateRegistry(data, outputPath) {
    const content = serializeRegistry(data);
    return writeIfChanged(outputPath, content);
}
/**
 * Serialize registry data to stable, newline-terminated JSON.
 *
 */
function serializeRegistry(data) {
    return JSON.stringify(data, null, 2) + '\n';
}
export { discover, generateRegistry, serializeRegistry, patternToRegex, parsePattern, collectFiles };
