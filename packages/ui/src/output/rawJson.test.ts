import { describe, expect, it } from 'vitest'
import { accent, statusColors, textColors } from '../tokens.js'
import { formatRawJson, rawJsonToneColors } from './rawJson.js'

/** The report the artboard's Raw panel serialises, design lines 964–975. */
const artboardReport = {
  run: 219,
  status: 'completed',
  ms: 2412,
  image: { type: 'Buffer', bytes: 654336, mime: 'image/png' },
  caption: 'Release 0.4 — field…',
  skipped: [],
}

function plain(lines: readonly { indent: number; segments: readonly { text: string }[] }[]) {
  return lines.map(
    (line) => `${'  '.repeat(line.indent)}${line.segments.map((s) => s.text).join('')}`,
  )
}

describe('formatRawJson', () => {
  it('reproduces the artboard panel line for line', () => {
    const lines = formatRawJson(artboardReport)
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(plain(lines)).toEqual([
      '{',
      '  "run": 219,',
      '  "status": "completed",',
      '  "ms": 2412,',
      '  "image": {',
      '    "type": "Buffer",',
      '    "bytes": 654336,',
      '    "mime": "image/png"',
      '  },',
      '  "caption": "Release 0.4 — field…",',
      '  "skipped": []',
      '}',
    ])
  })

  it('tags a string value accent and a scalar literal', () => {
    const lines = formatRawJson({ mime: 'image/png', bytes: 654336 })
    expect(lines[1].segments.map((s) => s.tone)).toEqual([
      'key',
      'punctuation',
      'string',
      'punctuation',
    ])
    expect(lines[2].segments.map((s) => s.tone)).toEqual(['key', 'punctuation', 'literal'])
  })

  it('tags a run status with its status colour', () => {
    expect(formatRawJson({ status: 'completed' })[1].segments[2].tone).toBe('ok')
    expect(formatRawJson({ status: 'failed' })[1].segments[2].tone).toBe('failed')
    expect(formatRawJson({ status: 'anything else' })[1].segments[2].tone).toBe('string')
    expect(formatRawJson({ other: 'completed' })[1].segments[2].tone).toBe('string')
  })

  it('keeps an empty container on one line and expands a full one', () => {
    expect(plain(formatRawJson({ a: [], b: {} }))).toEqual(['{', '  "a": [],', '  "b": {}', '}'])
    expect(plain(formatRawJson({ a: [1, 2] }))).toEqual([
      '{',
      '  "a": [',
      '    1,',
      '    2',
      '  ]',
      '}',
    ])
  })

  it('handles a bare scalar, null and a top-level array', () => {
    expect(plain(formatRawJson(4))).toEqual(['4'])
    expect(plain(formatRawJson(null))).toEqual(['null'])
    expect(plain(formatRawJson(['a']))).toEqual(['[', '  "a"', ']'])
  })
})

describe('rawJsonToneColors', () => {
  it('takes every colour from the token layers', () => {
    expect(rawJsonToneColors).toEqual({
      punctuation: textColors.inactiveListItem,
      key: textColors.inactiveListItem,
      string: accent.cssVar,
      literal: textColors.activeFieldLabel,
      ok: statusColors.ok,
      failed: statusColors.failed,
    })
  })
})
