/** Route prefix the design client rewrites the preview iframe src to. */
export const DESIGN_PROXY_PATH = '/__design/proxy';
const PROXY_PREFIX = '/__design/proxy/';
function encodeUrl(url) {
    return Buffer.from(url, 'utf8').toString('base64url');
}
function decodeUrl(segment) {
    return Buffer.from(segment, 'base64url').toString('utf8');
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
    if (trimmed === '' || trimmed.startsWith('#'))
        return ref;
    if (/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(trimmed))
        return ref;
    let absolute;
    try {
        absolute = new URL(trimmed, base).href;
    }
    catch {
        return ref;
    }
    if (isProxiable(absolute))
        return PROXY_PREFIX + encodeUrl(absolute);
    return ref;
}
/** Rewrite url(...) occurrences inside CSS text. */
function rewriteCssUrls(css, base) {
    return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_match, quote, url) => {
        return 'url(' + quote + rewriteRef(url, base) + quote + ')';
    });
}
/** Rewrite URL-bearing HTML attributes and inline styles. */
function rewriteHtml(html, base) {
    html = html.replace(/(style\s*=\s*")([^"]*)(")/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post);
    html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post);
    html = html.replace(/\b(src|href|action|poster|data-src|data-href)\s*=\s*(["'])([^"']*)\2/gi, (_m, attr, quote, url) => attr + '=' + quote + rewriteRef(url, base) + quote);
    html = html.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/gi, (_m, quote, list) => {
        const rewritten = list.split(',').map((part) => {
            const tokens = part.trim().split(/\s+/);
            if (tokens.length === 0)
                return part;
            tokens[0] = rewriteRef(tokens[0], base);
            return tokens.join(' ');
        }).join(', ');
        return 'srcset=' + quote + rewritten + quote;
    });
    return html;
}
/** Inject the JS URL-rewriting shim into the head of an HTML document. */
function injectShim(html, base) {
    const shim = '<script data-dsh-proxy-shim>\n(function(){\n' +
        'var BASE=' + JSON.stringify(base) + ';\n' +
        'var PREFIX=' + JSON.stringify(PROXY_PREFIX) + ';\n' +
        'function b64url(s){var bytes=new TextEncoder().encode(s);var bin="";for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}return btoa(bin).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}\n' +
        'function map(u){if(typeof u!=="string"){return u;}var t=u.trim();if(!t||t[0]==="#"){return u;}if(/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(t)){return u;}try{var abs=new URL(t,BASE).href;if(/^https?:/i.test(abs)){return PREFIX+b64url(abs);}}catch(e){}return u;}\n' +
        'function patch(target,name){if(!target||target.__dshPatched){return;}try{var orig=target[name];if(typeof orig!=="function"){return;}target[name]=function(){var args=[].slice.call(arguments);var i=name==="open"?1:0;if(typeof args[i]==="string"){args[i]=map(args[i]);}return orig.apply(this,args);};target.__dshPatched=true;}catch(e){}}\n' +
        'patch(window,"fetch");patch(window,"WebSocket");patch(window,"EventSource");\n' +
        'try{var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){return open.call(this,method,map(url));};}catch(e){}\n' +
        'try{var imp=window.import;if(typeof imp==="function"){window.import=function(spec){return imp.call(window,map(spec));};}}catch(e){}\n' +
        '})();\n</script>';
    const open = /<head\b[^>]*>/i.exec(html);
    if (open === null)
        return html;
    const at = open.index + open[0].length;
    return html.slice(0, at) + shim + html.slice(at);
}
/** Fetch one target URL and write the rewritten response to the browser. */
async function proxyTarget(target, res) {
    if (!isProxiable(target)) {
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
        let html = buffer.toString('utf8');
        html = rewriteHtml(html, target);
        html = injectShim(html, target);
        buffer = Buffer.from(html, 'utf8');
    }
    else if (isCss(contentType)) {
        buffer = Buffer.from(rewriteCssUrls(buffer.toString('utf8'), target), 'utf8');
    }
    res.writeHead(response.status, {
        'content-type': contentType,
        'content-length': buffer.length,
        'cache-control': 'no-store',
    });
    res.end(buffer);
}
/**
 * Register the design-preview proxy route, when a browser web server is present.
 * @param ctx - the host context.
 */
export function registerDesignProxy(ctx) {
    const webServer = ctx.get('webServer');
    if (webServer === undefined)
        return;
    ctx.effect(() => webServer.register({
        kind: 'prefix',
        path: DESIGN_PROXY_PATH,
        handler: (req, res) => {
            const pathname = new URL(req.url ?? '/', 'http://x').pathname;
            const segment = pathname.slice(PROXY_PREFIX.length);
            if (segment === '') {
                res.writeHead(400, { 'content-type': 'text/plain' });
                res.end('url required');
                return;
            }
            let target;
            try {
                target = decodeUrl(segment);
            }
            catch {
                res.writeHead(400, { 'content-type': 'text/plain' });
                res.end('invalid url');
                return;
            }
            return proxyTarget(target, res);
        },
    }), 'design: proxy route');
}
//# sourceMappingURL=proxy.js.map