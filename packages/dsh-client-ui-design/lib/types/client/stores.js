/**
 * Design-mode interaction store: the transient viewing state behind the
 * sidebar toggle and the full-frame design overlay. Both entries are
 * root-scope, so they share the single handle constructed in `apply`. The
 * URL and its history persist across reloads; `selection` is deliberately
 * transient and lives in the overlay component instead.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Default preview URL; editable from the design panel header. */
export const DEFAULT_PREVIEW_URL = 'http://localhost:3000';
/** Maximum entries retained in the preview URL history. */
export const URL_HISTORY_MAX = 10;
/** Default chat-column width (viewport percentage). */
export const CHAT_WIDTH_DEFAULT = 25;
/** Minimum chat-column width (viewport percentage). */
export const CHAT_WIDTH_MIN = 15;
/** Maximum chat-column width (viewport percentage). */
export const CHAT_WIDTH_MAX = 60;
/**
 * Create the design-mode store handle. Constructed once in `apply` and shared
 * by the toggle and overlay registrations; never exported at module level.
 * @returns the shared store handle.
 */
export function createDesignStore() {
    return defineStore({
        init: () => ({ active: false, url: DEFAULT_PREVIEW_URL, selectMode: true, urlHistory: [], chatWidth: CHAT_WIDTH_DEFAULT }),
        persist: 'dsh-design-v2',
        actions: {
            setActive: (draft, active) => { draft.active = active; },
            setSelectMode: (draft, selectMode) => { draft.selectMode = selectMode; },
            commitUrl: (draft, url) => {
                const trimmed = url.trim();
                if (trimmed === '')
                    return;
                draft.url = trimmed;
                draft.urlHistory = [trimmed, ...draft.urlHistory.filter(item => item !== trimmed)].slice(0, URL_HISTORY_MAX);
            },
            setChatWidth: (draft, chatWidth) => {
                draft.chatWidth = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, chatWidth));
            },
        },
    });
}
//# sourceMappingURL=stores.js.map