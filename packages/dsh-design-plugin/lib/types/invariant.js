/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-design-plugin`.
 * @module @deepseek-ai/dsh-design-plugin/invariant
 */
const PACKAGE_NAME = '@deepseek-ai/dsh-design-plugin';
/** Cordis companion plugin name. */
export const name = 'design-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the design plugin owns no cross-plugin mutable state
 * and emits no cordis events — it registers one tool and one prompt section,
 * both asserted directly by the assembled application transcript.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map