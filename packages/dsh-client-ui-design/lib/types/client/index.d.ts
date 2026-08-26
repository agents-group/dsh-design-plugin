/**
 * Browser design-mode plugin: registers the sidebar toggle and the full-frame
 * overlay, seats the shared design store, and injects the reflow stylesheet.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Slot registry required by this presentation plugin. */
export declare const inject: string[];
/**
 * Register the design-mode surface without exporting React components as
 * package values. The toggle and overlay share one root-scope store handle.
 * @param ctx - Client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map