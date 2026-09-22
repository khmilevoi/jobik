import { abortVar, action, atom, computed, withAsyncData, withChangeHook, wrap } from '@reatom/core'
import * as errore from 'errore'
import type { JobikClient } from '#client/index.js'
import type { RunInputUpload } from '#run/types.js'
import { inputPreviewPath } from '../client/inputPreviewUrl.js'
import { inputUploadAccepts } from '../client/inputUploadAccept.js'
import { detached } from './reatom.js'

class InputUploadError extends errore.createTaggedError({
  name: 'InputUploadError',
  message: '$reason',
}) {}

function readFile(file: File, signal: AbortSignal): Promise<string | Error> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    const finish = (value: string | Error) => {
      signal.removeEventListener('abort', abort)
      reader.onload = null
      reader.onerror = null
      reader.onabort = null
      resolve(value)
    }
    const abort = () => {
      reader.abort()
      finish(new InputUploadError({ reason: 'Upload cancelled.' }))
    }
    reader.onload = () => {
      const result = reader.result
      finish(
        typeof result === 'string'
          ? result.slice(result.indexOf(',') + 1)
          : new InputUploadError({ reason: 'Cannot read the selected file.' }),
      )
    }
    reader.onerror = () =>
      finish(
        new InputUploadError({ reason: 'Cannot read the selected file.', cause: reader.error }),
      )
    reader.onabort = () => finish(new InputUploadError({ reason: 'Upload cancelled.' }))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    const started = errore.try({
      try: () => reader.readAsDataURL(file),
      catch: (cause) => new InputUploadError({ reason: 'Cannot read the selected file.', cause }),
    })
    if (started instanceof Error) finish(started)
  })
}

/** One declared upload field owns its request and local preview independently. */
export function reatomInputUpload(
  input: {
    client: JobikClient
    flowId: string
    nodeId: string
    field: string
    kind: 'json' | 'string'
    accept: string
    maxBytes: number
    preview?: boolean
    value: () => unknown
    current: () => boolean
    commit: (value: string) => void
  },
  name: string,
) {
  const preview = atom<{ url: string; fileName: string } | undefined>(
    undefined,
    `${name}.preview`,
  ).extend(
    withChangeHook((next, previous) => {
      if (previous !== undefined && previous.url !== next?.url) URL.revokeObjectURL(previous.url)
    }),
  )
  // withAsyncData includes withAsync and retains returned Error values without throwing them.
  const upload = action(async (file: File): Promise<undefined | Error> => {
    if (!input.current()) return
    if (file.size === 0 || file.size > input.maxBytes)
      return new InputUploadError({
        reason: `Choose a non-empty image up to ${input.maxBytes} bytes.`,
      })
    if (!inputUploadAccepts(input.accept, file.name, file.type))
      return new InputUploadError({ reason: `Supported image types: ${input.accept}.` })
    const selected = errore.try({
      try: () => ({ url: URL.createObjectURL(file), fileName: file.name }),
      catch: (cause) =>
        new InputUploadError({ reason: 'Cannot preview the selected image.', cause }),
    })
    if (selected instanceof Error) return selected
    preview.set(selected)
    using subscription = abortVar.subscribe()
    const signal = subscription.controller.signal
    const dataBase64 = await wrap(readFile(file, signal))
    if (dataBase64 instanceof Error) return dataBase64
    if (!input.current() || signal.aborted) return
    const result = await wrap(
      input.client.uploadInput({
        flowId: input.flowId,
        nodeId: input.nodeId,
        field: input.field,
        file: { name: file.name, contentType: file.type, dataBase64 },
        signal,
      }),
    )
    if (!input.current() || signal.aborted) return
    if (result instanceof Error) return result
    const serialized = errore.try({
      try: () =>
        input.kind === 'string' && typeof result.value === 'string'
          ? result.value
          : input.kind === 'json'
            ? JSON.stringify(result.value)
            : undefined,
      catch: (cause) =>
        new InputUploadError({ reason: 'The server returned an invalid input value.', cause }),
    })
    if (serialized instanceof Error) return serialized
    if (serialized === undefined)
      return new InputUploadError({ reason: 'The server returned an invalid input value.' })
    input.commit(serialized)
    if (input.preview) preview.set(undefined)
  }, `${name}.upload`).extend(withAsyncData())

  const clear = action(() => {
    upload.abort()
    upload.data.set(undefined)
    preview.set(undefined)
  }, `${name}.clear`)
  const select = action((file: File) => {
    if (!input.current()) return
    detached(upload(file))
  }, `${name}.select`)
  const view = computed<RunInputUpload>(() => {
    const local = preview()
    const draft = input.value()
    const serialized =
      input.preview && typeof draft === 'string' && draft.trim() !== ''
        ? errore.try({
            try: () =>
              input.kind === 'json' ? JSON.stringify(JSON.parse(draft)) : JSON.stringify(draft),
            catch: () => new InputUploadError({ reason: 'Invalid preview value.' }),
          })
        : undefined
    const remote =
      typeof serialized === 'string' && serialized.length <= 4096
        ? (input.client.inputPreviewUrl ?? inputPreviewPath)({
            flowId: input.flowId,
            nodeId: input.nodeId,
            field: input.field,
            valueJson: serialized,
          })
        : undefined
    const selected = local !== undefined && (!input.preview || !upload.ready()) ? local : undefined
    const result = upload.data()
    const unexpected = upload.error()
    const uploading = !upload.ready()
    const message = uploading
      ? undefined
      : result instanceof Error
        ? result.message
        : unexpected instanceof Error
          ? 'Image upload failed. Please try again.'
          : undefined
    return {
      accept: input.accept,
      maxBytes: input.maxBytes,
      uploading,
      onSelect: select,
      ...(selected === undefined
        ? remote === undefined
          ? {}
          : { previewUrl: remote }
        : { previewUrl: selected.url, fileName: selected.fileName }),
      ...(message === undefined ? {} : { message }),
    }
  }, `${name}.view`)
  return { view, clear }
}
