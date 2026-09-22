import type { PersistedRunRecord } from '#client/wire.js'
import { applyRunEvent, createRunSession, type RunSession } from './runSession.js'

/** Replay saved events locally. Reading an archive never starts an execution. */
export function restoreRunSession(record: PersistedRunRecord): RunSession {
  let session = createRunSession({
    startId: record.startId,
    nodeIds: record.report?.nodes.map((node) => node.nodeId) ?? [],
    startedAt: record.createdAt,
    input: record.input,
    ...(record.document === null ? {} : { document: record.document }),
  })
  for (const event of record.events) session = applyRunEvent(session, event)
  if (record.report !== null)
    session = applyRunEvent(session, { type: 'run-settled', report: record.report })
  const incomplete = record.report === null
  return {
    ...session,
    runId: record.runId,
    runNumber: record.runNumber ?? session.runNumber,
    persisted: record,
    readOnly: true,
    runToken: undefined,
    cancelling: false,
    streamEnded: true,
    failure:
      record.failure ??
      session.failure ??
      (incomplete
        ? {
            _tag: null,
            message:
              record.status === 'running'
                ? 'This is a saved snapshot of a running execution. Reopen it to refresh.'
                : 'This execution was interrupted before a final report was saved.',
          }
        : undefined),
  }
}
