import { accent, statusColors, textColors } from '#tokens.js'

/**
 * The mono syntax colouring of the artboard's `Raw` panel (design 963–975).
 *
 * `ok` is the one semantic cell the artboard prints: the string value of a `status` key reads
 * `"completed"` in the ok green (design 966). `failed` mirrors it with the failed colour the same
 * design file gives the `Run panel — states` failed header; no other key is ever semantic.
 */
export type RawJsonTone = 'punctuation' | 'key' | 'string' | 'literal' | 'ok' | 'failed'

export interface RawJsonSegment {
  readonly text: string
  readonly tone: RawJsonTone
}

export interface RawJsonLine {
  /** 1-based, printed in the gutter. */
  readonly number: number
  /** Nesting depth; the renderer prints two spaces per level. */
  readonly indent: number
  readonly segments: readonly RawJsonSegment[]
}

export const rawJsonToneColors: Readonly<Record<RawJsonTone, string>> = {
  punctuation: textColors.inactiveListItem,
  key: textColors.inactiveListItem,
  string: accent.cssVar,
  literal: textColors.activeFieldLabel,
  ok: statusColors.ok,
  failed: statusColors.failed,
}

const STATUS_TONES: Readonly<Record<string, RawJsonTone>> = {
  completed: 'ok',
  failed: 'failed',
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function punctuation(text: string): RawJsonSegment {
  return { text, tone: 'punctuation' }
}

function scalar(value: unknown, key: string | undefined): RawJsonSegment {
  if (typeof value === 'string') {
    const tone = key === 'status' ? (STATUS_TONES[value] ?? 'string') : 'string'
    return { text: JSON.stringify(value), tone }
  }
  return { text: JSON.stringify(value) ?? 'null', tone: 'literal' }
}

/** Serialise any JSON value into the artboard's numbered, tone-tagged lines. */
export function formatRawJson(value: unknown): readonly RawJsonLine[] {
  const lines: RawJsonLine[] = []

  const push = (indent: number, segments: readonly RawJsonSegment[]): void => {
    lines.push({ number: lines.length + 1, indent, segments })
  }

  const walk = (
    node: unknown,
    indent: number,
    lead: readonly RawJsonSegment[],
    comma: boolean,
    key: string | undefined,
  ): void => {
    const tail = comma ? [punctuation(',')] : []

    if (Array.isArray(node)) {
      if (node.length === 0) {
        push(indent, [...lead, { text: '[]', tone: 'literal' }, ...tail])
        return
      }
      push(indent, [...lead, punctuation('[')])
      for (const [index, item] of node.entries()) {
        walk(item, indent + 1, [], index < node.length - 1, undefined)
      }
      push(indent, [punctuation(']'), ...tail])
      return
    }

    if (isPlainObject(node)) {
      const entries = Object.entries(node)
      if (entries.length === 0) {
        push(indent, [...lead, { text: '{}', tone: 'literal' }, ...tail])
        return
      }
      push(indent, [...lead, punctuation('{')])
      for (const [index, [entryKey, item]] of entries.entries()) {
        walk(
          item,
          indent + 1,
          [{ text: JSON.stringify(entryKey), tone: 'key' }, punctuation(': ')],
          index < entries.length - 1,
          entryKey,
        )
      }
      push(indent, [punctuation('}'), ...tail])
      return
    }

    push(indent, [...lead, scalar(node, key), ...tail])
  }

  walk(value, 0, [], false, undefined)
  return lines
}
