import type { CSSProperties } from 'react'
import {
  accent,
  fontFamilies,
  fontWeights,
  layout,
  motion,
  px,
  radii,
  tracking,
} from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import type { CardChrome } from './cardChrome.js'
import type { NodeCardData } from './types.js'

export interface NodeCardHeaderProps {
  readonly data: NodeCardData
  readonly chrome: CardChrome
}

const spinnerStyle: CSSProperties = {
  width: px(canvasMetrics.spinnerSize),
  height: px(canvasMetrics.spinnerSize),
  borderRadius: '50%',
  border: `${px(canvasMetrics.handleBorderWidth)} solid ${canvasColors.spinnerTrack}`,
  borderTopColor: accent.cssVar,
  animation: motion.spinner,
}

function statusLabel(data: NodeCardData): string | undefined {
  const parts = [data.status, data.elapsed].filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : parts.join(' · ')
}

export function NodeCardHeader(props: NodeCardHeaderProps) {
  const { data, chrome } = props
  const label = statusLabel(data)
  const wash =
    chrome.headerWash === undefined
      ? {}
      : {
          background: chrome.headerWash,
          borderRadius: `${px(canvasMetrics.headerRadius)} ${px(canvasMetrics.headerRadius)} 0 0`,
        }

  return (
    <div
      data-testid="node-card-header"
      style={{
        height: px(layout.nodeHeaderHeight),
        display: 'flex',
        alignItems: 'center',
        gap: px(8),
        padding: `0 ${px(canvasMetrics.cardPaddingX)}`,
        borderBottom: `1px solid ${chrome.headerDivider}`,
        ...wash,
      }}
    >
      {data.state === 'running' ? (
        <div data-testid="node-spinner" style={spinnerStyle} />
      ) : (
        <div
          data-testid="node-kind-dot"
          style={{
            width: px(canvasMetrics.kindDotSize),
            height: px(canvasMetrics.kindDotSize),
            borderRadius: px(radii.kindDot),
            background: chrome.kindDot,
          }}
        />
      )}

      <div
        data-testid="node-title"
        style={{
          fontSize: px(13),
          fontWeight: fontWeights.semibold,
          color: chrome.title,
          letterSpacing: tracking.title,
        }}
      >
        {data.id}
      </div>

      <div style={{ flex: 1 }} />

      {data.isStart === true ? (
        <div
          data-testid="node-start-tag"
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(9.5),
            letterSpacing: tracking.startTag,
            textTransform: 'uppercase',
            color: accent.cssVar,
          }}
        >
          start
        </div>
      ) : label === undefined ? null : (
        <div style={{ display: 'flex', alignItems: 'center', gap: px(5) }}>
          {data.statusDot === true ? (
            <div
              data-testid="node-status-dot"
              style={{
                width: px(canvasMetrics.statusDotSize),
                height: px(canvasMetrics.statusDotSize),
                borderRadius: '50%',
                background: chrome.status,
              }}
            />
          ) : null}
          <div
            data-testid="node-status"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(9.5),
              color: chrome.status,
            }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  )
}
