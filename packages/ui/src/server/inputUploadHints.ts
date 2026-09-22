import type { JobikInputUploads } from './inputUploadConfig.js'

/** JSON-safe upload hints. Storage handlers never cross the wire. */
export function inputUploadHints(uploads: JobikInputUploads[string] | undefined) {
  if (uploads === undefined) return undefined
  return Object.fromEntries(
    Object.entries(uploads).map(([field, policy]) => [
      field,
      {
        ...(policy.preview === undefined ? {} : { preview: true }),
        accept: policy.accept ?? 'image/png,image/jpeg',
        maxBytes: policy.maxBytes ?? 16 * 1024 * 1024,
      },
    ]),
  )
}
