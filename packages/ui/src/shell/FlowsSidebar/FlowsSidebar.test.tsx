import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowsSidebar } from './FlowsSidebar.js'

afterEach(cleanup)

const flows = [
  { id: 'publication', name: 'publication', nodeCount: 3 },
  { id: 'digest', name: 'digest', nodeCount: 5 },
  { id: 'backfill', name: 'backfill', nodeCount: 2 },
]

const nodes = [
  { id: 'start1', kind: 'start', dot: 'start' as const },
  { id: 'render', kind: 'transform', dot: 'neutral' as const },
  { id: 'publish', kind: 'sink', dot: 'neutral' as const },
]

const inventory = [
  { name: 'start<T>', kind: 'entry' },
  { name: 'markdown', kind: 'transform' },
  { name: 'imageOut', kind: 'renderer' },
  { name: 'httpSink', kind: 'sink' },
]

function renderSidebar(onCollapse = () => {}) {
  return render(
    <FlowsSidebar
      flows={flows}
      activeFlowId="publication"
      nodes={nodes}
      selectedNodeId="start1"
      inventory={inventory}
      onCollapse={onCollapse}
    />,
  )
}

describe('FlowsSidebar', () => {
  it('renders the panel', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
  })

  it('heads the panel with its label and a collapse chevron', async () => {
    const onCollapse = vi.fn()
    renderSidebar(onCollapse)
    expect(screen.getByText('Flows & nodes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('labels the three groups, naming the active flow in the second', () => {
    renderSidebar()
    expect(screen.getByText('Flows')).toBeInTheDocument()
    expect(screen.getByText('Nodes in publication')).toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
  })

  it('lists every flow with its node count', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-flow-row-publication')).toHaveTextContent('publication3')
    expect(screen.getByTestId('studio-flow-row-digest')).toHaveTextContent('digest5')
  })

  it('lists every node with its kind and dot, marking the selected one', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-node-row-start1')).toHaveTextContent('start1start')
    expect(screen.getByTestId('studio-node-dot-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-node-row-render')).toHaveTextContent('rendertransform')
    expect(screen.getByTestId('studio-node-dot-render')).toBeInTheDocument()
  })

  it('lists the inventory read-only', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-inventory-row-markdown')).toHaveTextContent('markdown')
    expect(screen.getByTestId('studio-inventory-kind-markdown')).toHaveTextContent('transform')
  })

  it('exposes no interaction other than collapse', () => {
    renderSidebar()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('scrolls the lists rather than clipping them', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-sidebar-scroll')).toBeInTheDocument()
  })
})
