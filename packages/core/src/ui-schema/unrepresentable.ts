import type * as z from 'zod'
import { type AssetMeta, assetMetaOf } from '#asset.js'
import type { JsonSchemaFragment, JsonValue } from './descriptor.js'

/**
 * The `unrepresentable` callback both `z.toJSONSchema` calls pass.
 *
 * `z.toJSONSchema` invokes it at every site with no JSON Schema equivalent. A site registered in
 * P2's asset registry resolves to the asset descriptor's schema; everything else records the site
 * and returns `'throw'`, which makes `z.toJSONSchema` throw and lets `derive.ts` turn the recorded
 * site into a `JobUiSchemaError`. So `z.date()`, `z.map()`, `z.bigint()` and an unregistered
 * `z.custom()` still fail exactly as the spec requires, while an asset field never does.
 */

/** The JSON Schema extension key that marks a binary field for the run panel and output viewer. */
export const assetExtensionKey = 'x-jobik-asset'

/**
 * The JSON Schema an asset field resolves to. `title` gives the editor the `Buffer` annotation the
 * design shows in a field row; the four properties are exactly `AssetDescriptor`'s fields.
 */
export function assetJsonSchema(meta: AssetMeta): z.core.JSONSchema.BaseSchema {
  return {
    type: 'object',
    title: 'Buffer',
    properties: {
      type: { const: 'Buffer' },
      mime: { const: meta.mime },
      bytes: { type: 'integer' },
      id: { type: 'string' },
    },
    required: ['type', 'mime', 'bytes', 'id'],
    [assetExtensionKey]: { mime: meta.mime },
  }
}

/** Where a conversion gave up, and the reason Zod would have printed. */
export type UnrepresentableSite = {
  readonly path: readonly (string | number)[]
  readonly message: string
}

export type AssetUnrepresentableHandler = {
  /** Pass as `z.toJSONSchema(schema, { io, unrepresentable: handler })`. */
  readonly handler: z.core.UnrepresentableHandler<z.core.$ZodTypes>
  /** The first site that was not a registered asset, or `undefined` when every site resolved. */
  readonly site: () => UnrepresentableSite | undefined
}

/**
 * One handler per conversion — it carries the recorded site, so it must never be shared between two
 * `z.toJSONSchema` calls. Zod may call the handler twice for one field (a `.describe()` derivative
 * and its parent), which is why only the FIRST non-asset site is kept.
 */
export function createAssetUnrepresentableHandler(): AssetUnrepresentableHandler {
  let first: UnrepresentableSite | undefined

  return {
    handler: (ctx) => {
      const meta = assetMetaOf(ctx.zodSchema)
      if (meta !== undefined) return assetJsonSchema(meta)
      first ??= { path: [...ctx.path], message: ctx.message }
      return 'throw'
    },
    site: () => first,
  }
}

/**
 * The dotted field path a JSON Schema pointer path names, for `JobUiSchemaError.field`:
 * `['properties','a','properties','b'] → 'a.b'`, `['properties','list','items'] → 'list'`. Consumes
 * the name that follows each `properties` marker, so a field literally called `properties` is not
 * mistaken for one.
 */
export function fieldPathOf(path: readonly (string | number)[]): string {
  const names: string[] = []
  let index = 0
  while (index < path.length - 1) {
    if (path[index] === 'properties') {
      names.push(String(path[index + 1]))
      index += 2
      continue
    }
    index += 1
  }
  return names.length > 0 ? names.join('.') : '(root)'
}

/** The RFC 6901 pointer for a site, appended to `JobUiSchemaError.reason`. */
export function jsonPointerOf(path: readonly (string | number)[]): string {
  if (path.length === 0) return '#'
  const segments = path.map((segment) =>
    String(segment).replaceAll('~', '~0').replaceAll('/', '~1'),
  )
  return `#/${segments.join('/')}`
}

function isAssetMarker(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The mime an `x-jobik-asset` marker carries, or `undefined` when the fragment is not an asset. */
export function assetMimeOf(fragment: JsonSchemaFragment): string | undefined {
  const marker = fragment[assetExtensionKey]
  if (isAssetMarker(marker)) {
    const mime = marker.mime
    return typeof mime === 'string' ? mime : undefined
  }
  return undefined
}
