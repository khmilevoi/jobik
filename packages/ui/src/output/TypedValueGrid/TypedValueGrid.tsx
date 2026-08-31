import { groupDigits } from '#output/format.js'
import s from './TypedValueGrid.module.css'

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

const tones = {
  text: s.text,
  url: s.url,
  number: s.number,
  opaque: s.opaque,
} satisfies Record<TypedValueTone, string>

/** design 936–947 — the two-column grid of the run's non-binary fields. */
export function TypedValueGrid(props: TypedValueGridProps) {
  return (
    <div data-testid="output-typed-values" className={s.grid}>
      {props.values.map((entry) => {
        const tone = entry.tone ?? resolveTypedValueTone(entry.value)
        const text = typeof entry.value === 'number' ? groupDigits(entry.value) : entry.value
        return (
          <div key={entry.name} className={s.entry}>
            <div data-testid="output-typed-name" className={s.name}>
              {entry.name}
            </div>
            <div data-testid="output-typed-value" className={tones[tone]}>
              {text}
            </div>
          </div>
        )
      })}
    </div>
  )
}
