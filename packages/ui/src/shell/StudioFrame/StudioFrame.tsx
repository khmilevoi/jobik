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
}

export function StudioFrame(props: StudioFrameProps) {
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
    </div>
  )
}
