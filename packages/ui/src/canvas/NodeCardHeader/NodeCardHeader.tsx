import type { CardChrome } from '#canvas/cardChrome.js'
import type { NodeCardData } from '#canvas/types.js'
import { cx } from '#cx.js'
import s from './NodeCardHeader.module.css'

export interface NodeCardHeaderProps {
  readonly data: NodeCardData
  readonly chrome: CardChrome
}

function statusLabel(data: NodeCardData): string | undefined {
  const parts = [data.status, data.elapsed].filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : parts.join(' · ')
}

export function NodeCardHeader(props: NodeCardHeaderProps) {
  const { data, chrome } = props
  const label = statusLabel(data)

  return (
    <div data-testid="node-card-header" className={cx(s.header, chrome.header)}>
      {data.state === 'running' ? (
        <div data-testid="node-spinner" className={s.spinner} />
      ) : (
        <div data-testid="node-kind-dot" className={cx(s.kindDot, chrome.kindDot)} />
      )}

      <div data-testid="node-title" className={s.title}>
        {data.id}
      </div>

      <div className={s.spacer} />

      {data.isStart === true ? (
        <div data-testid="node-start-tag" className={s.startTag}>
          start
        </div>
      ) : label === undefined ? null : (
        <div className={s.statusGroup}>
          {data.statusDot === true ? (
            <div data-testid="node-status-dot" className={s.statusDot} />
          ) : null}
          <div data-testid="node-status" className={s.status}>
            {label}
          </div>
        </div>
      )}
    </div>
  )
}
