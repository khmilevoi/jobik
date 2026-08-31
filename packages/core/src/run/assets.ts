import { randomUUID } from 'node:crypto'
import type * as z from 'zod'
import { type AssetDescriptor, assetMetaOf } from '#asset.js'

/**
 * The in-process asset store.
 *
 * A binary output field keeps its real `Buffer` in the run report, so `run()` in application code
 * loses nothing. What this module adds is the identity the browser needs: every asset value a run
 * produced is registered here under an opaque id, and the node report carries the matching
 * `AssetDescriptor`. Swapping the `Buffer` for that descriptor as the report crosses to the
 * browser, and serving the bytes under the id, is the server's step — it reads them back through
 * `readAsset()`.
 *
 * Process-lifetime by design: v1 keeps every registered asset until the process exits. There is no
 * eviction and no persistence, exactly as run numbers are process-local and never persisted.
 */

/** The bytes behind one descriptor id, with the mime the field declared. */
export type AssetEntry = { readonly data: Buffer; readonly mime: string }

const store = new Map<string, AssetEntry>()

/** Register bytes and mint the descriptor that stands in for them on the wire. */
export function registerAsset(args: { data: Uint8Array; mime: string }): AssetDescriptor {
  const data = Buffer.isBuffer(args.data) ? args.data : Buffer.from(args.data)
  const id = randomUUID()
  store.set(id, { data, mime: args.mime })
  return { type: 'Buffer', mime: args.mime, bytes: data.byteLength, id }
}

/** The bytes registered under an id, or `null` when the id is unknown. */
export function readAsset(id: string): AssetEntry | null {
  return store.get(id) ?? null
}

/**
 * Register every asset-declared output field that produced bytes, and return the descriptors keyed
 * by field name. A field the schema does not register as an asset is left alone, and so is an
 * asset field carrying no binary value — output validation has already accepted the object, so
 * this walk never rejects anything.
 *
 * Top-level only: this walks `schema.shape` one level deep and does not recurse into a nested
 * `z.object` or `z.array`. An `asset()` declared inside one of those is never registered here —
 * closing that gap is P6/P13 territory, not this module's.
 */
export function collectAssets(args: {
  schema: z.ZodObject
  output: Readonly<Record<string, unknown>>
}): Readonly<Record<string, AssetDescriptor>> {
  const descriptors: Record<string, AssetDescriptor> = {}
  for (const [field, fieldSchema] of Object.entries(args.schema.shape)) {
    const meta = assetMetaOf(fieldSchema)
    if (meta === undefined) continue
    const value = args.output[field]
    if (!(value instanceof Uint8Array)) continue
    descriptors[field] = registerAsset({ data: value, mime: meta.mime })
  }
  return descriptors
}
