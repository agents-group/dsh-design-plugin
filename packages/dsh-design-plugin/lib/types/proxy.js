/** The route path the design client rewrites the preview iframe src to. Keep in sync with DesignMode.tsx. */
export const DESIGN_PROXY_PATH = '/api/design.proxy';
/** Whether a response body is an HTML document (may need a <base>). */
function isHtml(contentType) {
    return contentType !== null && /text\/html/i.test(contentType);
}
/** Escape a base URL for a double-quoted HTML attribute. */
function escapeAttr(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
/** Inject a <base> tag after the opening <head>, skipping documents that already have one. */
function injectBase(html, base) {
    if (/<base\b/i.test(html))
        return html;
    const open = /<head\b[^>]*>/i.exec(html);
    if (open === null)
        return html;
    const tag = '<base href="' + escapeAttr(base) + '">';
    const at = open.index + open[0].length;
    return html.slice(0, at) + tag + html.slice(at);
}
/** Fetch one target URL and write the response to the browser. */
async function proxyTarget(target, res) {
    let parsed;
    try {
        parsed = new URL(target);
    }
    catch {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('invalid url');
        return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('unsupported scheme');
        return;
    }
    let response;
    try {
        response = await fetch(target);
    }
    catch {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('proxy request failed');
        return;
    }
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    let buffer = Buffer.from(await response.arrayBuffer());
    if (isHtml(contentType)) {
        buffer = Buffer.from(injectBase(buffer.toString('utf8'), parsed.origin + '/'), 'utf8');
    }
    res.writeHead(response.status, {
        'content-type': contentType,
        'content-length': buffer.length,
        'cache-control': 'no-store',
    });
    res.end(buffer);
}
/**
 * Register the design-preview proxy route on the browser web server, when one is
 * present. On compositions without a browser server (e.g. headless) this is a no-op.
 * @param ctx - the host context.
 */
export function registerDesignProxy(ctx) {
    const webServer = ctx.get('webServer');
    if (webServer === undefined)
        return;
    ctx.effect(() => webServer.register({
        kind: 'exact',
        path: DESIGN_PROXY_PATH,
        handler: (req, res) => {
            const requestUrl = new URL(req.url ?? '/', 'http://x');
            const target = requestUrl.searchParams.get('url');
            if (target === null) {
                res.writeHead(400, { 'content-type': 'text/plain' });
                res.end('url required');
                return;
            }
            return proxyTarget(target, res);
        },
    }), 'design: proxy route');
}
//# sourceMappingURL=proxy.js.map