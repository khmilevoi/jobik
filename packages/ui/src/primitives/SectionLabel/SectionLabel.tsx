import type { CSSProperties, ReactNode } from 'react'
import { cx, type StyleWithVars } from '../../cx.js'
import s from './SectionLabel.module.css'

export interface SectionLabelProps {
  readonly children: ReactNode
  /** Defaults to the section-label step. The panel header passes `textColors.panelHeaderLabel`. */
  readonly color?: string
  /** Layout only — padding, width, flex. Never a colour or a font size. */
  readonly className?: string
  /**
   * @deprecated Layout only, and only until the caller's own directory is migrated. Pass a
   * `className` from the caller's `*.module.css` instead; this prop goes away once nothing uses it.
   */
  readonly style?: CSSProperties
  readonly 'data-testid'?: string
}

export function SectionLabel(props: SectionLabelProps) {
  // The caller's colour is a value the stylesheet cannot know, so it rides in as a custom property
  // the rule already reads. `props.style` still merges last, exactly as it did when the whole
  // label was an inline style object.
  const style: StyleWithVars | CSSProperties | undefined =
    props.color === undefined
      ? props.style
      : { '--jbk-section-label-color': props.color, ...props.style }
  return (
    <div
      data-testid={props['data-testid']}
      className={cx(s.sectionLabel, props.className)}
      style={style}
    >
      {props.children}
    </div>
  )
}
