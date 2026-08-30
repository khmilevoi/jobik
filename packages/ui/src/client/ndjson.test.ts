import { describe, expect, it } from 'vitest'
import { NdjsonParseError, readNdjsonStream } from './ndjson.js'
import type { RunStreamEvent } from './wire.js'

function responseOf(chunks: readonly string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  })
}

async function collect(response: Response): Promise<RunStreamEvent[]> {
  const events: RunStreamEvent[] = []
  for await (const event of readNdjsonStream(response)) events.push(event)
  return events
}

describe('readNdjsonStream', () => {
  it('yields one event per line', async () => {
    const events = await collect(
      responseOf([
        '{"type":"run-accepted","runToken":"tok"}\n',
        '{"type":"node-log","line":{"nodeId":"render","message":"pass 1","at":5}}\n',
      ]),
    )

    expect(events).toEqual([
      { type: 'run-accepted', runToken: 'tok' },
      { type: 'node-log', line: { nodeId: 'render', message: 'pass 1', at: 5 } },
    ])
  })

  it('reassembles a line split across chunks', async () => {
    const events = await collect(responseOf(['{"type":"run-acce', 'pted","runToken":', '"tok"}\n']))

    expect(events).toEqual([{ type: 'run-accepted', runToken: 'tok' }])
  })

  it('ignores blank lines', async () => {
    const events = await collect(responseOf(['\n{"type":"run-accepted","runToken":"t"}\n\n']))

    expect(events).toHaveLength(1)
  })

  it('throws NdjsonParseError on a truncated final line', async () => {
    const iterator = readNdjsonStream(responseOf(['{"type":"run-accepted","runToken":"t"}\n{"typ']))
    await iterator.next()

    await expect(iterator.next()).rejects.toBeInstanceOf(NdjsonParseError)
  })

  it('throws NdjsonParseError on a line that is not JSON', async () => {
    const iterator = readNdjsonStream(responseOf(['not json at all\n']))

    await expect(iterator.next()).rejects.toBeInstanceOf(NdjsonParseError)
  })

  it('throws NdjsonParseError when the response carries no body', async () => {
    const iterator = readNdjsonStream(new Response(null, { status: 204 }))

    await expect(iterator.next()).rejects.toBeInstanceOf(NdjsonParseError)
  })
})
