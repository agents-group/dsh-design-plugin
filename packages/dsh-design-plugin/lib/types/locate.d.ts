/** One source location whose line contains the query. */
export interface LocateMatch {
    /** Workspace-relative path. */
    file: string;
    /** 1-based line number. */
    line: number;
    /** The trimmed line text (bounded). */
    text: string;
}
/** Complete result of one locate request. */
export interface LocateResult {
    /** The text that was searched for. */
    query: string;
    /** Workspace-relative matches, in walk order. */
    matches: LocateMatch[];
    /** True when the file or match budget was hit before the tree was exhausted. */
    truncated: boolean;
}
/**
 * Recursively scan `root` for files whose lines contain `query`.
 * @param root - absolute search root.
 * @param query - the text to locate; empty queries return no matches.
 * @returns bounded matches with a truncation flag.
 */
export declare function locateSource(root: string, query: string): LocateResult;
//# sourceMappingURL=locate.d.ts.map