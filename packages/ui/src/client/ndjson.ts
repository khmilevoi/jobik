import * as errore from 'errore'
import type { RunStreamEvent } from './wire.js'

/**
 * The run stream is NDJSON: one JSON object per line, `\n`-terminated, `content-type`
 * `application/x-ndjson; charset=utf-8`. A chunk boundary can fall mid-line and mid-character, so
 * the reader decodes with a streaming `TextDecoder` and only ever parses a completed line.
 *
 * This generator *throws* rather than returning `T | Error`, because an async generator cannot
 * express a union return per element without polluting every consumer. `JobikClient.startRun`
 * does **not** catch it: its own returned Promise still resolves once the HTTP response and
 * headers are in hand, but the generator it hands back can throw `NdjsonParseError` from any
 * subsequent `.next()` call — i.e. straight into the consumer's `for await`. Whoever iterates the
 * stream that `startRun` returns owns that `try`/`catch`.
 */

/**
 * `message` is omitted from the template on purpose: `errore.createTaggedError` lets the caller
 * supply the message at construction time when the template is absent, which is exactly this
 * class's shape — one tag, four distinct failure modes, each with its own message built from the
 * line or type that triggered it. The base class still owns `this.message`, `messageTemplate` and
 * `fingerprint`; nothing here reassigns `this.message` after `super()`.
 */
export class NdjsonParseError extends errore.createTaggedError({
  name: 'NdjsonParseError',
}) {
  /** The offending line, when the failure is line-scoped. `null` for a missing response body. */
  readonly line: string | null

  constructor(args: { message: string; line?: string; cause?: unknown }) {
    super(args)
    this.line = args.line ?? null
  }
}

/**
 * Every literal `RunStreamEvent['type']` can take, keyed so `satisfies` enforces both directions
 * against the union: a key missing here fails to satisfy `Record<RunStreamEvent['type'], true>`,
 * and a key present here but absent from the union fails as an excess property. Add a case to
 * `RunStreamEvent` and this object must grow with it, or `typecheck` fails — no silent drift.
 */
const RUN_STREAM_EVENT_TYPES = {
  'run-accepted': true,
  'run-started': true,
  'node-status': true,
  'node-log': true,
  'run-settled': true,
  'run-failed': true,
} as const satisfies Record<RunStreamEvent['type'], true>

function isRunStreamEventType(type: unknown): type is RunStreamEvent['type'] {
  return typeof type === 'string' && type in RUN_STREAM_EVENT_TYPES
}

export async function* readNdjsonStream(
  response: Response,
): AsyncGenerator<RunStreamEvent, void, undefined> {
  const body = response.body
  if (body === null) throw new NdjsonParseError({ message: 'The response stream has no body' })

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''

  const parse = (line: string): RunStreamEvent => {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (cause) {
      throw new NdjsonParseError({
        message: `The run stream contained a line that is not valid JSON: ${line}`,
        line,
        cause,
      })
    }

    const type =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { type?: unknown }).type
        : undefined
    if (!isRunStreamEventType(type)) {
      throw new NdjsonParseError({
        message: `The run stream contained an event with an unknown type: ${String(type)}`,
        line,
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
        message: `The run stream ended in a line that is not a complete JSON object: ${tail}`,
        line: tail,
      })
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The stream may already be closed on normal completion — cancel() then throws, which is
      // expected and not a failure of teardown.
    }
    reader.releaseLock()
  }
}
