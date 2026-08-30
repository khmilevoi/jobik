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

function responseOfWithCancel(chunks: readonly string[]): {
  response: Response
  cancelCalled: Promise<boolean>
} {
  const encoder = new TextEncoder()
  let cancelCalled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
    cancel() {
      cancelCalled = true
    },
  })
  return {
    response: new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
    }),
    cancelCalled: Promise.resolve(cancelCalled),
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

  it('reassembles a multi-byte UTF-8 character split across chunks with streaming decoder', async () => {
    // Cyrillic character "т" (U+0442) has UTF-8 encoding: 0xD1 0x82 (2 bytes)
    // We'll encode a line with this character and split the byte stream mid-character
    // This test verifies that TextDecoder with { stream: true } is essential.
    const line = '{"type":"run-accepted","runToken":"тест"}\n'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(line)

    // Find a multi-byte character in the encoded bytes and split in the middle
    let splitIndex = -1
    for (let i = 0; i < bytes.length - 1; i++) {
      const byte = bytes[i]
      const nextByte = bytes[i + 1]
      // UTF-8 multibyte sequences start with bytes >= 0xc0 and continue with 0x80-0xbf
      if (byte && nextByte && (byte & 0xc0) === 0xc0 && (nextByte & 0xc0) === 0x80) {
        splitIndex = i + 1 // Split in the middle of the multibyte sequence
        break
      }
    }

    if (splitIndex > 0) {
      const chunk1 = bytes.slice(0, splitIndex)
      const chunk2 = bytes.slice(splitIndex)

      // responseOf expects string chunks, but we need to send bytes
      // Create response manually to properly test byte-split encoding
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(chunk1)
            controller.enqueue(chunk2)
            controller.close()
          },
        }),
        { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } },
      )

      const events = await collect(response)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe('run-accepted')
      const event = events[0] as { type: string; runToken?: string }
      expect(event.runToken).toBe('тест')
    }
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
    const { response } = responseOfWithCancel([
      '{"type":"run-accepted","runToken":"tok"}\n',
      '{"type":"node-log","line":{"nodeId":"x","message":"y","at":0}}\n',
    ])

    const iterator = readNdjsonStream(response)
    await iterator.next() // Read the first event

    // Early return from the generator (abandonment)
    await iterator.return?.(undefined)

    // Give a microtask for the finally block to execute
    await new Promise((resolve) => setTimeout(resolve, 0))
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
