import * as errore from 'errore'

class UploadValueError extends errore.createTaggedError({
  name: 'UploadValueError',
  message: 'Upload handler must return a JSON value',
}) {}
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

/** Copy only JSON data descriptors, without invoking adapter getters or toJSON hooks. */
export function uploadValueJson(value: unknown): { json: string } | Error {
  const ancestors = new Set<object>()
  let count = 0
  // The envelope {"value":...} contributes ten bytes in addition to the copied value.
  let budget = 10
  const spend = (bytes: number) => {
    budget += bytes
    return budget <= 1024 * 1024
  }
  const copy = (item: unknown, depth: number): JsonValue | Error => {
    count++
    if (count > 100_000 || depth > 100) return new UploadValueError()
    if (item === null || typeof item === 'boolean')
      return spend(String(item).length) ? item : new UploadValueError()
    if (typeof item === 'string') {
      if (item.length > 1024 * 1024) return new UploadValueError()
      return spend(Buffer.byteLength(JSON.stringify(item))) ? item : new UploadValueError()
    }
    if (typeof item === 'number')
      return Number.isFinite(item) && spend(String(item).length) ? item : new UploadValueError()
    if (typeof item !== 'object' || ancestors.has(item)) return new UploadValueError()
    const array = Array.isArray(item)
    if (
      !array &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return new UploadValueError()
    if (Object.getOwnPropertySymbols(item).length > 0) return new UploadValueError()
    if (array && item.length > 100_000) return new UploadValueError()
    ancestors.add(item)
    const result: JsonValue[] | { [key: string]: JsonValue } = array
      ? []
      : (Object.create(null) as { [key: string]: JsonValue })
    const keys = array
      ? Array.from({ length: item.length }, (_, index) => String(index))
      : Object.keys(item)
    if (keys.length > 100_000 || !spend(2 + Math.max(0, keys.length - 1)))
      return new UploadValueError()
    for (const key of keys) {
      if (
        !array &&
        (key.length > 1024 * 1024 || !spend(Buffer.byteLength(JSON.stringify(key)) + 1))
      )
        return new UploadValueError()
      const property = Object.getOwnPropertyDescriptor(item, key)
      if (property === undefined || !Object.hasOwn(property, 'value')) return new UploadValueError()
      const child = copy(property.value, depth + 1)
      if (child instanceof Error) return child
      Object.defineProperty(result, key, {
        value: child,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    ancestors.delete(item)
    return result
  }
  return errore.try({
    try: () => {
      const snapshot = copy(value, 0)
      if (snapshot instanceof Error) return snapshot
      return { json: JSON.stringify({ value: snapshot }) }
    },
    catch: (cause) => new UploadValueError({ cause }),
  })
}
