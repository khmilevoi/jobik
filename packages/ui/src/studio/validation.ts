import type { WireErrorPayload } from '#client/index.js'
import type { ProseSegment, ValidationFinding } from '#modals/index.js'

/**
 * One wire error, as the `Validation` dialog's list of findings.
 *
 * **The design fixes a list and v1 produces at most one entry.** `POST /api/flows/:id/validate`
 * answers `{ valid: true }` or `{ valid: false, error }` — a single `WireErrorPayload`, with no
 * severity, no second finding and no source location. So the artboard's `2 errors · 1 warning`
 * header is a shape this function can produce but this server cannot fill: everything it returns is
 * an `error`, because the wire has no way to say `warning`, and it is never longer than one entry.
 * Nothing is invented to pad it out.
 *
 * What IS real: the error's own tag becomes the mono code (`TypeMismatch`, `ConnectionError`, …),
 * its message becomes the sentence, and where the payload names a node — the taxonomy's own
 * `nodeId` field, when the tag carries one — that node gets the artboard's `Reveal node` link.
 * `Open in editor` is not offered: the Studio has no editor to open, and a link that does nothing
 * is worse than an absent one.
 */
export function toValidationFindings(args: {
  error: WireErrorPayload
  onRevealNode?: (nodeId: string) => void
}): readonly ValidationFinding[] {
  const { error, onRevealNode } = args
  const nodeId = typeof error.nodeId === 'string' ? error.nodeId : undefined
  const actions =
    nodeId === undefined || onRevealNode === undefined
      ? undefined
      : [{ label: 'Reveal node', tone: 'accent' as const, onSelect: () => onRevealNode(nodeId) }]

  return [
    {
      severity: 'error',
      code: error._tag ?? 'ValidationError',
      message: toProse(error.message, nodeId),
      ...(actions === undefined ? {} : { actions }),
    },
  ]
}

/**
 * The sentence, with the one identifier the payload actually names set in mono.
 *
 * The design marks every identifier inside a finding's sentence — `render.markdown`, `Buffer`,
 * `start1.markdown`. A wire message is a plain string with no such structure, so the only honest
 * marking is the node id, which the payload does name separately. Splitting on the first occurrence
 * keeps the sentence verbatim: it is the server's own words either way, never re-humanised.
 */
export function toProse(message: string, nodeId: string | undefined): readonly ProseSegment[] {
  if (nodeId === undefined) return [{ text: message }]
  const at = message.indexOf(nodeId)
  if (at < 0) return [{ text: message }]

  const segments: ProseSegment[] = []
  if (at > 0) segments.push({ text: message.slice(0, at) })
  segments.push({ text: nodeId, mono: true })
  const rest = message.slice(at + nodeId.length)
  if (rest.length > 0) segments.push({ text: rest })
  return segments
}
