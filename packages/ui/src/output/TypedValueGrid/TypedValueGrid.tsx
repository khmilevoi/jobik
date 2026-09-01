import { reatomComponent } from '@reatom/react'
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

/** A web address the design paints in the accent tone — the scheme has to be one a browser follows. */
const WEB_URL = /^https?:\/\//i

/**
 * `cdn.jobik.dev/p/219/cover.png` — the artboard's own `url` cell, which carries no scheme. The
 * path segment is what separates it from a dotted identifier like `render.image` or a duration
 * like `2.4s`, so it is required rather than optional.
 */
const BARE_WEB_URL = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i

/** `sha256:`, `data:`, `urn:` — anything `scheme:opaque` that is not a web address. */
const OPAQUE_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * `number` for a number, `url` for a web address, `opaque` for a non-web `scheme:` string,
 * `text` otherwise.
 *
 * The two cells the artboard uses to demonstrate the tone system (design 2177, 2181) are the
 * whole specification here: `cdn.jobik.dev/p/219/cover.png` is accent mono `url`, and
 * `sha256:9f2c…d41a` is muted `opaque`. A bare `URL.canParse` inverts both — it rejects the
 * schemeless host/path and accepts *any* `scheme:opaque` string, so the checksum came out accent
 * and read as a link. The protocol check is what fixes it, and it is also what gives `opaque` its
 * first derivation; the tone stays overridable through {@link TypedValue.tone}.
 */
export function resolveTypedValueTone(value: string | number): TypedValueTone {
  if (typeof value === 'number') return 'number'
  if (WEB_URL.test(value) && URL.canParse(value)) return 'url'
  if (OPAQUE_SCHEME.test(value)) return 'opaque'
  return BARE_WEB_URL.test(value) ? 'url' : 'text'
}

const tones = {
  text: s.text,
  url: s.url,
  number: s.number,
  opaque: s.opaque,
} satisfies Record<TypedValueTone, string>

/** design 936–947 — the two-column grid of the run's non-binary fields. */
export const TypedValueGrid = reatomComponent(function TypedValueGrid(props: TypedValueGridProps) {
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
}, 'TypedValueGrid')
