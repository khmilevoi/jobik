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

class NdjsonParseErrorBase extends errore.createTaggedError({
  name: 'NdjsonParseError',
  message: 'The run stream ended in a line that is not a complete JSON object: $line',
}) {}

export class NdjsonParseError extends NdjsonParseErrorBase {
  constructor(fields: Record<string, unknown> = {}) {
    // Provide a default line value if not present, to satisfy the base constructor
    const line =
      typeof fields.line === 'string' || typeof fields.line === 'number' ? fields.line : ''
    const fieldsWithDefault = {
      ...fields,
      line,
    }
    super(fieldsWithDefault)
    // Override the message based on the specific error type
    if ('customMessage' in fields && typeof fields.customMessage === 'string') {
      this.message = fields.customMessage
    } else if ('message' in fields && typeof fields.message === 'string') {
      // Interpolate template in the provided message
      let msg = fields.message as string
      for (const [key, value] of Object.entries(fields)) {
        if (key !== 'message' && key !== 'customMessage' && key !== 'cause') {
          msg = msg.replace(new RegExp(`\\$${key}`, 'g'), String(value))
        }
      }
      this.message = msg
    }
  }
}

const VALID_TYPES = [
  'run-accepted',
  'run-started',
  'node-status',
  'node-log',
  'run-settled',
  'run-failed',
] as const

export async function* readNdjsonStream(
  response: Response,
): AsyncGenerator<RunStreamEvent, void, undefined> {
  const body = response.body
  if (body === null)
    throw new NdjsonParseError({ customMessage: 'The response stream has no body' })

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''

  const parse = (line: string): RunStreamEvent => {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (cause) {
      throw new NdjsonParseError({
        line,
        cause,
        message: 'The run stream contained a line that is not valid JSON: $line',
      })
    }

    // Validate the type discriminant
    if (!parsed || typeof parsed !== 'object') {
      throw new NdjsonParseError({
        line,
        type: 'not an object',
        message: 'The run stream contained an event with an unknown type: $type',
      })
    }

    const type = (parsed as Record<string, unknown>).type
    if (!VALID_TYPES.includes(type as never)) {
      throw new NdjsonParseError({
        line,
        type: String(type),
        message: 'The run stream contained an event with an unknown type: $type',
      })
    }

    return parsed as RunStreamEvent
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
    if (tail.length > 0)
      throw new NdjsonParseError({
        line: tail,
        message: 'The run stream ended in a line that is not a complete JSON object: $line',
      })
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Ignore errors from cancel — may already be closed
    }
    reader.releaseLock()
  }
}
