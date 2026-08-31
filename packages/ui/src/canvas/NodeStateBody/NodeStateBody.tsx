import { cx, type StyleWithVars } from '../../cx.js'
import { px, radii } from '../../tokens.js'
import { canvasMetrics } from '../canvasTokens.js'
import { StripePlaceholder } from '../StripePlaceholder/StripePlaceholder.js'
import type { NodeCardDetail } from '../types.js'
import s from './NodeStateBody.module.css'

export interface NodeStateBodyProps {
  readonly detail: NodeCardDetail
  /** `canvasColors.metadata` on an ok card, `textColors.typeAnnotation` otherwise. */
  readonly captionColor: string
}

export interface MetadataRowProps {
  readonly parts: readonly string[]
  /** `Node states` ok (design 714) is `10px`; the in-canvas slot's caption row (204) is `9.5px`. */
  readonly fontSize?: number
  /** `8px` between the cells on the `Node states` card (714), `10px` in the slot caption (204). */
  readonly gap?: number
}

/** `1024×1024 · png · 412 kb` — the mono metadata row of an ok node. */
export function MetadataRow(props: MetadataRowProps) {
  const items = props.parts.map((part, index) => ({ key: `part-${index}-${part}`, part }))
  // Only an override travels; the artboard default lives in the rule's own fallback.
  const style: StyleWithVars = {
    ...(props.fontSize === undefined ? {} : { '--jbk-metadata-row-size': px(props.fontSize) }),
    ...(props.gap === undefined ? {} : { '--jbk-metadata-row-gap': px(props.gap) }),
  }
  return (
    <div data-testid="node-metadata-row" className={s.metadataRow} style={style}>
      {items.map((item, index) => (
        <span key={item.key} className={s.part}>
          {index === 0 ? null : <span className={s.separator}> · </span>}
          <span>{item.part}</span>
        </span>
      ))}
    </div>
  )
}

/** The bar weights are the caller's, so each one rides in as the property the rule reads. */
function barStyle(weight: number): StyleWithVars {
  return { '--jbk-placeholder-bar-flex': weight }
}

function QueuedBody(props: { readonly waitingOn: string; readonly weights: readonly number[] }) {
  const bars = props.weights.map((weight, index) => ({ key: `bar-${index}`, weight }))
  return (
    <div data-testid="node-state-queued" className={s.body}>
      <div data-testid="node-waiting-on" className={s.waitingOn}>
        Waiting on <span className={s.waitingOnField}>{props.waitingOn}</span>
      </div>
      <div className={s.bars}>
        {bars.map((bar) => (
          <div
            key={bar.key}
            data-testid="node-placeholder-bar"
            className={s.bar}
            style={barStyle(bar.weight)}
          />
        ))}
      </div>
    </div>
  )
}

export function NodeStateBody(props: NodeStateBodyProps) {
  const { detail } = props
  // The caller's colour is a value the stylesheet cannot know — an ok card reads the metadata
  // step, every other state the type-annotation step — so it rides in as a custom property.
  const captionStyle: StyleWithVars = { '--jbk-node-caption-color': props.captionColor }

  if (detail.kind === 'queued') {
    return <QueuedBody waitingOn={detail.waitingOn} weights={detail.placeholderBars ?? [1, 1, 2]} />
  }

  if (detail.kind === 'failed') {
    return (
      <div data-testid="node-state-failed" className={cx(s.body, s.failedBody)}>
        <div data-testid="node-error-well" className={s.errorWell}>
          <div data-testid="node-error-name" className={s.errorName}>
            {detail.errorName}
          </div>
          <div data-testid="node-error-message" className={s.errorMessage}>
            {detail.message}
          </div>
        </div>
        <div className={s.actions}>
          <button
            type="button"
            data-testid="node-view-trace"
            onClick={detail.onViewTrace}
            className={cx(s.action, s.viewTrace)}
          >
            View trace
          </button>
          <button
            type="button"
            data-testid="node-retry"
            onClick={detail.onRetry}
            className={cx(s.action, s.retry)}
          >
            Retry node
          </button>
        </div>
      </div>
    )
  }

  const dimmed = detail.dimmed === true

  const mediaBlock =
    detail.skeleton === true ? (
      <div data-testid="node-state-media-block" className={cx(s.mediaBlock, s.mediaSkeleton)}>
        {detail.skeletonLabel === undefined ? null : (
          <div data-testid="node-state-skeleton-label" className={s.skeletonLabel}>
            {detail.skeletonLabel}
          </div>
        )}
      </div>
    ) : detail.content === undefined ? (
      <StripePlaceholder
        data-testid="node-state-media-block"
        height={canvasMetrics.stateMediaHeight}
        radius={radii.small}
        label={dimmed ? undefined : 'image output'}
        opacity={dimmed ? canvasMetrics.cachedOpacity : undefined}
      />
    ) : (
      <div
        data-testid="node-state-media-block"
        className={cx(s.mediaBlock, s.mediaContent, dimmed && s.mediaDimmed)}
      >
        {detail.content}
      </div>
    )

  return (
    <div data-testid="node-state-media" className={s.body}>
      {mediaBlock}
      {detail.caption === undefined ? null : (
        <div data-testid="node-state-caption" className={s.caption} style={captionStyle}>
          {detail.caption}
        </div>
      )}
    </div>
  )
}
