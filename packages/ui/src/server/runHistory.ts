import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import type { PersistedRunRecord, PersistedRunSummary, RunStreamEvent } from '../client/wire.js'
import type { DiscoveredFlow } from './discovery.js'
import type { RunWireEvent, WireNodeReport, WireRunReport } from './runWire.js'

export type RunHistoryOptions = {
  readonly directory: string
  /** Copy application-owned media before publishing this node's archival snapshot. */
  readonly onNodeSettled?: (args: {
    runId: string
    flowId: string
    node: WireNodeReport
    // biome-ignore lint/suspicious/noConfusingVoidType: author callbacks may return no value or an error value.
  }) => Promise<void | Error>
}

export class RunPersistenceError extends errore.createTaggedError({
  name: 'RunPersistenceError',
  message: 'Run history could not be $operation',
}) {}

export const RUN_STORAGE_WARNING = {
  _tag: 'RunPersistenceError',
  message: 'Run outputs could not be fully saved. Execution was not repeated.',
} as const

const active = new Set<string>()
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const errorSchema = z.object({ _tag: z.string().nullable(), message: z.string() }).passthrough()
const nodeSchema = z.object({
  nodeId: z.string(),
  status: z.enum(jobik.nodeStatuses),
  elapsedMs: z.number(),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
  output: z.record(z.string(), z.unknown()).nullable(),
  assets: z.record(
    z.string(),
    z.object({
      id: z.string().regex(idPattern),
      type: z.literal('Buffer'),
      mime: z.string(),
      bytes: z.number(),
    }),
  ),
  error: errorSchema.nullable(),
})
const reportSchema = z.object({
  flowName: z.string(),
  startId: z.string(),
  runNumber: z.number(),
  runId: z.string().optional(),
  storageError: errorSchema.optional(),
  status: z.enum(['ok', 'failed', 'cancelled']),
  elapsedMs: z.number(),
  nodes: z.array(nodeSchema),
  logs: z.array(z.object({ nodeId: z.string(), message: z.string(), at: z.number() })),
  error: errorSchema.nullable(),
})
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run-accepted'), runToken: z.string(), runId: z.string().optional() }),
  z.object({
    type: z.literal('run-started'),
    flowName: z.string(),
    startId: z.string(),
    runNumber: z.number(),
    nodeCount: z.number(),
  }),
  z.object({
    type: z.literal('node-status'),
    nodeId: z.string(),
    status: z.enum(jobik.nodeStatuses),
    elapsedMs: z.number(),
    error: errorSchema.nullable(),
  }),
  z.object({ type: z.literal('node-settled'), runNumber: z.number(), node: nodeSchema }),
  z.object({
    type: z.literal('node-log'),
    line: z.object({ nodeId: z.string(), message: z.string(), at: z.number() }),
  }),
  z.object({ type: z.literal('run-settled'), report: reportSchema }),
  z.object({ type: z.literal('run-failed'), error: errorSchema }),
])
const recordSchema = z.object({
  source: z.literal('studio-export').optional(),
  schemaVersion: z.literal(1),
  runId: z.string().regex(idPattern),
  flowId: z.string(),
  startId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  status: z.enum(['running', 'ok', 'failed', 'cancelled', 'interrupted']),
  runNumber: z.number().nullable(),
  input: z.unknown(),
  document: jobik.flowDocumentSchema.nullable(),
  revision: z.string().nullable(),
  report: reportSchema.nullable(),
  events: z.array(eventSchema),
  failure: errorSchema.nullable(),
  storageError: errorSchema.optional(),
})
const assetSchema = z.object({
  id: z.string().regex(idPattern),
  mime: z
    .string()
    .min(1)
    .regex(/^[\w.+-]+\/[\w.+-]+$/),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const runHistoryDirectory = (flow: DiscoveredFlow): string =>
  flow.runHistory?.directory ?? path.resolve(process.cwd(), '.jobik/runs')

function wrapIo(cause: unknown) {
  return new RunPersistenceError({ operation: 'saved or read', cause })
}

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function readJson(file: string): Promise<{ value: unknown } | null | Error> {
  const bytes = await fs
    .readFile(file, 'utf8')
    .catch((cause) => (missing(cause) ? null : wrapIo(cause)))
  if (bytes instanceof Error || bytes === null) return bytes
  return errore.try({ try: () => ({ value: JSON.parse(bytes) as unknown }), catch: wrapIo })
}

async function saveJson(file: string, value: unknown) {
  const contents = errore.try({ try: () => `${JSON.stringify(value, null, 2)}\n`, catch: wrapIo })
  if (contents instanceof Error) return contents
  const result = await jobik.writeFileAtomic({ path: file, contents })
  return result instanceof Error ? wrapIo(result) : undefined
}

async function saveAsset(args: { flow: DiscoveredFlow; descriptor: jobik.AssetDescriptor }) {
  if (!idPattern.test(args.descriptor.id)) return wrapIo(new Error('Invalid asset identity'))
  const entry = jobik.readAsset(args.descriptor.id)
  if (entry === null) return wrapIo(new Error('Asset bytes are no longer available'))
  const directory = path.join(runHistoryDirectory(args.flow), 'assets')
  const created = await fs.mkdir(directory, { recursive: true }).catch(wrapIo)
  if (created instanceof Error) return created
  const target = path.join(directory, args.descriptor.id)
  // A UUID identifies immutable bytes; fsync the new binary before publishing its manifest.
  const written = await errore.tryAsync({
    try: async () => {
      const temporary = `${target}.${crypto.randomUUID()}.tmp`
      try {
        const handle = await fs.open(temporary, 'wx')
        try {
          await handle.writeFile(entry.data)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, `${target}.bin`)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    },
    catch: wrapIo,
  })
  if (written instanceof Error) return written
  return saveJson(`${target}.json`, {
    id: args.descriptor.id,
    mime: entry.mime,
    bytes: entry.data.byteLength,
    sha256: crypto.createHash('sha256').update(entry.data).digest('hex'),
  })
}

export async function readPersistedAsset(args: { flow: DiscoveredFlow; assetId: string }) {
  if (!idPattern.test(args.assetId)) return null
  const target = path.join(runHistoryDirectory(args.flow), 'assets', args.assetId)
  const json = await readJson(`${target}.json`)
  if (json instanceof Error || json === null) return json
  const parsed = assetSchema.safeParse(json.value)
  if (!parsed.success || parsed.data.id !== args.assetId)
    return wrapIo(new Error('Invalid asset manifest'))
  const data = await fs.readFile(`${target}.bin`).catch(wrapIo)
  if (data instanceof Error) return data
  if (
    data.byteLength !== parsed.data.bytes ||
    crypto.createHash('sha256').update(data).digest('hex') !== parsed.data.sha256
  )
    return wrapIo(new Error('Persisted asset bytes do not match their manifest'))
  return { data, mime: parsed.data.mime }
}

export async function readPersistedRun(args: {
  flow: DiscoveredFlow
  runId: string
}): Promise<PersistedRunRecord | null | Error> {
  if (!idPattern.test(args.runId)) return null
  const json = await readJson(
    path.join(runHistoryDirectory(args.flow), 'records', `${args.runId}.json`),
  )
  if (json instanceof Error || json === null) return json
  const parsed = recordSchema.safeParse(json.value)
  if (!parsed.success) return wrapIo(parsed.error)
  const record = parsed.data as unknown as PersistedRunRecord
  if (record.runId !== args.runId || record.flowId !== args.flow.id) return null
  return record.status === 'running' && !active.has(record.runId)
    ? { ...record, status: 'interrupted' }
    : record
}

export async function listPersistedRuns(
  flow: DiscoveredFlow,
): Promise<PersistedRunSummary[] | Error> {
  const directory = path.join(runHistoryDirectory(flow), 'records')
  const names = await fs.readdir(directory).catch((cause) => (missing(cause) ? [] : wrapIo(cause)))
  if (names instanceof Error) return names
  const result: PersistedRunSummary[] = []
  for (const name of names) {
    if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5))) continue
    const record = await readPersistedRun({ flow, runId: name.slice(0, -5) })
    if (record instanceof Error) {
      console.warn('jobik: could not read an archived run')
      continue
    }
    if (record === null) continue
    const { runId, flowId, startId, createdAt, updatedAt, status, runNumber } = record
    result.push({ runId, flowId, startId, createdAt, updatedAt, status, runNumber })
  }
  return result.sort((a, b) => b.createdAt - a.createdAt || b.runId.localeCompare(a.runId))
}

