/**
 * Same-origin HTTP proxy for the design-mode preview iframe.
 *
 * Design mode previews the user's app in an iframe. When that app is on a
 * different origin (e.g. localhost:3000 while DSH serves on :3080), the browser
 * blocks the overlay from injecting the selection bridge and reading the DOM, so
 * element selection is unavailable. Serving the preview through this same-origin
 * route makes the iframe same-origin, so the overlay can inject the bridge and
 * selection works.
 *
 * For HTML responses it injects a <base href="<target origin>/"> so the page's
 * relative assets, links, and fetches resolve against the real target instead of
 * the DSH origin. The user-facing address bar keeps showing the original target
 * URL; only the iframe src is rewritten to this route.
 * @module @dpsagent/dsh-design-plugin/proxy
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** The route path the design client rewrites the preview iframe src to. Keep in sync with DesignMode.tsx. */
export const DESIGN_PROXY_PATH = '/api/design.proxy'

/** Minimal shape of the webServer route-registration service the plugin needs. */
interface WebServerRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebServerRoute): () => void
}

/** Whether a response body is an HTML document (may need a <base>). */
function isHtml(contentType: string | null): boolean {
  return contentType !== null && /text\/html/i.test(contentType)
}

/** Escape a base URL for a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/** Inject a <base> tag after the opening <head>, skipping documents that already have one. */
function injectBase(html: string, base: string): string {
  if (/<base\b/i.test(html)) return html
  const open = /<head\b[^>]*>/i.exec(html)
  if (open === null) return html
  const tag = '<base href="' + escapeAttr(base) + '">'
  const at = open.index + open[0].length
  return html.slice(0, at) + tag + html.slice(at)
}

/** Fetch one target URL and write the response to the browser. */
async function proxyTarget(target: string, res: ServerResponse): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' })
    res.end('invalid url')
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
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
    buffer = Buffer.from(injectBase(buffer.toString('utf8'), parsed.origin + '/'), 'utf8')
  }

  res.writeHead(response.status, {
    'content-type': contentType,
    'content-length': buffer.length,
    'cache-control': 'no-store',
  })
  res.end(buffer)
}

/**
 * Register the design-preview proxy route on the browser web server, when one is
 * present. On compositions without a browser server (e.g. headless) this is a no-op.
 * @param ctx - the host context.
 */
export function registerDesignProxy(ctx: Context): void {
  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: DESIGN_PROXY_PATH,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      const requestUrl = new URL(req.url ?? '/', 'http://x')
      const target = requestUrl.searchParams.get('url')
      if (target === null) {
        res.writeHead(400, { 'content-type': 'text/plain' })
        res.end('url required')
        return
      }
      return proxyTarget(target, res)
    },
  }), 'design: proxy route')
}
