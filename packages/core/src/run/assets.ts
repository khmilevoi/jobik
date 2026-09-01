import { randomUUID } from 'node:crypto'
import type * as z from 'zod'
import { type AssetDescriptor, type AssetMeta, assetMetaOf } from '#asset.js'

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

/**
 * Register bytes and mint the descriptor that stands in for them on the wire.
 *
 * The bytes are copied unconditionally, `Buffer` input included. The store outlives the handler
 * that produced the value, so aliasing the caller's memory would let a handler that reuses a
 * scratch buffer — or returns a `subarray` of a pooled `Buffer.allocUnsafe` — retroactively rewrite
 * an asset a finished run already reported. The cost is one copy per registered asset, against a
 * store this module's header already declares unbounded and process-lifetime; that memory is held
 * either way, and only the write is new.
 */
export function registerAsset(args: { data: Uint8Array; mime: string }): AssetDescriptor {
  const data = Buffer.from(args.data)
  const id = randomUUID()
  store.set(id, { data, mime: args.mime })
  return { type: 'Buffer', mime: args.mime, bytes: data.byteLength, id }
}

/** The bytes registered under an id, or `null` when the id is unknown. */
export function readAsset(id: string): AssetEntry | null {
  return store.get(id) ?? null
}

/**
 * Wrappers that change a field's cardinality, not the kind of value it carries.
 *
 * A verbatim copy of the set in `graph/field-type.ts`, whose own `unwrap` is module-private. The
 * two must stay identical: `fieldTypeOf` is what lets `validateFlowGraph` wire a field as an asset,
 * and a field it calls an asset that `collectAssets` does not register loses its bytes silently —
 * the report carries no descriptor, so the wire projection nulls the value out. `assets.test.ts`
 * pins the agreement against `fieldTypeOf` itself rather than against this list.
 */
const CARDINALITY_WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'catch',
  'readonly',
  'nonoptional',
])

/** How deep a wrapper chain is followed. Deeper than any real schema; a guard, not a limit. */
const MAX_UNWRAP_DEPTH = 32

type LooseDef = { type: string; innerType?: z.core.$ZodType; out?: z.core.$ZodType }

/**
 * Peel cardinality wrappers and pipes down to the schema that decides the kind. `graph/field-type.ts`
 * takes the side of a connection as an argument; this walk only ever sees an output schema, so the
 * pipe branch is fixed to `def.out`.
 */
function unwrapOutput(schema: z.core.$ZodType): z.core.$ZodType {
  let current = schema
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const def = current._zod.def as LooseDef
    if (CARDINALITY_WRAPPERS.has(def.type) && def.innerType !== undefined) {
      current = def.innerType
      continue
    }
    if (def.type === 'pipe' && def.out !== undefined) {
      current = def.out
      continue
    }
    return current
  }
  return current
}

/**
 * The asset meta a field carries, through any wrapper chain.
 *
 * `assetMetaOf` is a bare registry lookup, and zod's registry walks `_zod.parent` — which is why a
 * `.describe()` derivative still resolves. `.optional()` / `.nullable()` / `.default()` build a
 * wrapper instead of a clone, leaving `parent` unset, so the wrapper must be peeled first.
 */
function assetMetaOfField(schema: z.core.$ZodType): AssetMeta | undefined {
  return assetMetaOf(schema) ?? assetMetaOf(unwrapOutput(schema))
}

/**
 * Register every asset-declared output field that produced bytes, and return the descriptors keyed
 * by field name. A field the schema does not register as an asset is left alone, and so is an
 * asset field carrying no binary value — output validation has already accepted the object, so
 * this walk never rejects anything.
 *
 * Top-level only: this walks `schema.shape` one level deep and does not recurse into a nested
 * `z.object` or `z.array`. An `asset()` declared inside one of those is never registered here —
 * closing that gap is P6/P13 territory, not this module's. Top-level *wrappers* are in scope: an
 * `asset().optional()` is still one field's bytes.
 */
export function collectAssets(args: {
  schema: z.ZodObject
  output: Readonly<Record<string, unknown>>
}): Readonly<Record<string, AssetDescriptor>> {
  const descriptors: Record<string, AssetDescriptor> = {}
  for (const [field, fieldSchema] of Object.entries(args.schema.shape)) {
    const meta = assetMetaOfField(fieldSchema)
    if (meta === undefined) continue
    const value = args.output[field]
    if (!(value instanceof Uint8Array)) continue
    descriptors[field] = registerAsset({ data: value, mime: meta.mime })
  }
  return descriptors
}
