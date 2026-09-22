/** A storage adapter owns persistence and returns the JSON value assigned to the input field. */
export type JobikInputUpload = {
  readonly accept?: string
  readonly maxBytes?: number
  readonly preview?: (args: {
    readonly value: unknown
    readonly signal: AbortSignal
  }) => Promise<{ readonly bytes: Uint8Array; readonly contentType: string } | Error>
  readonly upload: (args: {
    readonly file: {
      readonly name: string
      readonly contentType: string
      readonly bytes: Uint8Array
    }
    readonly signal: AbortSignal
  }) => Promise<{ readonly value: unknown } | Error>
}
export type JobikInputUploads = Readonly<Record<string, Readonly<Record<string, JobikInputUpload>>>>
export const DEFAULT_INPUT_UPLOAD_BYTES = 16 * 1024 * 1024
export const MAX_INPUT_UPLOAD_BYTES = 64 * 1024 * 1024

/** Config errors are author errors, rejected before the server starts. */
export function normaliseInputUploads(value: unknown): JobikInputUploads | undefined {
  if (value === undefined) return undefined
  const object = (candidate: unknown): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
  if (!object(value)) throw new TypeError('jobik config: inputUploads must be an object')
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([nodeId, fields]) => {
        if (!nodeId || !object(fields))
          throw new TypeError('jobik config: invalid input upload node')
        return [
          nodeId,
          Object.freeze(
            Object.fromEntries(
              Object.entries(fields).map(([field, candidate]) => {
                if (!field || !object(candidate) || typeof candidate.upload !== 'function') {
                  throw new TypeError('jobik config: input upload must declare a handler')
                }
                if (candidate.preview !== undefined && typeof candidate.preview !== 'function')
                  throw new TypeError('jobik config: input preview must declare a handler')
                const maxBytes = candidate.maxBytes ?? DEFAULT_INPUT_UPLOAD_BYTES
                const accept = candidate.accept ?? 'image/png,image/jpeg'
                if (
                  typeof maxBytes !== 'number' ||
                  !Number.isSafeInteger(maxBytes) ||
                  maxBytes < 1 ||
                  maxBytes > MAX_INPUT_UPLOAD_BYTES
                ) {
                  throw new TypeError(
                    'jobik config: input upload maxBytes must be between 1 and 67108864',
                  )
                }
                if (
                  typeof accept !== 'string' ||
                  !accept ||
                  accept.length > 1024 ||
                  !accept
                    .split(',')
                    .every((part) =>
                      /^(?:[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)|\.[a-z0-9]+)$/i.test(
                        part.trim(),
                      ),
                    )
                ) {
                  throw new TypeError('jobik config: invalid input upload accept')
                }
                return [
                  field,
                  Object.freeze({
                    accept,
                    maxBytes,
                    upload: candidate.upload as JobikInputUpload['upload'],
                    ...(candidate.preview === undefined
                      ? {}
                      : { preview: candidate.preview as JobikInputUpload['preview'] }),
                  }),
                ]
              }),
            ),
          ),
        ]
      }),
    ),
  )
}
