import { Fragment } from 'react'
import s from './ProseText.module.css'

/**
 * One run of body copy. `mono` marks an identifier the design sets inline in `JetBrains Mono`.
 *
 * `07-copy.md` §12: *"Prose refers to identifiers by setting them in mono inline, at the same size
 * and colour as the surrounding text (except the Cancel-run modal, which lifts them to `#c3c9ce`)."*
 */
export interface ProseSegment {
  readonly text: string
  readonly mono?: boolean
}

/** `inherit` keeps an identifier at the surrounding colour; `lifted` is the Cancel-run exception. */
export type ProseTone = 'inherit' | 'lifted'

export interface ProseTextProps {
  readonly segments: readonly ProseSegment[]
  readonly tone?: ProseTone
  /** Size, colour and line-height belong to the block that holds the sentence, not to this. */
  readonly className?: string
  readonly 'data-testid'?: string
}

/** Written out in full so a missing tone is a type error and every read is one the gate can see. */
const monoTones = {
  inherit: s.mono,
  lifted: s.monoLifted,
} satisfies Record<ProseTone, string>

/**
 * A sentence with mono identifiers inlined — the shape three of the four `3C` dialogs use for
 * their body copy, and the reason a finding's message is a segment list rather than a string.
 *
 * Keys are the segment's own text plus its occurrence number, so the Cancel-run sentence's two
 * `render` runs stay distinct without keying on an array index.
 */
export function ProseText(props: ProseTextProps) {
  const { tone = 'inherit' } = props
  const seen = new Map<string, number>()
  const keyed = props.segments.map((segment) => {
    const occurrence = (seen.get(segment.text) ?? 0) + 1
    seen.set(segment.text, occurrence)
    return { segment, key: `${occurrence}:${segment.text}` }
  })
  return (
    <span data-testid={props['data-testid']} className={props.className}>
      {keyed.map(({ segment, key }) =>
        segment.mono === true ? (
          <span key={key} className={monoTones[tone]}>
            {segment.text}
          </span>
        ) : (
          <Fragment key={key}>{segment.text}</Fragment>
        ),
      )}
    </span>
  )
}
