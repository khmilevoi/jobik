import type { CSSProperties } from 'react'
import {
  fontFamilies,
  fontWeights,
  motion,
  px,
  radii,
  statusColors,
  surfaces,
  textColors,
} from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import { StripePlaceholder } from './StripePlaceholder.js'
import type { NodeCardDetail } from './types.js'

export interface NodeStateBodyProps {
  readonly detail: NodeCardDetail
  /** `canvasColors.metadata` on an ok card, `textColors.typeAnnotation` otherwise. */
  readonly captionColor: string
}

const body: CSSProperties = {
  padding: px(canvasMetrics.stateBodyPadding),
  display: 'flex',
  flexDirection: 'column',
  gap: px(8),
}

const action: CSSProperties = {
  height: px(26),
  padding: `0 ${px(10)}`,
  borderRadius: px(radii.small),
  display: 'flex',
  alignItems: 'center',
  fontFamily: fontFamilies.ui,
  fontSize: px(11.5),
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
  return (
    <div
      data-testid="node-metadata-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: px(props.gap ?? 8),
        fontFamily: fontFamilies.mono,
        fontSize: px(props.fontSize ?? 10),
        color: canvasColors.metadata,
      }}
    >
      {items.map((item, index) => (
        <span key={item.key} style={{ display: 'contents' }}>
          {index === 0 ? null : <span style={{ color: canvasColors.metadataSeparator }}> · </span>}
          <span>{item.part}</span>
        </span>
      ))}
    </div>
  )
}

function QueuedBody(props: { readonly waitingOn: string; readonly weights: readonly number[] }) {
  const bars = props.weights.map((weight, index) => ({ key: `bar-${index}`, weight }))
  return (
    <div data-testid="node-state-queued" style={body}>
      <div
        data-testid="node-waiting-on"
        style={{ fontSize: px(11.5), color: canvasColors.fieldLabelDim, lineHeight: 1.5 }}
      >
        Waiting on{' '}
        <span style={{ fontFamily: fontFamilies.mono, color: textColors.inactiveListItem }}>
          {props.waitingOn}
        </span>
      </div>
      <div style={{ display: 'flex', gap: px(6) }}>
        {bars.map((bar) => (
          <div
            key={bar.key}
            data-testid="node-placeholder-bar"
            style={{
              height: px(canvasMetrics.placeholderBarHeight),
              flex: bar.weight,
              borderRadius: px(3),
              background: canvasColors.placeholderBar,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function NodeStateBody(props: NodeStateBodyProps) {
  const { detail } = props

  if (detail.kind === 'queued') {
    return <QueuedBody waitingOn={detail.waitingOn} weights={detail.placeholderBars ?? [1, 1, 2]} />
  }

  if (detail.kind === 'failed') {
    return (
      <div data-testid="node-state-failed" style={{ ...body, gap: px(10) }}>
        <div
          data-testid="node-error-well"
          style={{
            border: `1px solid ${canvasColors.failedWellBorder}`,
            borderRadius: px(radii.control),
            background: surfaces.failedErrorWell,
            padding: '9px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: px(5),
          }}
        >
          <div
            data-testid="node-error-name"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(10.5),
              color: statusColors.errorTag,
            }}
          >
            {detail.errorName}
          </div>
          <div
            data-testid="node-error-message"
            style={{ fontSize: px(11.5), color: statusColors.errorBody, lineHeight: 1.5 }}
          >
            {detail.message}
          </div>
        </div>
        <div style={{ display: 'flex', gap: px(8) }}>
          <button
            type="button"
            data-testid="node-view-trace"
            onClick={detail.onViewTrace}
            style={{
              ...action,
              border: `1px solid ${canvasColors.failedActionBorder}`,
              background: 'none',
              color: canvasColors.failedActionLabel,
            }}
          >
            View trace
          </button>
          <button
            type="button"
            data-testid="node-retry"
            onClick={detail.onRetry}
            style={{
              ...action,
              border: 'none',
              background: statusColors.failed,
              fontWeight: fontWeights.semibold,
              color: canvasColors.failedSolidLabel,
            }}
          >
            Retry node
          </button>
        </div>
      </div>
    )
  }

  const mediaBlock =
    detail.skeleton === true ? (
      <div
        data-testid="node-state-media-block"
        style={{
          height: px(canvasMetrics.stateMediaHeight),
          borderRadius: px(radii.small),
          background: canvasColors.skeleton,
          backgroundSize: canvasMetrics.skeletonBackgroundSize,
          animation: motion.shimmer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {detail.skeletonLabel === undefined ? null : (
          <div
            data-testid="node-state-skeleton-label"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(10),
              color: canvasColors.annotationDim,
              animation: motion.pulseSlow,
            }}
          >
            {detail.skeletonLabel}
          </div>
        )}
      </div>
    ) : detail.content === undefined ? (
      <StripePlaceholder
        data-testid="node-state-media-block"
        height={canvasMetrics.stateMediaHeight}
        radius={radii.small}
        label={detail.dimmed === true ? undefined : 'image output'}
        opacity={detail.dimmed === true ? canvasMetrics.cachedOpacity : undefined}
      />
    ) : (
      <div
        data-testid="node-state-media-block"
        style={{
          height: px(canvasMetrics.stateMediaHeight),
          borderRadius: px(radii.small),
          overflow: 'hidden',
          ...(detail.dimmed === true ? { opacity: canvasMetrics.cachedOpacity } : {}),
        }}
      >
        {detail.content}
      </div>
    )

  return (
    <div data-testid="node-state-media" style={body}>
      {mediaBlock}
      {detail.caption === undefined ? null : (
        <div
          data-testid="node-state-caption"
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(10),
            color: props.captionColor,
          }}
        >
          {detail.caption}
        </div>
      )}
    </div>
  )
}
