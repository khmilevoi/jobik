import { formatRawJson, type RawJsonTone } from '../rawJsonFormat.js'
import s from './RawJson.module.css'

export interface RawJsonProps {
  readonly value: unknown
  readonly 'data-testid'?: string
}

/**
 * The tone a segment reads. This stays a local class map rather than `rawJsonToneColors` from
 * `rawJsonFormat.js` — that export is a pure formatter's data (its own test pins it to the actual
 * token values, for a consumer outside the Studio's stylesheet) and is unaffected by this
 * migration. This map is `RawJson`'s own rendering concern.
 */
const toneClass = {
  punctuation: s.punctuation,
  key: s.key,
  string: s.string,
  literal: s.literal,
  ok: s.ok,
  failed: s.failed,
} satisfies Record<RawJsonTone, string>

/** design 963–976 — the `Raw` tab: the serialised report as line-numbered, coloured mono. */
export function RawJson(props: RawJsonProps) {
  const lines = formatRawJson(props.value)
  return (
    <div data-testid={props['data-testid']} className={s.rawJson}>
      {lines.map((line) => (
        <div key={line.number} data-testid="raw-json-line" className={s.line}>
          <span data-testid="raw-json-gutter" className={s.gutter}>
            {line.number}{' '}
          </span>
          {'  '.repeat(line.indent)}
          {line.segments.map((segment, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments have no stable identity within a line
              key={`${line.number}-${index}`}
              className={toneClass[segment.tone]}
            >
              {segment.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
