import type { Context } from '@deepseek-ai/cordis';
/** The route path the design client rewrites the preview iframe src to. Keep in sync with DesignMode.tsx. */
export declare const DESIGN_PROXY_PATH = "/api/design.proxy";
/**
 * Register the design-preview proxy route on the browser web server, when one is
 * present. On compositions without a browser server (e.g. headless) this is a no-op.
 * @param ctx - the host context.
 */
export declare function registerDesignProxy(ctx: Context): void;
//# sourceMappingURL=proxy.d.ts.map