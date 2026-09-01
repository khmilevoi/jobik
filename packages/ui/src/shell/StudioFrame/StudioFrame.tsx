import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import type { StyleWithVars } from '#cx.js'
import { StudioStyles } from '#globalStyles.js'
import { accent as accentTokens } from '#tokens.js'
import s from './StudioFrame.module.css'

export interface StudioFrameProps {
  /** `#1fd6bd` by default. The design also ships `accentAlternates`. */
  readonly accent?: string
  readonly topBar: ReactNode
  /** Omitted entirely when the left panel is collapsed. */
  readonly left?: ReactNode
  /** Filled by P7. This plan passes a placeholder. */
  readonly canvas: ReactNode
  /** Omitted entirely when the right dock is collapsed. */
  readonly right?: ReactNode
  /**
   * `3D` — the status or problems strip, under the three columns and across the full width.
   *
   * That is where §3D.3 puts it: both demo boards are a reduced Studio whose strip is the last
   * child of the frame's own column, spanning everything, below the canvas and beside nothing.
   * It is absent until a check has produced a result, which is why the other artboards draw no
   * strip at all — see `StatusStrip`.
   */
  readonly status?: ReactNode
}

/**
 * A `reatomComponent` with an unchanged prop API: it holds no state and there is no atom for a
 * frame to read, so wrapping it buys uniformity and the option of an `Atom<T>` prop later — not a
 * model read. Every value it draws still arrives from `Studio`.
 */
export const StudioFrame = reatomComponent(function StudioFrame(props: StudioFrameProps) {
  const style: StyleWithVars = { '--accent': props.accent ?? accentTokens.base }
  return (
    <div data-jobik-studio="" data-testid="studio-frame" className={s.frame} style={style}>
      <StudioStyles />
      {props.topBar}
      <div data-testid="studio-body" className={s.body}>
        {props.left}
        {props.canvas}
        {props.right}
      </div>
      {props.status}
    </div>
  )
}, 'StudioFrame')
