import * as z from 'zod'

/**
 * Binary output fields.
 *
 * A field declared with `asset()` holds a real `Buffer` in process, which is what `run()` returns
 * to application code. Replacing it with an `AssetDescriptor` is a serialisation step the server
 * applies as a report crosses to the browser (P13); nothing in this file does it.
 */

/** What the browser receives in place of the bytes. Kept a pure type: `@jobik/ui` imports it. */
export type AssetDescriptor = {
  readonly type: 'Buffer'
  readonly mime: string
  readonly bytes: number
  readonly id: string
}

/** Everything core records about an asset field. */
export type AssetMeta = { readonly mime: string }

/** The schema `asset()` returns: any `Uint8Array` in, the same `Buffer` out. */
export type AssetSchema = z.ZodCustom<Buffer, Buffer>

/**
 * Core's asset registry. Deriving editor metadata (P6) consults it to decide that a field which is
 * not representable as JSON Schema is nonetheless an asset rather than an error.
 */
export const assetRegistry = z.registry<AssetMeta>()

/** Declare a binary field: `output: z.object({ image: asset({ mime: 'image/png' }) })`. */
export function asset(meta: AssetMeta): AssetSchema {
  return z
    .custom<Buffer>((value) => value instanceof Uint8Array, {
      error: `Expected binary data (${meta.mime})`,
    })
    .register(assetRegistry, { mime: meta.mime })
}

/** The registered meta for a schema, or `undefined` when the schema is not an asset field. */
export function assetMetaOf(schema: z.core.$ZodType): AssetMeta | undefined {
  return assetRegistry.get(schema)
}
