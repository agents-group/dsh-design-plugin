/**
 * Browser design-mode plugin: registers the sidebar toggle and the full-frame
 * overlay, seats the shared design store, and injects the reflow stylesheet.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CitationController, makeCiteSelection, makeRemoveCitation, registerDesignSource, watchCitationRemoval } from './cite.ts'
import { DesignMode } from './DesignMode.tsx'
import { DesignToggle } from './DesignToggle.tsx'
import { createDesignStore } from './stores.ts'
import styles from './styles.css?inline'

/** Slot registry required by this presentation plugin. */
export const inject = ['slots']

/**
 * Register the design-mode surface without exporting React components as
 * package values. The toggle and overlay share one root-scope store handle.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const store = createDesignStore()
  registerDesignSource(ctx)
  const citation = new CitationController()
  watchCitationRemoval(ctx, citation)
  const citeSelection = makeCiteSelection(ctx, citation)
  const removeCitation = makeRemoveCitation(ctx, citation)

  // Global reflow stylesheet, owned by this plugin's lifetime.
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-design'
      tag.dataset.pluginCss = '@deepseek-ai/dsh-client-ui-design/styles.css'
      tag.textContent = styles
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }, 'ui-design: stylesheet')
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'design',
    order: 30,
    label: '设计模式',
    store,
  }, DesignToggle))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'design',
    order: 50,
    store,
    inject: () => ({ citeSelection, removeCitation, hooks: { citation } }),
  }, DesignMode))
}
