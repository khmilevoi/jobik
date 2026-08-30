import * as errore from 'errore'
import type { RunStreamEvent } from './wire.js'

/**
 * The run stream is NDJSON: one JSON object per line, `\n`-terminated, `content-type`
 * `application/x-ndjson; charset=utf-8`. A chunk boundary can fall mid-line and mid-character, so
 * the reader decodes with a streaming `TextDecoder` and only ever parses a completed line.
 *
 * This generator *throws* rather than returning `T | Error`, because an async generator cannot
 * express a union return per element without polluting every consumer. `JobikClient.startRun`
 * catches it and turns it back into a value; nothing else calls this directly.
 */

export class NdjsonParseError extends errore.createTaggedError({
  name: 'NdjsonParseError',
  message: 'The run stream ended in a line that is not a complete JSON object: $line',
}) {}

export async function* readNdjsonStream(
  response: Response,
): AsyncGenerator<RunStreamEvent, void, undefined> {
  const body = response.body
  if (body === null) throw new NdjsonParseError({ line: '' })

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''

  const parse = (line: string): RunStreamEvent => {
    try {
      return JSON.parse(line) as RunStreamEvent
    } catch (cause) {
      throw new NdjsonParseError({ line, cause })
    }
  }

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.length > 0) yield parse(line)
        newline = buffer.indexOf('\n')
      }
    }

    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail.length > 0) throw new NdjsonParseError({ line: tail })
  } finally {
    reader.releaseLock()
  }
}
