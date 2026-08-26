/**
 * Composed component props for the design-mode entries. Types only: the owner
 * shares come from the declaring packages, the store share from the design
 * store handle.
 */
import type { PropsRuntime, PropsStore, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import type { CitationSnapshot } from '../cite.ts';
import type { createDesignStore, DesignSelection } from '../stores.ts';
/** The shared store handle type, derived from the factory. */
export type DesignStore = ReturnType<typeof createDesignStore>;
/** Inject face of the design-mode overlay entry. */
export interface DesignModeInjected {
    /** Insert one captured selection as an inline reference into the composer. */
    citeSelection: (selection: DesignSelection) => void;
    /** Remove the citation for one element id from the composer. */
    removeCitation: (id: string) => void;
    /** Selector over the citation controller (external-removal signal). */
    useCitation: SnapshotSelectorHook<CitationSnapshot>;
}
/** Props of the full-frame design-mode overlay entry. */
export type DesignModeProps = PropsRuntime<'shell.overlay'> & PropsStore<DesignStore> & DesignModeInjected;
/** Props of the sidebar footer toggle entry. */
export type DesignToggleProps = PropsRuntime<'sidebar.footer.action'> & PropsStore<DesignStore>;
//# sourceMappingURL=slots.d.ts.map