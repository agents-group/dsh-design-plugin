/**
 * Design-mode interaction store: the transient viewing state behind the
 * sidebar toggle and the full-frame design overlay. Both entries are
 * root-scope, so they share the single handle constructed in `apply`. The
 * URL and its history persist across reloads; `selection` is deliberately
 * transient and lives in the overlay component instead.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** A captured element selection from the preview iframe (transient, component-local). */
export interface DesignSelection {
  /** Stable identity minted by the preview bridge; keys the 1:1 citation map. */
  id: string
  /** Selected text copied out of the live document (bounded). */
  text: string
  /** A short CSS selector path for the selected element. */
  selector: string
  /** Lowercase tag name of the selected element. */
  tagName: string
  /** The iframe document URL at selection time. */
  href: string
}

/** Transient design-mode state; `url`, `urlHistory`, and `chatWidth` persist across reloads. */
export interface DesignState {
  /** Whether design mode is active. */
  active: boolean
  /** The iframe preview URL. */
  url: string
  /** Whether element-selection mode is on (hover highlight + click to select). */
  selectMode: boolean
  /** Most-recent-first preview URL history (bounded). */
  urlHistory: string[]
  /** Chat-column width as a viewport percentage (resizable via the divider). */
  chatWidth: number
}

/** Complete write set for the design store (immer-draft transforms). */
export type DesignActions = {
  setActive: (draft: DesignState, active: boolean) => void
  setSelectMode: (draft: DesignState, selectMode: boolean) => void
  /** Set the preview URL and record it at the head of the history. */
  commitUrl: (draft: DesignState, url: string) => void
  /** Set the chat-column width percentage (clamped). */
  setChatWidth: (draft: DesignState, chatWidth: number) => void
}

/** Default preview URL; editable from the design panel header. */
export const DEFAULT_PREVIEW_URL = 'http://localhost:3000'

/** Maximum entries retained in the preview URL history. */
export const URL_HISTORY_MAX = 10

/** Default chat-column width (viewport percentage). */
export const CHAT_WIDTH_DEFAULT = 25
/** Minimum chat-column width (viewport percentage). */
export const CHAT_WIDTH_MIN = 15
/** Maximum chat-column width (viewport percentage). */
export const CHAT_WIDTH_MAX = 60

/**
 * Create the design-mode store handle. Constructed once in `apply` and shared
 * by the toggle and overlay registrations; never exported at module level.
 * @returns the shared store handle.
 */
export function createDesignStore(): EngineStoreHandle<DesignState, DesignActions> {
  return defineStore({
    init: (): DesignState => ({ active: false, url: DEFAULT_PREVIEW_URL, selectMode: true, urlHistory: [], chatWidth: CHAT_WIDTH_DEFAULT }),
    persist: 'dsh-design-v2',
    actions: {
      setActive: (draft, active: boolean) => { draft.active = active },
      setSelectMode: (draft, selectMode: boolean) => { draft.selectMode = selectMode },
      commitUrl: (draft, url: string) => {
        const trimmed = url.trim()
        if (trimmed === '') return
        draft.url = trimmed
        draft.urlHistory = [trimmed, ...draft.urlHistory.filter(item => item !== trimmed)].slice(0, URL_HISTORY_MAX)
      },
      setChatWidth: (draft, chatWidth: number) => {
        draft.chatWidth = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, chatWidth))
      },
    },
  })
}
