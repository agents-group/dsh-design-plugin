/**
 * Design plugin host half: registers the `design_locate_source` tool that maps
 * a captured element selection back to the workspace files that mention it,
 * plus the prompt section teaching the agent the design-mode workflow.
 * @module @deepseek-ai/dsh-design-plugin
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "design";
/** Services required before the tool and prompt section can register. */
export declare const inject: string[];
/**
 * Register the design-mode tool suite and workflow guidance.
 * @param ctx - plugin context; registrations are effects scoped to this plugin.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map