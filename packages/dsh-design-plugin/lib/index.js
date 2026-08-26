import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
//#region lib/types/locate.js
/**
* Workspace search behind `design_locate_source`: a bounded, synchronous
* recursive text scan that maps a captured element selection back to the
* source files that mention it. Pure Node `fs` — no subprocess, no ripgrep.
*/
/** Directories never descended into. */
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".nuxt",
	"coverage",
	".turbo",
	"lib",
	".dsh-build",
	".cache",
	"out",
	"target"
]);
/** Extensions treated as searchable text. */
const TEXT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".css",
	".scss",
	".less",
	".html",
	".htm",
	".vue",
	".svelte",
	".astro",
	".json",
	".md",
	".mdx",
	".yml",
	".yaml",
	".toml",
	".xml",
	".svg",
	".py",
	".go",
	".rs",
	".java",
	".kt",
	".swift",
	".rb",
	".php",
	".c",
	".h",
	".cpp",
	".hpp",
	".sh",
	".sql"
]);
/** Files walked before the scan declares truncation. */
const MAX_FILES = 2e4;
/** Matches retained before the scan declares truncation. */
const MAX_MATCHES = 100;
/** Bytes read from any single file. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Bytes kept from a matched line for display. */
const MAX_LINE_BYTES = 2e3;
/** Whether a file path's extension is in the searchable text set. */
function isTextPath(file) {
	const dot = file.lastIndexOf(".");
	if (dot < 0) return false;
	return TEXT_EXTENSIONS.has(file.slice(dot).toLowerCase());
}
/** Read a bounded line excerpt, guarding against binary/invalid UTF-8. */
function lineExcerpt(raw, start) {
	const end = raw.indexOf("\n", start);
	const trimmed = raw.slice(start, end < 0 ? raw.length : end).trim();
	return trimmed.length > MAX_LINE_BYTES ? `${trimmed.slice(0, MAX_LINE_BYTES)}…` : trimmed;
}
/**
* Recursively scan `root` for files whose lines contain `query`.
* @param root - absolute search root.
* @param query - the text to locate; empty queries return no matches.
* @returns bounded matches with a truncation flag.
*/
function locateSource(root, query) {
	const result = {
		query,
		matches: [],
		truncated: false
	};
	const needle = query.trim();
	if (needle === "") return result;
	let files = 0;
	const walk = (dir) => {
		if (result.truncated) return;
		let names;
		try {
			names = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of names) {
			if (result.truncated) return;
			const abs = join(dir, name);
			let isDirectory;
			let isFile;
			try {
				const stat = statSync(abs);
				isDirectory = stat.isDirectory();
				isFile = stat.isFile();
			} catch {
				continue;
			}
			if (isDirectory) {
				if (SKIP_DIRS.has(name)) continue;
				walk(abs);
				continue;
			}
			if (!isFile || !isTextPath(name)) continue;
			files += 1;
			if (files > MAX_FILES) {
				result.truncated = true;
				return;
			}
			let raw;
			try {
				raw = readFileSync(abs, "utf8").slice(0, MAX_FILE_BYTES);
			} catch {
				continue;
			}
			let from = 0;
			while (from < raw.length && result.matches.length < MAX_MATCHES) {
				const at = raw.indexOf(needle, from);
				if (at < 0) break;
				const line = raw.slice(0, at).split("\n").length;
				result.matches.push({
					file: relative(root, abs),
					line,
					text: lineExcerpt(raw, at)
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
//#endregion
//#region lib/types/index.js
/**
* Design plugin host half: registers the `design_locate_source` tool that maps
* a captured element selection back to the workspace files that mention it,
* plus the prompt section teaching the agent the design-mode workflow.
* @module @dpsagent/dsh-design-plugin
*/
/** Cordis plugin name used by loader diagnostics. */
const name = "design";
/** Services required before the tool and prompt section can register. */
const inject = ["tools", "systemPrompt"];
/** Cooperative tool-call timeout budget (ms); the scan forwards no signal, so keep it short and bounded. */
const LOCATE_TIMEOUT_MS = 15e3;
/**
* Register the design-mode tool suite and workflow guidance.
* @param ctx - plugin context; registrations are effects scoped to this plugin.
*/
function apply(ctx) {
	ctx.systemPrompt.section({
		name: "tool:design_locate_source",
		order: 104,
		text: "Use the design_locate_source tool to find the source file that renders a selected web element: pass the element's visible text (and optionally a workspace path) and it returns file:line matches. Then open the file with read and apply the requested change with edit."
	});
	const tool = defineTool({
		name: "design_locate_source",
		description: "Locate the source files that render a web element selected in design mode. Returns up to 100 file:line matches whose line contains the given text, searched recursively under the session workspace (or an explicit path), skipping node_modules, build output, and VCS metadata. Prefer this over a broad grep when the user cites an element and asks to change it.",
		parameters: {
			text: {
				type: "string",
				required: true,
				description: "The element text (or another exact string from it) to locate, e.g. a button label or heading text."
			},
			path: {
				type: "string",
				description: "Directory to search. Defaults to the session workspace; a relative path resolves against it."
			}
		},
		timeoutMs: LOCATE_TIMEOUT_MS,
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					query: {
						type: "string",
						required: true
					},
					matches: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								file: {
									type: "string",
									required: true
								},
								line: {
									type: "integer",
									required: true
								},
								text: {
									type: "string",
									required: true
								}
							}
						}
					},
					truncated: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const result = value;
				if (result.matches.length === 0) return [{
					type: "text",
					text: `No source reference found for "${result.query}".`
				}];
				return [{
					type: "text",
					text: result.matches.map((match) => `${match.file}:${match.line}  ${match.text}`).join("\n")
				}];
			}
		},
		async execute(args, exec) {
			return locateSource(args.path ?? exec.agent?.session.header.cwd ?? process.cwd(), args.text);
		}
	});
	ctx.tools.register(tool);
}
//#endregion
export { apply, inject, name };
