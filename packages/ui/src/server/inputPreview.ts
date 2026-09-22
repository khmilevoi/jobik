import * as jobik from '@jobik/core'
import * as errore from 'errore'
import { type JobikRouteContext, sendWireError } from './routes.js'

class InputPreviewError extends errore.createTaggedError({
  name: 'InputPreviewError',
  message: 'Input preview failed',
}) {}
export async function handleInputPreview(context: JobikRouteContext) {
  const { request, response, params, registry, url } = context
  const refuse = (status: number, message: string) =>
    sendWireError(response, status, { error: { _tag: null, message } })
  const flow = registry.get(params.id ?? '')
  const nodeId = params.nodeId ?? ''
  const field = params.field ?? ''
  const nodes = flow?.flow.nodes
  const node = nodes !== undefined && Object.hasOwn(nodes, nodeId) ? nodes[nodeId] : undefined
  const uploads = flow?.inputUploads
  const fields =
    uploads !== undefined && Object.hasOwn(uploads, nodeId) ? uploads[nodeId] : undefined
  const policy = fields !== undefined && Object.hasOwn(fields, field) ? fields[field] : undefined
  if (node?.kind !== 'start' || policy?.preview === undefined)
    return refuse(404, 'Input preview is not configured')
  const descriptor = jobik.deriveInputControls({ nodeId, input: node.input })
  if (
    descriptor instanceof Error ||
    !descriptor.fields.some(
      (item) =>
        item.field === field && (item.control.kind === 'json' || item.control.kind === 'string'),
    )
  )
    return refuse(400, 'Input field does not support previews')
  const raw = url.searchParams.get('value')
  if (
    !raw ||
    raw.length > 4096 ||
    url.searchParams.getAll('value').length !== 1 ||
    url.href.length > 16000
  )
    return refuse(400, 'Invalid preview value')
  const parsed = errore.try({
    try: () => ({ value: JSON.parse(raw) as unknown }),
    catch: (cause) => new InputPreviewError({ cause }),
  })
  if (parsed instanceof Error) return refuse(400, 'Invalid preview value')
  const preview = policy.preview
  const controller = new AbortController()
  const abort = () => controller.abort()
  const close = () => {
    if (!response.writableEnded) abort()
  }
  request.once('aborted', abort)
  response.once('close', close)
  const result = await errore.tryAsync({
    try: () => preview({ value: parsed.value, signal: controller.signal }),
    catch: (cause) => new InputPreviewError({ cause }),
  })
  request.removeListener('aborted', abort)
  response.removeListener('close', close)
  if (controller.signal.aborted || response.destroyed) return
  if (result instanceof Error)
    return refuse(422, 'Stored image is unavailable. Check the value and storage configuration.')
  if (
    result === null ||
    typeof result !== 'object' ||
    !(result.bytes instanceof Uint8Array) ||
    result.bytes.length === 0 ||
    result.bytes.length > 64 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(
      result.contentType,
    )
  )
    return refuse(500, 'Preview handler returned an invalid image')
  response.writeHead(200, {
    'content-type': result.contentType,
    'content-length': result.bytes.length,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  })
  response.end(result.bytes)
}
