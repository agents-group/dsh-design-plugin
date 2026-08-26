/** Sidebar footer toggle for design mode (icon-only in the collapsed rail). */
import type { FC, ReactElement } from 'react'
import type { DesignToggleProps } from './contract/slots.ts'
import css from './DesignToggle.module.css'

/** Palette glyph. */
const PaletteIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
)

export const DesignToggle: FC<DesignToggleProps> = ({ useStore, actions, wide }) => {
  const active = useStore(s => s.active)
  return (
    <>
      <button
        type="button"
        className={css.button}
        data-active={active || undefined}
        aria-pressed={active}
        title={active ? '退出设计模式' : '进入设计模式'}
        onClick={() => actions.setActive(!active)}
      >
        <span className={css.icon}><PaletteIcon /></span>
        {wide ? <span className={css.label}>{active ? '退出设计模式' : '设计模式'}</span> : null}
      </button>
      {wide ? <div className={css.separator} aria-hidden="true" /> : null}
    </>
  )
}
