import type { CSSProperties } from 'react'
import { accent, fontFamilies, px, textColors } from '../tokens.js'
import { groupDigits } from './format.js'
import { outputMetrics } from './outputTokens.js'

/** The four value cells the `Typed values` grid prints (design 939–946). */
export type TypedValueTone = 'text' | 'url' | 'number' | 'opaque'

export interface TypedValue {
  readonly name: string
  readonly value: string | number
  /** Defaults to `resolveTypedValueTone`. `opaque` is never derived — pass it. */
  readonly tone?: TypedValueTone
}

export interface TypedValueGridProps {
  readonly values: readonly TypedValue[]
}

/** `number` for a number, `url` for a string that parses as an absolute URL, `text` otherwise. */
export function resolveTypedValueTone(value: string | number): TypedValueTone {
  if (typeof value === 'number') return 'number'
  return URL.canParse(value) ? 'url' : 'text'
}

const tones: Record<TypedValueTone, CSSProperties> = {
  text: { color: textColors.activeFieldLabel },
  url: { fontFamily: fontFamilies.mono, color: accent.cssVar },
  number: { fontFamily: fontFamilies.mono, color: textColors.activeFieldLabel },
  opaque: { fontFamily: fontFamilies.mono, color: textColors.inactiveListItem },
}

/** design 936–947 — the two-column grid of the run's non-binary fields. */
export function TypedValueGrid(props: TypedValueGridProps) {
  return (
    <div
      data-testid="output-typed-values"
      style={{
        display: 'grid',
        gridTemplateColumns: `${px(outputMetrics.typedValuesLabelWidth)} 1fr`,
        gap: `${px(outputMetrics.typedValuesRowGap)} ${px(outputMetrics.typedValuesColumnGap)}`,
        fontSize: px(11.5),
      }}
    >
      {props.values.map((entry) => {
        const tone = entry.tone ?? resolveTypedValueTone(entry.value)
        const text = typeof entry.value === 'number' ? groupDigits(entry.value) : entry.value
        return (
          <div key={entry.name} style={{ display: 'contents' }}>
            <div
              data-testid="output-typed-name"
              style={{ fontFamily: fontFamilies.mono, color: textColors.muted }}
            >
              {entry.name}
            </div>
            <div data-testid="output-typed-value" style={tones[tone]}>
              {text}
            </div>
          </div>
        )
      })}
    </div>
  )
}
