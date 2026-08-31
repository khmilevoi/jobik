import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveCardChrome } from '#canvas/cardChrome.js'
import type { NodeCardData } from '#canvas/types.js'
import { NodeCardHeader } from './NodeCardHeader.js'

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
  it('renders the node id as the title', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok', elapsed: '2.1s' })
    expect(screen.getByTestId('node-title')).toHaveTextContent('render')
  })

  it('joins status and elapsed time with the design separator', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok', elapsed: '2.1s' })
    expect(screen.getByTestId('node-status')).toHaveTextContent('ok · 2.1s')
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

  it('renders no status at all when the card carries neither', () => {
    renderHeader({ id: 'render', state: 'idle' })
    expect(screen.queryByTestId('node-status')).toBeNull()
  })

  it('adds the status dot only when asked, as the default artboard does', () => {
    renderHeader({ id: 'render', state: 'ok', kindDot: 'neutral', statusDot: true, status: 'ok' })
    expect(screen.getByTestId('node-status-dot')).toBeInTheDocument()
    expect(screen.getByTestId('node-kind-dot')).toBeInTheDocument()
  })

  it('omits the status dot by default', () => {
    renderHeader({ id: 'render', state: 'ok', status: 'ok' })
    expect(screen.queryByTestId('node-status-dot')).toBeNull()
  })

  it('replaces the status with the START tag on a start node', () => {
    renderHeader({ id: 'start1', state: 'idle', isStart: true, selected: true, status: 'idle' })
    expect(screen.getByTestId('node-start-tag')).toHaveTextContent('start')
    expect(screen.queryByTestId('node-status')).toBeNull()
  })

  it('swaps the kind dot for the spinner while running', () => {
    renderHeader({ id: 'render', state: 'running', status: 'running', elapsed: '1.3s' })
    expect(screen.getByTestId('node-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('node-kind-dot')).toBeNull()
  })
})
