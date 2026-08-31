import type { WireNodeReportPayload } from '../client/index.js'
import type { RunOutputField } from '../run/index.js'

/**
 * `### Run panel` completed state: `Outputs` shows a 54px thumbnail with field name, mime and size
 * plus an `Open` action for binary fields, and inset wells for text and URL fields, URLs in accent
 * mono. The three `RunOutputField` kinds are exactly those three cases.
 *
 * A binary field crosses the wire as an `AssetDescriptor`, keyed by the output field name. Ruling
 * R1: `serialiseNodeOutput` (`packages/ui/src/server/runWire.ts:198`) writes that SAME descriptor
 * into both `WireNodeReport.output[field]` and `WireNodeReport.assets[field]` — a binary field is
 * one field appearing in both maps, not two, so the duplicate-name counter below counts each field
 * name once per node, over the union of both key sets. Emission itself is already dedup-safe: the
 * output loop skips any field that has a descriptor, so only the asset loop emits it.
 *
 * The bytes stay on the server behind `GET /api/assets/:assetId`; this module never builds that
 * URL. `thumbnail` is a React value `StudioApp` fills after calling this — Ruling R2 drops the
 * `assetUrl` parameter this module never used to construct it.
 *
 * R37: `field` can be QUALIFIED (`render.image`) whenever two nodes share a field name, so a caller
 * can never recover the owning node id by searching `node.assets` for the (possibly qualified)
 * label — that lookup silently fails and `Open` does nothing. `onOpenAsset`, when supplied, is
 * invoked with the real `node.nodeId` from inside this function's own per-node loop, which already
 * knows it; the caller never has to guess it back out of a label.
 */

export function isUrlValue(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//.test(value)
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}

export function toOutputFields(args: {
  nodes: readonly WireNodeReportPayload[]
  /** Builds the asset field's `onOpen`, given the owning node's real id. */
  onOpenAsset?: (nodeId: string) => () => void
}): readonly RunOutputField[] {
  const names = new Map<string, number>()
  for (const node of args.nodes) {
    const fieldNames = new Set([...Object.keys(node.output ?? {}), ...Object.keys(node.assets)])
    for (const field of fieldNames) {
      names.set(field, (names.get(field) ?? 0) + 1)
    }
  }

  const label = (nodeId: string, field: string): string =>
    (names.get(field) ?? 0) > 1 ? `${nodeId}.${field}` : field

  const fields: RunOutputField[] = []

  for (const node of args.nodes) {
    for (const [field, value] of Object.entries(node.output ?? {})) {
      const descriptor = node.assets[field]
      if (descriptor !== undefined) continue
      fields.push(
        isUrlValue(value)
          ? { kind: 'url', field: label(node.nodeId, field), value }
          : { kind: 'text', field: label(node.nodeId, field), value: textOf(value) },
      )
    }

    for (const [field, descriptor] of Object.entries(node.assets)) {
      fields.push({
        kind: 'asset',
        field: label(node.nodeId, field),
        asset: descriptor,
        thumbnail: undefined,
        onOpen: args.onOpenAsset === undefined ? undefined : args.onOpenAsset(node.nodeId),
      })
    }
  }

  return fields
}
