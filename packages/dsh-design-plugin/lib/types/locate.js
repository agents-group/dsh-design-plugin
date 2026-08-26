/**
 * Workspace search behind `design_locate_source`: a bounded, synchronous
 * recursive text scan that maps a captured element selection back to the
 * source files that mention it. Pure Node `fs` — no subprocess, no ripgrep.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
/** Directories never descended into. */
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
    '.turbo', 'lib', '.dsh-build', '.cache', 'out', 'target',
]);
/** Extensions treated as searchable text. */
const TEXT_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.less',
    '.html', '.htm', '.vue', '.svelte', '.astro', '.json', '.md', '.mdx',
    '.yml', '.yaml', '.toml', '.xml', '.svg', '.py', '.go', '.rs', '.java',
    '.kt', '.swift', '.rb', '.php', '.c', '.h', '.cpp', '.hpp', '.sh', '.sql',
]);
/** Files walked before the scan declares truncation. */
const MAX_FILES = 20_000;
/** Matches retained before the scan declares truncation. */
const MAX_MATCHES = 100;
/** Bytes read from any single file. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Bytes kept from a matched line for display. */
const MAX_LINE_BYTES = 2_000;
/** Whether a file path's extension is in the searchable text set. */
function isTextPath(file) {
    const dot = file.lastIndexOf('.');
    if (dot < 0)
        return false;
    return TEXT_EXTENSIONS.has(file.slice(dot).toLowerCase());
}
/** Read a bounded line excerpt, guarding against binary/invalid UTF-8. */
function lineExcerpt(raw, start) {
    const end = raw.indexOf('\n', start);
    const slice = raw.slice(start, end < 0 ? raw.length : end);
    const trimmed = slice.trim();
    return trimmed.length > MAX_LINE_BYTES ? `${trimmed.slice(0, MAX_LINE_BYTES)}…` : trimmed;
}
/**
 * Recursively scan `root` for files whose lines contain `query`.
 * @param root - absolute search root.
 * @param query - the text to locate; empty queries return no matches.
 * @returns bounded matches with a truncation flag.
 */
export function locateSource(root, query) {
    const result = { query, matches: [], truncated: false };
    const needle = query.trim();
    if (needle === '')
        return result;
    let files = 0;
    const walk = (dir) => {
        if (result.truncated)
            return;
        let names;
        try {
            names = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const name of names) {
            if (result.truncated)
                return;
            const abs = join(dir, name);
            let isDirectory;
            let isFile;
            try {
                const stat = statSync(abs);
                isDirectory = stat.isDirectory();
                isFile = stat.isFile();
            }
            catch {
                continue;
            }
            if (isDirectory) {
                if (SKIP_DIRS.has(name))
                    continue;
                walk(abs);
                continue;
            }
            if (!isFile || !isTextPath(name))
                continue;
            files += 1;
            if (files > MAX_FILES) {
                result.truncated = true;
                return;
            }
            let raw;
            try {
                raw = readFileSync(abs, 'utf8').slice(0, MAX_FILE_BYTES);
            }
            catch {
                continue;
            }
            let from = 0;
            while (from < raw.length && result.matches.length < MAX_MATCHES) {
                const at = raw.indexOf(needle, from);
                if (at < 0)
                    break;
                const before = raw.slice(0, at);
                const line = before.split('\n').length;
                result.matches.push({
                    file: relative(root, abs),
                    line,
                    text: lineExcerpt(raw, at),
                });
                from = at + needle.length;
            }
            if (result.matches.length >= MAX_MATCHES) {
                result.truncated = true;
                return;
            }
        }
    };
    walk(root);
    return result;
}
//# sourceMappingURL=locate.js.map