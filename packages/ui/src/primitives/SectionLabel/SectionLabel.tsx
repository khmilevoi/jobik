import type { ReactNode } from 'react'
import { cx, type StyleWithVars } from '../../cx.js'
import s from './SectionLabel.module.css'

export interface SectionLabelProps {
  readonly children: ReactNode
  /** Defaults to the section-label step. The panel header passes `textColors.panelHeaderLabel`. */
  readonly color?: string
  /** Layout only — padding, width, flex. Never a colour or a font size. */
  readonly className?: string
  readonly 'data-testid'?: string
}

export function SectionLabel(props: SectionLabelProps) {
  // The caller's colour is a value the stylesheet cannot know, so it rides in as a custom property
  // the rule already reads.
  const style: StyleWithVars | undefined =
    props.color === undefined ? undefined : { '--jbk-section-label-color': props.color }
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
