import { reatomComponent } from '@reatom/react'
import type { CardChrome } from '#canvas/cardChrome.js'
import type { NodeCardData } from '#canvas/types.js'
import { cx } from '#cx.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './NodeCardHeader.module.css'

export interface NodeCardHeaderProps {
  readonly data: NodeCardData
  readonly chrome: CardChrome
}

/**
 * `### Node status suffixes` (`07-copy.md`): `idle`, `queued`, `done · 0.0s`, `ok · 2.1s`,
 * `running · 1.3s`, `failed · 0.8s`, `cached · 0.0s`. An un-run card carries no status of its own,
 * and `Studio — default` prints `idle` on exactly that card, so the word is the idle state's own
 * default rather than something every caller has to remember to pass.
 */
const IDLE_STATUS = 'idle'

/** The suffix a run put on the card — never the idle default. */
function runStatusLabel(data: NodeCardData): string | undefined {
  const parts = [data.status, data.elapsed].filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : parts.join(' · ')
}

/**
 * The header's trailing cell.
 *
 * `Studio — default` prints the accent kind badge on its un-run `start1`; `2A` prints
 * `done · 0.0s` on the same node once a run has settled it. So a run status outranks the badge,
 * and the badge outranks the idle default — which is why the idle word is resolved after the
 * start check rather than inside `runStatusLabel`.
 */
function trailingStatus(data: NodeCardData): string | undefined {
  const fromRun = runStatusLabel(data)
  if (fromRun !== undefined) return fromRun
  // `3D` invalid board: the marked card prints `1 error` where a run would print its status, and
  // it outranks the `START` tag and the idle word for the same reason a run status does — it is
  // the newest thing that happened to this node.
  if (data.problemCount !== undefined) return data.problemCount
  if (data.isStart === true) return undefined
  return data.state === 'idle' ? IDLE_STATUS : undefined
}

/**
 * The header of the card it is inside.
 *
 * It keeps both props rather than reading the overlay itself. `chrome` has no model home at all —
 * `resolveCardChrome` derives it from the card's state, selection and `3D` mark together, and it is
 * the card that knows all three — and `data` is the card's own merged data, which the card has
 * already read `nodeOverlay(id)` for. A second read here would be a second subscription to the same
 * computed for the same node, one render deeper, and would still leave `chrome` in props.
 */
export const NodeCardHeader = reatomComponent(function NodeCardHeader(props: NodeCardHeaderProps) {
  const { data, chrome } = props
  const label = trailingStatus(data)
  const showStartTag =
    data.isStart === true && runStatusLabel(data) === undefined && data.problemCount === undefined

  return (
    <div data-testid="node-card-header" className={cx(s.header, chrome.header)}>
      {data.state === 'running' || data.state === 'retrying' ? (
        <Spinner size={11} data-testid="node-spinner" />
      ) : (
        <div data-testid="node-kind-dot" className={cx(s.kindDot, chrome.kindDot)} />
      )}

      <div data-testid="node-title" className={s.title}>
        {data.id}
      </div>

      <div className={s.spacer} />

      {showStartTag ? (
        <div data-testid="node-start-tag" className={s.startTag}>
          start
        </div>
      ) : label === undefined ? null : (
        <div className={s.statusGroup}>
          {data.statusDot === true ? (
            <div data-testid="node-status-dot" className={s.statusDot} />
          ) : null}
          <div
            data-testid="node-status"
            className={cx(s.status, data.statusDot === true && s.statusMuted)}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  )
}, 'NodeCardHeader')
