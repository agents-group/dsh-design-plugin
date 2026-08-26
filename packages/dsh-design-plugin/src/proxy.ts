/**
 * URL-rewriting reverse proxy for the design-mode preview iframe.
 *
 * Design mode previews the user's app in an iframe. To let the overlay read the
 * iframe DOM (element selection) the preview must be same-origin with DSH, so
 * every resource is served through this route instead of the target origin.
 *
 * Each proxied request encodes the complete target URL in the path:
 *   /__design/proxy/<base64url(absolute-url)>
 * Responses are rewritten so their subresources also route through the proxy:
 *   - HTML: src/href/action/poster/data-src/data-href/srcset attributes and
 *     url(...) inside inline style="..." and <style> blocks;
 *   - CSS: url(...);
 *   - a <head> shim patches fetch / XHR.open / WebSocket / EventSource / dynamic
 *     import() so JavaScript URL references follow the same mapping.
 * Relative references resolve against the current response's absolute URL, so a
 * page keeps working while its origin is DSH.
 *
 * The user-facing address bar keeps the original target URL; only the iframe src
 * is rewritten. Scheme-guarded to http(s) only.
 * @module @dpsagent/dsh-design-plugin/proxy
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** Route prefix the design client rewrites the preview iframe src to. */
export const DESIGN_PROXY_PATH = '/__design/proxy'

const PROXY_PREFIX = '/__design/proxy/'

function encodeUrl(url: string): string {
  return Buffer.from(url, 'utf8').toString('base64url')
}

function decodeUrl(segment: string): string {
  return Buffer.from(segment, 'base64url').toString('utf8')
}

function isHtml(contentType: string | null): boolean {
  return contentType !== null && /text\/html/i.test(contentType)
}

function isCss(contentType: string | null): boolean {
  return contentType !== null && /text\/css/i.test(contentType)
}

/** Schemes the proxy will not fetch (and that must not be rewritten). */
function isProxiable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Map one URL reference found in a proxied response to its proxy URL. */
function rewriteRef(ref: string, base: string): string {
  const trimmed = ref.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return ref
  if (/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(trimmed)) return ref
  let absolute: string
  try {
    absolute = new URL(trimmed, base).href
  } catch {
    return ref
  }
  if (isProxiable(absolute)) return PROXY_PREFIX + encodeUrl(absolute)
  return ref
}

/** Rewrite url(...) occurrences inside CSS text. */
function rewriteCssUrls(css: string, base: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_match, quote, url) => {
    return 'url(' + quote + rewriteRef(url, base) + quote + ')'
  })
}

/** Rewrite URL-bearing HTML attributes and inline styles. */
function rewriteHtml(html: string, base: string): string {
  html = html.replace(/(style\s*=\s*")([^"]*)(")/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post)
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, pre, css, post) => pre + rewriteCssUrls(css, base) + post)
  html = html.replace(/\b(src|href|action|poster|data-src|data-href)\s*=\s*(["'])([^"']*)\2/gi, (_m, attr, quote, url) => attr + '=' + quote + rewriteRef(url, base) + quote)
  html = html.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/gi, (_m, quote, list) => {
    const rewritten = list.split(',').map((part: string) => {
      const tokens = part.trim().split(/\s+/)
      if (tokens.length === 0) return part
      tokens[0] = rewriteRef(tokens[0]!, base)
      return tokens.join(' ')
    }).join(', ')
    return 'srcset=' + quote + rewritten + quote
  })
  return html
}

/** Inject the JS URL-rewriting shim into the head of an HTML document. */
function injectShim(html: string, base: string): string {
  const shim = '<script data-dsh-proxy-shim>\n(function(){\n' +
    'var BASE=' + JSON.stringify(base) + ';\n' +
    'var PREFIX=' + JSON.stringify(PROXY_PREFIX) + ';\n' +
    'function b64url(s){var bytes=new TextEncoder().encode(s);var bin="";for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}return btoa(bin).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}\n' +
    'function map(u){if(typeof u!=="string"){return u;}var t=u.trim();if(!t||t[0]==="#"){return u;}if(/^(data|blob|javascript|mailto|about|chrome-extension|ws|wss):/i.test(t)){return u;}try{var abs=new URL(t,BASE).href;if(/^https?:/i.test(abs)){return PREFIX+b64url(abs);}}catch(e){}return u;}\n' +
    'function patch(target,name){if(!target||target.__dshPatched){return;}try{var orig=target[name];if(typeof orig!=="function"){return;}target[name]=function(){var args=[].slice.call(arguments);var i=name==="open"?1:0;if(typeof args[i]==="string"){args[i]=map(args[i]);}return orig.apply(this,args);};target.__dshPatched=true;}catch(e){}}\n' +
    'patch(window,"fetch");patch(window,"WebSocket");patch(window,"EventSource");\n' +
    'try{var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){return open.call(this,method,map(url));};}catch(e){}\n' +
    'try{var imp=window.import;if(typeof imp==="function"){window.import=function(spec){return imp.call(window,map(spec));};}}catch(e){}\n' +
    '})();\n</script>'
  const open = /<head\b[^>]*>/i.exec(html)
  if (open === null) return html
  const at = open.index + open[0].length
  return html.slice(0, at) + shim + html.slice(at)
}

/** Fetch one target URL and write the rewritten response to the browser. */
async function proxyTarget(target: string, res: ServerResponse): Promise<void> {
  if (!isProxiable(target)) {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('unsupported scheme')
    return
  }

  let response: Response
  try {
    response = await fetch(target)
  } catch {
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('proxy request failed')
    return
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  let buffer = Buffer.from(await response.arrayBuffer())

  if (isHtml(contentType)) {
    let html = buffer.toString('utf8')
    html = rewriteHtml(html, target)
    html = injectShim(html, target)
    buffer = Buffer.from(html, 'utf8')
  } else if (isCss(contentType)) {
    buffer = Buffer.from(rewriteCssUrls(buffer.toString('utf8'), target), 'utf8')
  }

  res.writeHead(response.status, {
    'content-type': contentType,
    'content-length': buffer.length,
    'cache-control': 'no-store',
  })
  res.end(buffer)
}

/** Minimal webServer route-registration shape the plugin needs. */
interface WebServerRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebServerRoute): () => void
}

/**
 * Register the design-preview proxy route, when a browser web server is present.
 * @param ctx - the host context.
 */
export function registerDesignProxy(ctx: Context): void {
  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: DESIGN_PROXY_PATH,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      const segment = pathname.slice(PROXY_PREFIX.length)
      if (segment === '') {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('url required')
        return
      }
      let target: string
      try {
        target = decodeUrl(segment)
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('invalid url')
        return
      }
      return proxyTarget(target, res)
    },
  }), 'design: proxy route')
}
