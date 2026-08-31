import type { ReactNode } from 'react'
import s from './PanelHeader.module.css'

export type ChevronDirection = 'left' | 'right'

const chevronPaths: Record<ChevronDirection, string> = {
  left: 'M5.5 1 2 4.5 5.5 8',
  right: 'M3.5 1 7 4.5 3.5 8',
}

export function Chevron(props: { readonly direction: ChevronDirection }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
      <path
        d={chevronPaths[props.direction]}
        className={s.chevronPath}
        fill="none"
        strokeWidth="1.2"
      />
    </svg>
  )
}

export interface PanelHeaderProps {
  readonly children: ReactNode
  /** Points away from the canvas: `left` on the sidebar, `right` on the run dock. */
  readonly chevron: ChevronDirection
  readonly onCollapse: () => void
  /** The accessible name of the collapse button. */
  readonly collapseLabel: string
  readonly 'data-testid'?: string
}

export function PanelHeader(props: PanelHeaderProps) {
  return (
    <div data-testid={props['data-testid']} className={s.header}>
      {props.children}
      <button
        type="button"
        aria-label={props.collapseLabel}
        onClick={props.onCollapse}
        className={s.collapseButton}
      >
        <Chevron direction={props.chevron} />
      </button>
    </div>
  )
}
