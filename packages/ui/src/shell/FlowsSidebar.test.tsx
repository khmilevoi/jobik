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
  it('draws the 248px panel', () => {
    renderSidebar()
    const panel = screen.getByTestId('studio-sidebar')
    expect(panel.style.width).toBe('248px')
    expect(panel.style.flex).toBe('0 0 auto')
    expect(panel.style.background).toBe('rgb(10, 11, 13)')
    expect(panel.style.borderRight).toBe('1px solid rgb(23, 25, 28)')
    expect(panel.style.flexDirection).toBe('column')
  })

  it('heads the panel with the uppercase mono label and a collapse chevron', async () => {
    const onCollapse = vi.fn()
    renderSidebar(onCollapse)
    const label = screen.getByText('Flows & nodes')
    expect(label.style.fontSize).toBe('9.5px')
    expect(label.style.textTransform).toBe('uppercase')
    expect(label.style.color).toBe('rgb(91, 97, 103)')
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('labels the three groups, naming the active flow in the second', () => {
    renderSidebar()
    expect(screen.getByText('Flows').style.padding).toBe('14px 10px 6px 14px')
    expect(screen.getByText('Nodes in publication').style.padding).toBe('20px 10px 6px 14px')
    expect(screen.getByText('Inventory').style.padding).toBe('20px 10px 6px 14px')
  })

  it('fills the active flow row and leaves the others quiet', () => {
    renderSidebar()
    const active = screen.getByTestId('studio-flow-row-publication')
    expect(active.style.height).toBe('30px')
    expect(active.style.background).toBe('rgb(19, 21, 24)')
    expect(active.style.border).toBe('1px solid rgb(32, 36, 39)')
    expect(screen.getByText('publication').style.color).toBe('rgb(232, 234, 236)')
    expect(screen.getByText('publication').style.fontWeight).toBe('500')
    expect(screen.getByText('3').style.color).toBe('rgb(95, 103, 110)')

    const quiet = screen.getByTestId('studio-flow-row-digest')
    expect(quiet.style.background).toBe('')
    expect(quiet.style.border).toBe('')
    expect(screen.getByText('digest').style.color).toBe('rgb(141, 148, 154)')
    expect(screen.getByText('5').style.color).toBe('rgb(78, 85, 91)')
  })

  it('marks the start node with the accent dot and the selected node with the row wash', () => {
    renderSidebar()
    const startDot = screen.getByTestId('studio-node-dot-start1')
    expect(startDot.style.width).toBe('6px')
    expect(startDot.style.borderRadius).toBe('2px')
    expect(startDot.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
    expect(screen.getByTestId('studio-node-dot-render').style.background).toBe('rgb(61, 67, 72)')

    const selected = screen.getByTestId('studio-node-row-start1')
    expect(selected.style.background).toBe('rgb(17, 19, 22)')
    expect(screen.getByText('start1').style.color).toBe('rgb(223, 227, 230)')
    expect(screen.getByTestId('studio-node-row-render').style.background).toBe('')
    expect(screen.getByText('render').style.color).toBe('rgb(170, 177, 183)')
  })

  it('lists the inventory read-only, with an Archivo kind label', () => {
    renderSidebar()
    const row = screen.getByTestId('studio-inventory-row-markdown')
    expect(row.style.height).toBe('28px')
    expect(screen.getByText('start<T>').style.fontFamily).toContain('JetBrains Mono')
    const kind = screen.getByTestId('studio-inventory-kind-markdown')
    expect(kind.style.fontSize).toBe('11px')
    expect(kind.style.color).toBe('rgb(78, 85, 91)')
    expect(kind.style.fontFamily).toBe('')
  })

  it('exposes no interaction other than collapse', () => {
    renderSidebar()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('scrolls the lists rather than clipping them', () => {
    renderSidebar()
    const scroll = screen.getByTestId('studio-sidebar-scroll')
    expect(scroll.style.flex).toBe('1 1 0%')
    expect(scroll.style.minHeight).toBe('0px')
    expect(scroll.style.overflowY).toBe('auto')
  })
})