export async function createRunArchive(args: {
  flow: DiscoveredFlow
  startId: string
  input: unknown
  document: jobik.FlowDocument | null
  revision: string | null
  source?: 'studio-export'
  createdAt?: number
}) {
  const runId = crypto.randomUUID()
  const directory = path.join(runHistoryDirectory(args.flow), 'records')
  const created = await fs.mkdir(directory, { recursive: true }).catch(wrapIo)
  if (created instanceof Error) return created
  const file = path.join(directory, `${runId}.json`)
  const now = Date.now()
  let record: PersistedRunRecord = {
    schemaVersion: 1,
    runId,
    flowId: args.flow.id,
    startId: args.startId,
    createdAt: args.createdAt ?? now,
    updatedAt: now,
    status: 'running',
    runNumber: null,
    ...(args.source === undefined ? {} : { source: args.source }),
    input: args.input,
    document: args.document,
    revision: args.revision,
    report: null,
    events: [],
    failure: null,
  }
  const initial = await saveJson(file, record)
  if (initial instanceof Error) return initial
  active.add(runId)
  let queue = Promise.resolve()
  let storageError: Error | null = null
  function remember(error: Error) {
    if (storageError === null) console.warn('jobik: run result could not be fully archived')
    storageError ??= error
    record = { ...record, storageError: RUN_STORAGE_WARNING }
  }
  async function persist(event: RunWireEvent) {
    record = {
      ...record,
      updatedAt: Date.now(),
      events: [...record.events, event as RunStreamEvent],
    }
    if (event.type === 'run-started') record = { ...record, runNumber: event.runNumber }
    if (event.type === 'run-failed') record = { ...record, status: 'failed', failure: event.error }
    if (event.type === 'node-settled') {
      for (const descriptor of Object.values(event.node.assets)) {
        const saved = await saveAsset({ flow: args.flow, descriptor })
        if (saved instanceof Error) remember(saved)
      }
      const hook = args.flow.runHistory?.onNodeSettled
      if (hook !== undefined) {
        const saved = await errore.tryAsync({
          try: () => hook({ runId, flowId: args.flow.id, node: event.node }),
          catch: wrapIo,
        })
        if (saved instanceof Error) remember(saved)
      }
    }
    if (event.type === 'run-settled')
      record = {
        ...record,
        status: event.report.status,
        runNumber: event.report.runNumber,
        report: {
          ...event.report,
          runId,
          ...(storageError === null ? {} : { storageError: RUN_STORAGE_WARNING }),
        },
      }
    const saved = await saveJson(file, record)
    if (saved instanceof Error) remember(saved)
  }
  return {
    runId,
    enqueue(event: RunWireEvent) {
      queue = queue
        .then(() => persist(event))
        .catch((cause) => {
          remember(wrapIo(cause))
        })
    },
    async flush() {
      await queue
      return storageError ?? undefined
    },
    close() {
      active.delete(runId)
    },
  }
}

/** Import a report exported before persistence existed, without inventing missing inputs. */
export async function importRunArchive(args: {
  flow: DiscoveredFlow
  report: WireRunReport
  input?: unknown
  document?: jobik.FlowDocument
  revision?: string
  createdAt?: number
}) {
  const parsed = reportSchema.safeParse(args.report)
  if (!parsed.success) return wrapIo(parsed.error)
  const archive = await createRunArchive({
    flow: args.flow,
    startId: args.report.startId,
    input: args.input ?? null,
    document: args.document ?? null,
    revision: args.revision ?? null,
    source: 'studio-export',
    ...(args.createdAt === undefined ? {} : { createdAt: args.createdAt }),
  })
  if (archive instanceof Error) return archive
  for (const node of args.report.nodes)
    archive.enqueue({ type: 'node-settled', runNumber: args.report.runNumber, node })
  archive.enqueue({ type: 'run-settled', report: args.report })
  const storageError = await archive.flush()
  archive.close()
  return { runId: archive.runId, ...(storageError === undefined ? {} : { storageError }) }
}
