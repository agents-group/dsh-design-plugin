/**
 * Citation plumbing: registers a `design` reference source (so inserted
 * citations serialize on submit), builds the root-side insert/remove callbacks
 * that map captured element selections onto inline reference occurrences keyed
 * by element id, and watches the current session's input so an externally
 * removed citation clears the matching iframe selection.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { DesignSelection } from './stores.ts';
/** Observable snapshot the overlay reads to react to an external removal. */
export interface CitationSnapshot {
    /** Monotonic counter bumped when an active citation is removed externally. */
    clearSeq: number;
    /** The element id whose citation was removed externally (null when idle). */
    clearedId: string | null;
}
/**
 * Tracks the id→ref pairs of every active citation and signals the overlay
 * when one of them disappears from the composer.
 */
export declare class CitationController {
    private active;
    private snapshot;
    private listeners;
    getSnapshot: () => CitationSnapshot;
    subscribe: (fn: () => void) => (() => void);
    private emit;
    /** The ref of one active citation by element id, or undefined. */
    refOf(id: string): string | undefined;
    /** Register an active citation's id→ref pair. */
    add(id: string, ref: string): void;
    /** Forget one active citation by element id (local insert/remove). */
    remove(id: string): void;
    /** Snapshot the active id→ref pairs (safe to mutate while iterating). */
    entries(): Array<[string, string]>;
    /** An active citation was removed externally: forget it and signal the overlay. */
    requestClear(id: string): void;
}
/**
 * Register the `design` reference source under the `@` roster. It contributes
 * no menu candidates; its codec is what serializes inserted citations on
 * submit.
 * @param ctx - Client root context.
 */
export declare function registerDesignSource(ctx: ClientContext): void;
/**
 * Build the callback that inserts one captured selection as an inline
 * reference into the current session's composer draft and registers its
 * id→ref pair.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 * @returns a stable insertion callback; a no-op when no session is current.
 */
export declare function makeCiteSelection(ctx: ClientContext, controller: CitationController): (selection: DesignSelection) => void;
/**
 * Build the callback that removes the citation for one element id.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 * @returns a stable removal callback; a no-op when the id is unknown.
 */
export declare function makeRemoveCitation(ctx: ClientContext, controller: CitationController): (id: string) => void;
/**
 * Watch the current session's input state; when any active citation's
 * occurrence disappears (the user deleted the chip), signal the overlay so it
 * clears the matching iframe selection.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 */
export declare function watchCitationRemoval(ctx: ClientContext, controller: CitationController): void;
//# sourceMappingURL=cite.d.ts.map