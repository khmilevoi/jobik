/**
 * Pure markdown text helpers shared by the `markdown` and `imageOut` definitions.
 *
 * Deterministic and dependency-free on purpose: the example runs inside the repository gate, which
 * has no network and must not write to disk.
 */

import { PUBLICATION_COLOUR_PROFILE } from '../types.js'

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const INLINE_ASSET = /!\[[^\]]*\]\(([^)\s]+)\)/

/** The text of the first ATX heading, or `undefined` when the source has none. */
export function headingOf(source: string): string | undefined {
  for (const line of source.split('\n')) {
    const match = HEADING.exec(line)
    if (match) return match[2]
  }
  return undefined
}

/** Everything after the first heading, leading blank lines dropped, trailing whitespace trimmed. */
export function bodyOf(source: string): string {
  const lines = source.split('\n')
  const headingAt = lines.findIndex((line) => HEADING.test(line))
  const rest = headingAt === -1 ? lines : lines.slice(headingAt + 1)
  return rest.join('\n').trim()
}

/**
 * The caption `imageOut` emits: the heading (or the node's `title` when there is none), then an
 * em-dash and the first two words of the body in lower case. The `Output viewer` artboard fixes
 * the result for the design's own input: `Release 0.4 — field-level connections`.
 */
export function captionFor(args: { title: string; markdown: string }): string {
  const heading = headingOf(args.markdown) ?? args.title
  const summary = bodyOf(args.markdown).split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  return summary === '' ? heading : `${heading} — ${summary.toLowerCase()}`
}

/** Trailing whitespace trimmed per line, runs of blank lines collapsed to one, one final newline. */
export function normaliseMarkdown(source: string): string {
  const trimmed = source
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
  return `${trimmed.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`
}

/** Whitespace-separated word count. */
export function wordCountOf(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * The first inlined asset whose URL fragment declares a colour profile this renderer cannot
 * handle, with its 1-based line number. Drives the design's `ImageRenderError` failed state.
 */
export function unsupportedColourProfile(
  source: string,
): { profile: string; line: number } | undefined {
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = INLINE_ASSET.exec(lines[index])
    if (!match) continue
    const fragment = match[1].split('#')[1]
    if (fragment === undefined || !fragment.startsWith('profile=')) continue
    const profile = fragment.slice('profile='.length)
    if (profile.toLowerCase() !== PUBLICATION_COLOUR_PROFILE.toLowerCase()) {
      return { profile, line: index + 1 }
    }
  }
  return undefined
}
