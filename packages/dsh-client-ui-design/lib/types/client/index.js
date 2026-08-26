import { CitationController, makeCiteSelection, makeRemoveCitation, registerDesignSource, watchCitationRemoval } from "./cite.js";
import { DesignMode } from "./DesignMode.js";
import { DesignToggle } from "./DesignToggle.js";
import { createDesignStore } from "./stores.js";
import styles from './styles.css?inline';
/** Slot registry required by this presentation plugin. */
export const inject = ['slots'];
/**
 * Register the design-mode surface without exporting React components as
 * package values. The toggle and overlay share one root-scope store handle.
 * @param ctx - Client root context.
 */
export function apply(ctx) {
    const store = createDesignStore();
    registerDesignSource(ctx);
    const citation = new CitationController();
    watchCitationRemoval(ctx, citation);
    const citeSelection = makeCiteSelection(ctx, citation);
    const removeCitation = makeRemoveCitation(ctx, citation);
    // Global reflow stylesheet, owned by this plugin's lifetime.
    if (typeof document !== 'undefined') {
        ctx.effect(() => {
            const tag = document.createElement('style');
            tag.dataset.plugin = '@dpsagent/dsh-client-ui-design';
            tag.dataset.pluginCss = '@dpsagent/dsh-client-ui-design/styles.css';
            tag.textContent = styles;
            document.head.appendChild(tag);
            return () => { tag.remove(); };
        }, 'ui-design: stylesheet');
    }
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'design',
        order: 30,
        label: '设计模式',
        store,
    }, DesignToggle));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'design',
        order: 50,
        store,
        inject: () => ({ citeSelection, removeCitation, hooks: { citation } }),
    }, DesignMode));
}
//# sourceMappingURL=index.js.map