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

/** The schema `asset()` returns: any `Uint8Array` in, a `Buffer` out. */
export type AssetSchema = z.ZodCustom<Buffer, Buffer>

/**
 * Core's asset registry. Deriving editor metadata (P6) consults it to decide that a field which is
 * not representable as JSON Schema is nonetheless an asset rather than an error. Consumers should
 * go through `assetMetaOf()`, not `.has()`: `.has()` is a bare lookup that does not walk zod's
 * `_zod.parent` chain, so it returns `false` for the `.describe()` / `.refine()` derivatives that
 * `assetMetaOf()` still recognises.
 */
export const assetRegistry = z.registry<AssetMeta>()

/**
 * Declare a binary field: `output: z.object({ image: asset({ mime: 'image/png' }) })`.
 *
 * The predicate admits any `Uint8Array` and `.overwrite()` then normalises it, so the `Buffer` the
 * type promises is the `Buffer` a handler's caller receives — a handler returning
 * `new Uint8Array(await res.arrayBuffer())`, `await blob.bytes()` or `crypto.getRandomValues`
 * included. A value that is already a `Buffer` passes through by identity, so the common case
 * costs nothing.
 *
 * `.overwrite()` rather than `.transform()` deliberately: it keeps the schema a `ZodCustom`
 * instead of wrapping it in a `ZodPipe`. Every asset consumer here reads the registry off the
 * schema it is handed — `fieldTypeOf`, `collectAssets`, and the unrepresentable handler that
 * `z.toJSONSchema` calls with `ctx.zodSchema` — and a pipe would hand the last of those the
 * inner transform, which carries no registration.
 *
 * The registration is repeated for the same reason, and the repetition is load-bearing:
 * `.overwrite()` returns a CLONE, and `z.toJSONSchema` walks a custom field twice, once per
 * instance. Registering only the clone leaves the original unregistered, and the handler answers
 * `'throw'` on it — `Custom types cannot be represented in JSON Schema`, on every asset field in
 * the repository. Zod's registry walks `_zod.parent` from child to parent, which is the wrong
 * direction to rescue this, so both instances are registered outright.
 */
export function asset(meta: AssetMeta): AssetSchema {
  return z
    .custom<Buffer>((value) => value instanceof Uint8Array, {
      error: `Expected binary data (${meta.mime})`,
    })
    .register(assetRegistry, { mime: meta.mime })
    .overwrite((value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)))
    .register(assetRegistry, { mime: meta.mime })
}

/** The registered meta for a schema, or `undefined` when the schema is not an asset field. */
export function assetMetaOf(schema: z.core.$ZodType): AssetMeta | undefined {
  return assetRegistry.get(schema)
}
