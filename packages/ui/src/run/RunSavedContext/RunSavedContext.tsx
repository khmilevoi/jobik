import { reatomComponent } from '@reatom/react'
import { RunWell } from '#run/RunChrome/RunChrome.js'
import type { RunSavedSnapshot } from '#run/types.js'
import s from './RunSavedContext.module.css'

export const RunSavedContext = reatomComponent(function RunSavedContext(props: {
  readonly snapshot?: RunSavedSnapshot
  readonly storageWarning?: string
}) {
  const snapshot = props.snapshot
  return (
    <>
      {props.storageWarning === undefined ? null : (
        <RunWell tone="error" data-testid="run-storage-warning" className={s.context}>
          Result storage failed: {props.storageWarning}. The execution outcome is unchanged.
        </RunWell>
      )}
      {snapshot === undefined ? null : (
        <RunWell data-testid="run-saved-context" className={s.context}>
          <div>Saved run · read only</div>
          <div>
            {snapshot.startId} · {snapshot.runId ?? 'local session'}
          </div>
          <details open>
            <summary>Original inputs</summary>
            <pre className={s.json}>{JSON.stringify(snapshot.input, null, 2)}</pre>
          </details>
          <details>
            <summary>Saved graph · {snapshot.revision ?? 'revision unavailable'}</summary>
            <pre className={s.json}>{JSON.stringify(snapshot.document ?? null, null, 2)}</pre>
          </details>
          <div>
            The canvas remains the current editable flow. This result uses the saved context above.
          </div>
        </RunWell>
      )}
    </>
  )
}, 'RunSavedContext')
