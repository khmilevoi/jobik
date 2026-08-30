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

/**
 * `cancelCalled` resolves from *inside* the stream's own `cancel()` callback, not at helper
 * construction time — the only way to actually observe whether `readNdjsonStream` cancelled the
 * underlying reader on early abandonment rather than merely releasing its lock.
 */
function responseOfWithCancel(chunks: readonly string[]): {
  response: Response
  cancelCalled: Promise<boolean>
} {
  const encoder = new TextEncoder()
  let resolveCancelCalled!: (value: boolean) => void
  const cancelCalled = new Promise<boolean>((resolve) => {
    resolveCancelCalled = resolve
  })
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
    cancel() {
      resolveCancelCalled(true)
    },
  })
  return {
    response: new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
    }),
    cancelCalled,
  }
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

  it('reassembles a multi-byte UTF-8 character split across chunks', async () => {
    // "т" (U+0442) encodes to the two UTF-8 bytes 0xD1 0x82. The 35-byte ASCII prefix before it
    // is fixed, so byte 36 always falls between those two bytes — a hard-coded offset, not a
    // runtime search, so this test cannot silently skip its own assertions.
    const line = '{"type":"run-accepted","runToken":"тест"}\n'
    const bytes = new TextEncoder().encode(line)
    const splitIndex = 36

    // Self-check the fixture: byte 35 is a two-byte UTF-8 lead byte, byte 36 its continuation.
    const leadByte = bytes[splitIndex - 1]
    const continuationByte = bytes[splitIndex]
    expect(leadByte !== undefined && (leadByte & 0xe0) === 0xc0).toBe(true)
    expect(continuationByte !== undefined && (continuationByte & 0xc0) === 0x80).toBe(true)

    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, splitIndex))
          controller.enqueue(bytes.slice(splitIndex))
          controller.close()
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } },
    )

    const events = await collect(response)

    expect(events).toEqual([{ type: 'run-accepted', runToken: 'тест' }])
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

  it('throws NdjsonParseError on a line with wrong type value', async () => {
    const iterator = readNdjsonStream(responseOf(['{"type":"unknown-type"}\n']))

    await expect(iterator.next()).rejects.toBeInstanceOf(NdjsonParseError)
  })

  it('throws NdjsonParseError on a line with missing type field', async () => {
    const iterator = readNdjsonStream(responseOf(['{"runToken":"tok"}\n']))

    await expect(iterator.next()).rejects.toBeInstanceOf(NdjsonParseError)
  })

  it('cancels the reader on early abandonment', async () => {
    const { response, cancelCalled } = responseOfWithCancel([
      '{"type":"run-accepted","runToken":"tok"}\n',
      '{"type":"node-log","line":{"nodeId":"x","message":"y","at":0}}\n',
    ])

    const iterator = readNdjsonStream(response)
    await iterator.next() // consume the first event; the stream stays open

    // Abandon the generator early. `.return()` drives execution through the generator's
    // `finally` block before its own promise resolves, so by the time this settles, the
    // production code has already had its chance to cancel the reader.
    await iterator.return?.(undefined)

    await expect(cancelCalled).resolves.toBe(true)
  })

  it('distinguishes error messages for different failure modes', async () => {
    // Test 1: Truncated final line
    try {
      const iterator = readNdjsonStream(
        responseOf(['{"type":"run-accepted","runToken":"t"}\n{"typ']),
      )
      await iterator.next()
      await iterator.next()
      expect.fail('should have thrown')
    } catch (err) {
      if (!(err instanceof NdjsonParseError)) throw err
      expect(err.message).toContain('not a complete JSON object')
    }

    // Test 2: Invalid JSON syntax
    try {
      const iterator = readNdjsonStream(responseOf(['not json\n']))
      await iterator.next()
      expect.fail('should have thrown')
    } catch (err) {
      if (!(err instanceof NdjsonParseError)) throw err
      expect(err.message).toContain('not valid JSON')
    }

    // Test 3: Missing response body
    try {
      const iterator = readNdjsonStream(new Response(null))
      await iterator.next()
      expect.fail('should have thrown')
    } catch (err) {
      if (!(err instanceof NdjsonParseError)) throw err
      expect(err.message).toContain('no body')
    }

    // Test 4: Invalid event type
    try {
      const iterator = readNdjsonStream(responseOf(['{"type":"invalid"}\n']))
      await iterator.next()
      expect.fail('should have thrown')
    } catch (err) {
      if (!(err instanceof NdjsonParseError)) throw err
      expect(err.message).toContain('unknown type')
    }
  })
})
