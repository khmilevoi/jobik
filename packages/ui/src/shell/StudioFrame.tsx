import type { CSSProperties, ReactNode } from 'react'
import { StudioStyles } from '../globalStyles.js'
import { accent as accentTokens, borders, fontFamilies, px, radii, surfaces } from '../tokens.js'

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

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
  const frameStyle: StyleWithVars = {
    '--accent': props.accent ?? accentTokens.base,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: surfaces.shell,
    border: `1px solid ${borders.frame}`,
    borderRadius: px(radii.panel),
    fontFamily: fontFamilies.ui,
  }
  return (
    <div data-jobik-studio="" data-testid="studio-frame" style={frameStyle}>
      <StudioStyles />
      {props.topBar}
      <div data-testid="studio-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {props.left}
        {props.canvas}
        {props.right}
      </div>
    </div>
  )
}
