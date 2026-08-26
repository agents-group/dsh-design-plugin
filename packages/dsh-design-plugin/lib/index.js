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
//#region lib/types/proxy.js
/** Route prefix the design client rewrites the preview iframe src to. */
const DESIGN_PROXY_PATH = "/__design/proxy";
const PROXY_PREFIX = "/__design/proxy/";
function encodeUrl(url) {
	return Buffer.from(url, "utf8").toString("base64url");
}
function decodeUrl(segment) {
	return Buffer.from(segment, "base64url").toString("utf8");
}
function isHtml(contentType) {
	return contentType !== null && /text\/html/i.test(contentType);
}
function isCss(contentType) {
	return contentType !== null && /text\/css/i.test(contentType);
}
/** Schemes the proxy will not fetch (and that must not be rewritten). */
function isProxiable(url) {
	return /^https?:\/\//i.test(url);
}
/** Map one URL reference found in a proxied response to its proxy URL. */
function rewriteRef(ref, base) {
	const trimmed = ref.trim();
	if (trimmed === "" || trimmed.startsWith("#")) return ref;
	if (/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(trimmed)) return ref;
	let absolute;
	try {
		absolute = new URL(trimmed, base).href;
	} catch {
		return ref;
	}
	if (isProxiable(absolute)) return PROXY_PREFIX + encodeUrl(absolute);
	return ref;
}
/** Rewrite url(...) occurrences inside CSS text. */
function rewriteCssUrls(css, base) {
	return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_match, quote, url) => {
		return "url(" + quote + rewriteRef(url, base) + quote + ")";
	});
}
/** Rewrite URL-bearing HTML attributes and inline styles. */
function rewriteHtml(html, base) {
	html = html.replace(/(style\s*=\s*")([^"]*)(")/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post);
	html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post);
	html = html.replace(/\b(src|href|action|poster|data-src|data-href)\s*=\s*(["'])([^"']*)\2/gi, (_m, attr, quote, url) => attr + "=" + quote + rewriteRef(url, base) + quote);
	html = html.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/gi, (_m, quote, list) => {
		const rewritten = list.split(",").map((part) => {
			const tokens = part.trim().split(/\s+/);
			if (tokens.length === 0) return part;
			tokens[0] = rewriteRef(tokens[0], base);
			return tokens.join(" ");
		}).join(", ");
		return "srcset=" + quote + rewritten + quote;
	});
	return html;
}
/** Inject the JS URL-rewriting shim into the head of an HTML document. */
function injectShim(html, base) {
	const shim = "<script data-dsh-proxy-shim>\n(function(){\nvar BASE=" + JSON.stringify(base) + ";\nvar PREFIX=" + JSON.stringify(PROXY_PREFIX) + ";\nfunction b64url(s){var bytes=new TextEncoder().encode(s);var bin=\"\";for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}return btoa(bin).replace(/\\+/g,\"-\").replace(/\\//g,\"_\").replace(/=+$/,\"\");}\nfunction map(u){if(typeof u!==\"string\"){return u;}var t=u.trim();if(!t||t[0]===\"#\"){return u;}if(/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(t)){return u;}try{var abs=new URL(t,BASE).href;if(/^https?:/i.test(abs)){return PREFIX+b64url(abs);}}catch(e){}return u;}\nfunction patch(target,name){if(!target||target.__dshPatched){return;}try{var orig=target[name];if(typeof orig!==\"function\"){return;}target[name]=function(){var args=[].slice.call(arguments);var i=name===\"open\"?1:0;if(typeof args[i]===\"string\"){args[i]=map(args[i]);}return orig.apply(this,args);};target.__dshPatched=true;}catch(e){}}\npatch(window,\"fetch\");patch(window,\"WebSocket\");patch(window,\"EventSource\");\ntry{var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){return open.call(this,method,map(url));};}catch(e){}\ntry{var imp=window.import;if(typeof imp===\"function\"){window.import=function(spec){return imp.call(window,map(spec));};}}catch(e){}\n})();\n<\/script>";
	const open = /<head\b[^>]*>/i.exec(html);
	if (open === null) return html;
	const at = open.index + open[0].length;
	return html.slice(0, at) + shim + html.slice(at);
}
/** Fetch one target URL and write the rewritten response to the browser. */
async function proxyTarget(target, res) {
	if (!isProxiable(target)) {
		res.writeHead(400, { "content-type": "text/plain" });
		res.end("unsupported scheme");
		return;
	}
	let response;
	try {
		response = await fetch(target);
	} catch {
		res.writeHead(502, { "content-type": "text/plain" });
		res.end("proxy request failed");
		return;
	}
	const contentType = response.headers.get("content-type") ?? "application/octet-stream";
	let buffer = Buffer.from(await response.arrayBuffer());
	if (isHtml(contentType)) {
		let html = buffer.toString("utf8");
		html = rewriteHtml(html, target);
		html = injectShim(html, target);
		buffer = Buffer.from(html, "utf8");
	} else if (isCss(contentType)) buffer = Buffer.from(rewriteCssUrls(buffer.toString("utf8"), target), "utf8");
	res.writeHead(response.status, {
		"content-type": contentType,
		"content-length": buffer.length,
		"cache-control": "no-store"
	});
	res.end(buffer);
}
/**
* Register the design-preview proxy route, when a browser web server is present.
* @param ctx - the host context.
*/
function registerDesignProxy(ctx) {
	ctx.inject(["webServer"], (webCtx) => {
		const webServer = webCtx.get("webServer");
		if (webServer === void 0) return;
		webCtx.effect(() => webServer.register({
			kind: "prefix",
			path: DESIGN_PROXY_PATH,
			handler: (req, res) => {
				const segment = new URL(req.url ?? "/", "http://x").pathname.slice(16);
				if (segment === "") {
					res.writeHead(400, { "content-type": "text/plain" });
					res.end("url required");
					return;
				}
				let target;
				try {
					target = decodeUrl(segment);
				} catch {
					res.writeHead(400, { "content-type": "text/plain" });
					res.end("invalid url");
					return;
				}
				return proxyTarget(target, res);
			}
		}), "design: proxy route");
	});
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
	registerDesignProxy(ctx);
}
//#endregion
export { apply, inject, name };
