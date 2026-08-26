import type { Context } from '@deepseek-ai/cordis';
/** Route prefix the design client rewrites the preview iframe src to. */
export declare const DESIGN_PROXY_PATH = "/__design/proxy";
/**
 * Register the design-preview proxy route, when a browser web server is present.
 * @param ctx - the host context.
 */
export declare function registerDesignProxy(ctx: Context): void;
//# sourceMappingURL=proxy.d.ts.map