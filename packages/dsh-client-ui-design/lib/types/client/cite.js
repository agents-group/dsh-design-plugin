/** Source name keying the `design` reference codec. */
const DESIGN_SOURCE = 'design';
/**
 * Tracks the id→ref pairs of every active citation and signals the overlay
 * when one of them disappears from the composer.
 */
export class CitationController {
    active = new Map();
    snapshot = { clearSeq: 0, clearedId: null };
    listeners = new Set();
    getSnapshot = () => this.snapshot;
    subscribe = (fn) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };
    emit() {
        for (const fn of [...this.listeners])
            fn();
    }
    /** The ref of one active citation by element id, or undefined. */
    refOf(id) {
        return this.active.get(id);
    }
    /** Register an active citation's id→ref pair. */
    add(id, ref) {
        this.active.set(id, ref);
    }
    /** Forget one active citation by element id (local insert/remove). */
    remove(id) {
        this.active.delete(id);
    }
    /** Snapshot the active id→ref pairs (safe to mutate while iterating). */
    entries() {
        return [...this.active.entries()];
    }
    /** An active citation was removed externally: forget it and signal the overlay. */
    requestClear(id) {
        this.active.delete(id);
        this.snapshot = { clearSeq: this.snapshot.clearSeq + 1, clearedId: id };
        this.emit();
    }
}
/** Truncate a citation label to a chip-friendly length. */
function selectionLabel(selection) {
    const text = selection.text.trim();
    const base = text === '' ? selection.tagName : text.slice(0, 40);
    return base === '' ? '设计元素' : base;
}
/** Human-readable clipboard projection of one citation. */
function selectionClipboard(selection) {
    const parts = [`<${selection.tagName}>`, `"${selection.text}"`, selection.href];
    return parts.filter(part => part !== '' && part !== '<>').join(' ');
}
/** Model form of one citation: enough for the agent to locate and edit the source. */
function serializeDesignRef(ref) {
    try {
        const selection = JSON.parse(ref);
        return `<design-selection tag="${selection.tagName}" selector="${selection.selector}" href="${selection.href}">${selection.text}</design-selection>`;
    }
    catch {
        return `<design-selection>${ref}</design-selection>`;
    }
}
/** Resolve the current session's input facade, or undefined. */
function resolveInput(ctx) {
    const sessions = ctx.get('sessions');
    const conversation = ctx.get('conversation');
    if (sessions === undefined || conversation === undefined)
        return undefined;
    const sessionId = sessions.list.getSnapshot().current;
    if (sessionId === undefined)
        return undefined;
    const binding = sessions.binding(sessionId);
    if (binding === undefined)
        return undefined;
    try {
        return conversation.input.for(binding.ctx);
    }
    catch {
        return undefined;
    }
}
/**
 * Register the `design` reference source under the `@` roster. It contributes
 * no menu candidates; its codec is what serializes inserted citations on
 * submit.
 * @param ctx - Client root context.
 */
export function registerDesignSource(ctx) {
    const inputTriggers = ctx.get('inputTriggers');
    if (inputTriggers === undefined)
        return;
    ctx.effect(() => inputTriggers.registerSource({
        trigger: '@',
        name: DESIGN_SOURCE,
        showGroupTitle: false,
        candidates: async () => [],
        onPick: () => undefined,
        codec: {
            clipboardText: (ref) => ref,
            serialize: (ref) => Promise.resolve(serializeDesignRef(ref)),
        },
    }), 'ui-design: reference source');
}
/**
 * Build the callback that inserts one captured selection as an inline
 * reference into the current session's composer draft and registers its
 * id→ref pair.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 * @returns a stable insertion callback; a no-op when no session is current.
 */
export function makeCiteSelection(ctx, controller) {
    return (selection) => {
        const input = resolveInput(ctx);
        if (input === undefined)
            return;
        const ref = JSON.stringify(selection);
        controller.add(selection.id, ref);
        try {
            const snapshot = input.state.getSnapshot();
            input.insertReference({
                source: DESIGN_SOURCE,
                ref,
                label: selectionLabel(selection),
                clipboardText: selectionClipboard(selection),
            }, { start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev });
        }
        catch {
            // Cross-service insertion is best-effort; a missing facade or stale span no-ops.
        }
    };
}
/**
 * Build the callback that removes the citation for one element id.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 * @returns a stable removal callback; a no-op when the id is unknown.
 */
export function makeRemoveCitation(ctx, controller) {
    return (id) => {
        const ref = controller.refOf(id);
        if (ref === undefined)
            return;
        const input = resolveInput(ctx);
        if (input === undefined)
            return;
        controller.remove(id);
        try {
            const snapshot = input.state.getSnapshot();
            const occurrence = snapshot.occurrences.find(o => o.source === DESIGN_SOURCE && o.ref === ref);
            if (occurrence === undefined)
                return;
            const end = occurrence.offset + occurrence.length;
            // Also drop the separating space the machine appended after the chip, so
            // repeated select/remove cycles do not accumulate stray spaces. Passing
            // the exact edit range keeps the machine's occurrence update precise —
            // a bare setDraft would re-diff and misalign on the shared '@' prefix.
            const tailEnd = snapshot.draft[end] === ' ' ? end + 1 : end;
            input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(tailEnd), { start: occurrence.offset, end: tailEnd, insertedLength: 0 });
        }
        catch {
            // Best-effort: a stale draft or missing facade no-ops.
        }
    };
}
/**
 * Watch the current session's input state; when any active citation's
 * occurrence disappears (the user deleted the chip), signal the overlay so it
 * clears the matching iframe selection.
 * @param ctx - Client root context.
 * @param controller - the citation controller tracking active id→ref pairs.
 */
export function watchCitationRemoval(ctx, controller) {
    const sessions = ctx.get('sessions');
    const conversation = ctx.get('conversation');
    if (sessions === undefined || conversation === undefined)
        return;
    let inputOff;
    const attach = () => {
        if (inputOff !== undefined) {
            inputOff();
            inputOff = undefined;
        }
        const sessionId = sessions.list.getSnapshot().current;
        if (sessionId === undefined)
            return;
        const binding = sessions.binding(sessionId);
        if (binding === undefined)
            return;
        let input;
        try {
            input = conversation.input.for(binding.ctx);
        }
        catch {
            return;
        }
        inputOff = input.state.subscribe(() => {
            const occurrences = input.state.getSnapshot().occurrences;
            for (const [id, ref] of controller.entries()) {
                if (!occurrences.some(o => o.source === DESIGN_SOURCE && o.ref === ref)) {
                    controller.requestClear(id);
                }
            }
        });
    };
    const offList = sessions.list.subscribe(attach);
    attach();
    ctx.effect(() => () => {
        offList();
        if (inputOff !== undefined)
            inputOff();
    }, 'ui-design: citation removal watch');
}
//# sourceMappingURL=cite.js.map