import * as errore from 'errore'
import type { StudioDeps } from '#model/types.js'

class InputDraftStorageError extends errore.createTaggedError({
  name: 'InputDraftStorageError',
  message: 'Browser input draft storage is unavailable.',
}) {}

/** Accessing the localStorage property itself may throw in restricted browser contexts. */
export function browserInputDraftStorage(namespace: string): StudioDeps['inputDraftStorage'] {
  const storage = errore.try({
    try: () => globalThis.localStorage,
    catch: (cause) => new InputDraftStorageError({ cause }),
  })
  if (storage instanceof Error || storage === undefined) return undefined
  return { storage, namespace }
}
