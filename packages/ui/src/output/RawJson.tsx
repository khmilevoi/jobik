import { fontFamilies, px, textColors } from '../tokens.js'
import { outputMetrics } from './outputTokens.js'
import { formatRawJson, rawJsonToneColors } from './rawJsonFormat.js'

export interface RawJsonProps {
  readonly value: unknown
  readonly 'data-testid'?: string
}

/** design 963–976 — the `Raw` tab: the serialised report as line-numbered, coloured mono. */
export function RawJson(props: RawJsonProps) {
  const lines = formatRawJson(props.value)
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        padding: px(outputMetrics.rawPadding),
        fontFamily: fontFamilies.mono,
        fontSize: px(10.5),
        lineHeight: outputMetrics.rawLineHeight,
        color: textColors.inactiveListItem,
      }}
    >
      {lines.map((line) => (
        <div key={line.number} data-testid="raw-json-line" style={{ whiteSpace: 'pre' }}>
          <span data-testid="raw-json-gutter" style={{ color: textColors.sectionLabel }}>
            {line.number}{' '}
          </span>
          {'  '.repeat(line.indent)}
          {line.segments.map((segment, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments have no stable identity within a line
              key={`${line.number}-${index}`}
              style={{ color: rawJsonToneColors[segment.tone] }}
            >
              {segment.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
