/**
 * Package-owned invariant companion for `@dpsagent/dsh-client-ui-design`.
 * @module @dpsagent/dsh-client-ui-design/invariant
 */
const PACKAGE_NAME = '@dpsagent/dsh-client-ui-design';
/** Cordis companion plugin name. */
export const name = 'client-ui-design-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the design-mode surface is pure client presentation —
 * it contributes no cordis events, owns no cross-plugin mutable state, and
 * its interaction state lives in a registration-scoped store asserted directly
 * by component specs.
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