import * as jobik from '@jobik/core'
import * as errore from 'errore'
import { inputUploadAccepts } from '../client/inputUploadAccept.js'
import { handleInputPreview } from './inputPreview.js'
import { DEFAULT_INPUT_UPLOAD_BYTES } from './inputUploadConfig.js'
import { type JobikRoute, type JobikRouteContext, sendWireError } from './routes.js'
import { uploadValueJson } from './uploadValue.js'

class InputUploadError extends errore.createTaggedError({
  name: 'InputUploadError',
  message: 'Input upload failed',
}) {}

function refuse(context: JobikRouteContext, status: number, message: string) {
  sendWireError(context.response, status, { error: { _tag: null, message } })
}
async function handleUpload(context: JobikRouteContext) {
  const { request, response, params, registry } = context
  const flow = registry.get(params.id ?? '')
  const nodeId = params.nodeId ?? ''
  const field = params.field ?? ''
  const definitions = flow?.flow.nodes
  const node =
    definitions !== undefined && Object.hasOwn(definitions, nodeId)
      ? definitions[nodeId]
      : undefined
  const uploads = flow?.inputUploads
  const fields =
    uploads !== undefined && Object.hasOwn(uploads, nodeId) ? uploads[nodeId] : undefined
  const policy = fields !== undefined && Object.hasOwn(fields, field) ? fields[field] : undefined
  if (node?.kind !== 'start' || policy === undefined)
    return refuse(context, 404, 'Input upload is not configured')
  const descriptor = jobik.deriveInputControls({ nodeId, input: node.input })
  if (descriptor instanceof Error) return refuse(context, 400, 'Input field is unavailable')
  if (
    !descriptor.fields.some(
      (item) =>
        item.field === field && (item.control.kind === 'json' || item.control.kind === 'string'),
    )
  )
    return refuse(context, 400, 'Input field does not support uploads')
  const maxBytes = policy.maxBytes ?? DEFAULT_INPUT_UPLOAD_BYTES
  // Base64 grows by 4/3, with a small fixed allowance for file metadata and JSON punctuation.
  const maxBody = Math.ceil(maxBytes / 3) * 4 + 8192
  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBody)
    return refuse(context, 413, 'Upload exceeds the size limit')
  const chunks: Buffer[] = []
  let size = 0
  const read = await (async () => {
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk as Uint8Array)
      size += bytes.length
      if (size > maxBody) return new InputUploadError()
      chunks.push(bytes)
    }
    return true
  })().catch((cause) => new InputUploadError({ cause }))
  if (read instanceof Error)
    return refuse(context, size > maxBody ? 413 : 400, 'Could not read upload')
  const parsed = errore.try({
    try: () => ({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }),
    catch: (cause) => new InputUploadError({ cause }),
  })
  if (parsed instanceof Error) return refuse(context, 400, 'Invalid upload body')
  if (parsed.body === null || typeof parsed.body !== 'object' || Array.isArray(parsed.body))
    return refuse(context, 400, 'Invalid upload body')
  const body = parsed.body as { name?: unknown; contentType?: unknown; dataBase64?: unknown }
  if (
    typeof body.name !== 'string' ||
    !body.name ||
    body.name.length > 1024 ||
    Array.from(body.name).some((character) => character.charCodeAt(0) < 32) ||
    typeof body.contentType !== 'string' ||
    body.contentType.length > 255 ||
    typeof body.dataBase64 !== 'string'
  )
    return refuse(context, 400, 'Invalid upload metadata')
  const contentType = body.contentType.toLowerCase()
  if (!inputUploadAccepts(policy.accept ?? 'image/png,image/jpeg', body.name, contentType))
    return refuse(context, 415, 'File type is not accepted')
  if (
    body.dataBase64.length === 0 ||
    body.dataBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64)
  )
    return refuse(context, 400, 'Invalid upload encoding')
  const bytes = Buffer.from(body.dataBase64, 'base64')
  if (bytes.length > maxBytes) return refuse(context, 413, 'Upload exceeds the size limit')
  if (bytes.toString('base64') !== body.dataBase64)
    return refuse(context, 400, 'Invalid upload encoding')
  const controller = new AbortController()
  const abort = () => controller.abort()
  const close = () => {
    if (!response.writableEnded) abort()
  }
  request.once('aborted', abort)
  response.once('close', close)
  const result = await Promise.resolve()
    .then(() =>
      policy.upload({
        file: { name: body.name as string, contentType, bytes },
        signal: controller.signal,
      }),
    )
    .catch((cause) => new InputUploadError({ cause }))
  request.removeListener('aborted', abort)
  response.removeListener('close', close)
  if (controller.signal.aborted || response.destroyed) return
  if (result instanceof Error)
    return refuse(context, 422, 'Image upload failed. Check the file and storage configuration.')
  // Round trip before sending: an adapter must return JSON, never a File, Buffer or cyclic value.
  if (
    result === null ||
    typeof result !== 'object' ||
    !Object.hasOwn(result, 'value') ||
    result.value === undefined
  )
    return refuse(context, 500, 'Upload handler returned an invalid value')
  const wire = uploadValueJson(result.value)
  if (wire instanceof Error) return refuse(context, 500, 'Upload handler returned an invalid value')
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(wire.json),
    'cache-control': 'no-store',
  })
  response.end(wire.json)
}
export const jobikInputUploadRoutes: readonly JobikRoute[] = [
  {
    method: 'GET',
    pattern: '/api/flows/:id/inputs/:nodeId/:field/preview',
    handle: handleInputPreview,
  },
  { method: 'POST', pattern: '/api/flows/:id/inputs/:nodeId/:field/upload', handle: handleUpload },
]
