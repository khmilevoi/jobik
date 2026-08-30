import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { accent, motion, statusColors, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { resolveCardChrome } from './cardChrome.js'
import { NodeCardHeader } from './NodeCardHeader.js'
import type { NodeCardData } from './types.js'

afterEach(cleanup)

function renderHeader(data: NodeCardData) {
  return render(
    <NodeCardHeader
      data={data}
      chrome={resolveCardChrome({
        state: data.state,
        selected: data.selected,
        isStart: data.isStart,
        kindDot: data.kindDot,
      })}
    />,
  )
}

describe('NodeCardHeader', () => {
  it('is 36px tall with the design gutter and the state divider', () => {
    renderHeader({ id: 'publish', state: 'idle', status: 'idle' })
    const header = screen.getByTestId('node-card-header')
    expect(header).toHaveStyle({
      height: '36px',
      padding: '0 12px',
      borderBottom: '1px solid #1c1f22',
    })
  })

  it('renders the node id at 13px/600 in the state title colour', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok', elapsed: '2.1s' })
    const title = screen.getByTestId('node-title')
    expect(title).toHaveTextContent('render')
    expect(title).toHaveStyle({ fontSize: '13px', fontWeight: '600', color: textColors.nodeTitle })
  })

  it('joins status and elapsed time with the design separator, right aligned in mono', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok', elapsed: '2.1s' })
    const status = screen.getByTestId('node-status')
    expect(status).toHaveTextContent('ok · 2.1s')
    expect(status).toHaveStyle({ fontSize: '9.5px', color: statusColors.ok })
  })

  it('renders a status alone when there is no elapsed time', () => {
    renderHeader({ id: 'publish', state: 'queued', status: 'queued' })
    expect(screen.getByTestId('node-status')).toHaveTextContent('queued')
    expect(screen.getByTestId('node-status')).not.toHaveTextContent('·')
  })

  it('renders an elapsed time alone, as the Node states running card does', () => {
    renderHeader({ id: 'render', state: 'running', elapsed: '1.3s' })
    expect(screen.getByTestId('node-status')).toHaveTextContent('1.3s')
  })

  it('adds the 5px round status dot only when asked, as the default artboard does', () => {
    renderHeader({ id: 'render', state: 'ok', kindDot: 'neutral', statusDot: true, status: 'ok' })
    expect(screen.getByTestId('node-status-dot')).toHaveStyle({
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: statusColors.ok,
    })
    expect(screen.getByTestId('node-kind-dot')).toHaveStyle({ background: '#3d4348' })
  })

  it('omits the status dot by default', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok' })
    expect(screen.queryByTestId('node-status-dot')).toBeNull()
  })

  it('replaces the status with the uppercase accent START tag on a start node', () => {
    renderHeader({ id: 'start1', state: 'idle', isStart: true, selected: true, status: 'idle' })
    const tag = screen.getByTestId('node-start-tag')
    expect(tag).toHaveTextContent('start')
    expect(tag).toHaveStyle({
      fontSize: '9.5px',
      textTransform: 'uppercase',
      color: accent.cssVar,
    })
    expect(tag.style.letterSpacing).toBe('0.08em')
    expect(screen.queryByTestId('node-status')).toBeNull()
  })

  it('swaps the kind dot for the 11px spinner while running', () => {
    renderHeader({ id: 'render', state: 'running', status: 'running', elapsed: '1.3s' })
    const spinner = screen.getByTestId('node-spinner')
    expect(spinner).toHaveStyle({
      width: '11px',
      height: '11px',
      borderRadius: '50%',
      borderTopWidth: '1.5px',
      borderTopStyle: 'solid',
      borderTopColor: accent.cssVar,
      borderRightColor: canvasColors.spinnerTrack,
      borderBottomColor: canvasColors.spinnerTrack,
      borderLeftColor: canvasColors.spinnerTrack,
      animation: motion.spinner,
    })
    expect(screen.queryByTestId('node-kind-dot')).toBeNull()
  })

  it('wears the accent header wash and the rounded top corners when highlighted', () => {
    renderHeader({ id: 'render', state: 'running', elapsed: '1.3s' })
    expect(screen.getByTestId('node-card-header')).toHaveStyle({
      background: accent.headerWash,
      borderRadius: '6px 6px 0 0',
    })
  })

  it('wears the error wash and divider on a failed card', () => {
    renderHeader({ id: 'render', state: 'failed', status: 'failed', elapsed: '0.8s' })
    expect(screen.getByTestId('node-card-header')).toHaveStyle({
      background: canvasColors.failedHeaderWash,
      borderBottom: `1px solid ${canvasColors.failedHeaderDivider}`,
    })
    expect(screen.getByTestId('node-status')).toHaveStyle({ color: statusColors.failed })
  })
})
