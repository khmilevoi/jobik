import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import * as jobik from '@jobik/core'
import * as z from 'zod'
import type { DiscoveredFlow, FlowRegistry } from './discovery.js'
import type { RunWireEvent } from './runWire.js'

/**
 * Probe flows for the run routes. Not exported from the barrel — the same status as
 * `testSupport.ts`.
 *
 * The publication example is offline, deterministic and instantaneous, which makes it the right
 * fixture for the happy path and the wrong one for three cases the run routes must cover: a
 * handler that THROWS (the only way a `NodeExecutionError` and therefore a trimmed stack is ever
 * produced), a handler that stays in flight long enough to be cancelled, and a handler that emits
 * a log line. Each probe is one node behind one start, over a document written to a temp
 * directory.
 *
 * `bindingPath` deliberately points at THIS module: the run route derives a flow's root as
 * `path.dirname(bindingPath)`, so the throwing probe's frames resolve inside it and the frames
 * assertion exercises the real relativisation rather than a synthetic one.
 */

const probeRoot = path.dirname(import.meta.filename)

/** Named, so the frame it produces has a function name worth asserting on. */
function raiseProbeFailure(): never {
  throw new Error('probe handler failure')
}

const probeStart = jobik.start({
  title: 'Probe start',
  input: z.object({ text: z.string() }),
})

const probeOutput = z.object({ ok: z.boolean() })
const probeInput = z.object({ text: z.string() })

const probeNodes = {
  throwing: jobik.node({
    title: 'Throwing probe',
    input: probeInput,
    output: probeOutput,
    run: () => raiseProbeFailure(),
  }),
  parking: jobik.node({
    title: 'Parking probe',
    input: probeInput,
    output: probeOutput,
    // Settles only when the run is aborted, so a cancel request always has something to cancel.
    run: (_input, context) =>
      new Promise<{ ok: boolean }>((resolve) => {
        context.signal.addEventListener('abort', () => resolve({ ok: false }), { once: true })
      }),
  }),
  logging: jobik.node({
    title: 'Logging probe',
    input: probeInput,
    output: probeOutput,
    run: (input, context) => {
      context.log(`probe saw ${input.text}`)
      return { ok: true }
    },
  }),
} as const

export type ProbeKind = keyof typeof probeNodes

/** The graph composition every probe shares: `start1.text` feeds `probe.text`. */
const probeDocument = {
  format: 'jobik.flow',
  version: 1,
  connections: [{ from: { node: 'start1', field: 'text' }, to: { node: 'probe', field: 'text' } }],
  literals: { probe: {} },
  layout: { start1: { x: 0, y: 0 }, probe: { x: 200, y: 0 } },
}

/** A discovered probe flow over a throwaway document. `cleanup` removes the temp directory. */
export async function createProbeFlow(kind: ProbeKind): Promise<{
  flow: DiscoveredFlow
  cleanup: () => Promise<void>
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-run-probe-'))
  const documentPath = path.join(directory, 'flow.jobik.json')
  await fs.writeFile(documentPath, `${JSON.stringify(probeDocument, null, 2)}\n`, 'utf8')
  const flow = jobik
    .flow(`probe-${kind}`)
    .start('start1', probeStart)
    .node('probe', probeNodes[kind])
    .bind('path', documentPath)
  return {
    flow: {
      id: flow.name,
      flow,
      bindingPath: path.join(probeRoot, 'runTestSupport.ts'),
      uiPath: path.join(probeRoot, 'runTestSupport.tsx'),
      documentPath,
    },
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  }
}

/** The smallest registry that answers `get`. */
export function registryOf(flows: readonly DiscoveredFlow[]): FlowRegistry {
  return { flows, get: (id) => flows.find((flow) => flow.id === id) }
}

/**
 * The NDJSON stream, one parsed event at a time.
 *
 * `Response.body` is an async iterable under Node's undici, but `lib.dom`'s `ReadableStream` does
 * not declare `Symbol.asyncIterator` and `DOM.AsyncIterable` is not in this package's `lib`, hence
 * the one cast. Iterating lazily is what lets the cancellation test read the first line, cancel,
 * and then drain the rest.
 */
export async function* readNdjson(response: Response): AsyncGenerator<RunWireEvent> {
  const body = response.body
  if (body === null) return
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      yield JSON.parse(buffer.slice(0, index)) as RunWireEvent
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
  }
}

/** Drain the rest of a stream into an array. */
export async function collectNdjson(events: AsyncGenerator<RunWireEvent>): Promise<RunWireEvent[]> {
  const collected: RunWireEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}
