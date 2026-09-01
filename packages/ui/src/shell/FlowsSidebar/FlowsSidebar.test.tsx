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

/** `2A`'s own rows: `#221 2.4s` selected, `#220 failed`, `#219 2.4s`. */
const runs = [
  { id: '221', label: '#221', status: 'ok' as const, elapsed: '2.4s' },
  { id: '220', label: '#220', status: 'failed' as const },
  { id: '219', label: '#219', status: 'ok' as const, elapsed: '2.4s' },
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

/**
 * `2A` draws `Run history` exactly where `Studio — default` draws `Inventory`, with the panel
 * empty beneath it — the two sections stand in each other's place rather than stacking.
 */
describe('FlowsSidebar — run history', () => {
  it('keeps the inventory while no run has been recorded', () => {
    renderSidebar()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
    expect(screen.queryByText('Run history')).not.toBeInTheDocument()
  })

  it('takes the inventory’s place once there are runs', () => {
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={nodes}
        inventory={inventory}
        runs={runs}
        selectedRunId="221"
        onCollapse={() => {}}
      />,
    )
    expect(screen.getByText('Run history')).toBeInTheDocument()
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument()
    expect(screen.getByTestId('studio-run-row-221')).toHaveTextContent('#2212.4s')
    expect(screen.getByTestId('studio-run-meta-220')).toHaveTextContent('failed')
    expect(screen.getByTestId('studio-run-row-219')).toHaveTextContent('#2192.4s')
  })

  it('selects the run a row names', async () => {
    const onSelectRun = vi.fn()
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={nodes}
        inventory={inventory}
        runs={runs}
        selectedRunId="221"
        onSelectRun={onSelectRun}
        onCollapse={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('studio-run-row-220'))
    expect(onSelectRun).toHaveBeenCalledWith('220')
  })

  it('shows no duration for a run that carries none rather than inventing one', () => {
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={nodes}
        inventory={inventory}
        runs={[{ id: '222', label: '#222', status: 'ok' }]}
        onCollapse={() => {}}
      />,
    )
    expect(screen.getByTestId('studio-run-row-222')).toHaveTextContent('#222')
    expect(screen.queryByTestId('studio-run-meta-222')).not.toBeInTheDocument()
  })
})

/**
 * The `Start` section: every declared start, ahead of the full node list, clickable to move the
 * run panel's entry point. Drawn only once the flow declares more than one — a single-start flow
 * already names its one start in the node list below, so this section would draw one redundant row.
 */
describe('FlowsSidebar — start nodes', () => {
  const twoStarts = [
    { id: 'byName', kind: 'start', dot: 'start' as const },
    { id: 'byNumber', kind: 'start', dot: 'neutral' as const },
    { id: 'render', kind: 'transform', dot: 'neutral' as const },
  ]

  it('draws nothing for the single-start flow every artboard shows', () => {
    renderSidebar()
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
  })

  it('lists every declared start once there is more than one, marking the selected one', () => {
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={twoStarts}
        selectedNodeId="byName"
        inventory={inventory}
        onCollapse={() => {}}
      />,
    )
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByTestId('studio-start-row-byName')).toHaveTextContent('byName')
    expect(screen.getByTestId('studio-start-row-byNumber')).toHaveTextContent('byNumber')
    // The transform node never joins this section, only the node list below.
    expect(screen.queryByTestId('studio-start-row-render')).not.toBeInTheDocument()
  })

  it('reports the start a row names', async () => {
    const onSelectStart = vi.fn()
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={twoStarts}
        selectedNodeId="byName"
        inventory={inventory}
        onSelectStart={onSelectStart}
        onCollapse={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    expect(onSelectStart).toHaveBeenCalledWith('byNumber')
  })

  it('leaves the rows inert when no handler is given', async () => {
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={twoStarts}
        selectedNodeId="byName"
        inventory={inventory}
        onCollapse={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    expect(screen.getByTestId('studio-start-row-byNumber')).toBeInTheDocument()
  })
})

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

  it('takes each row’s dot tone from the row itself, `ok` included', () => {
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        nodes={[
          { id: 'start1', kind: 'start', dot: 'ok' },
          { id: 'render', kind: 'transform', dot: 'start' },
        ]}
        selectedNodeId="render"
        inventory={inventory}
        onCollapse={() => {}}
      />,
    )
    expect(screen.getByTestId('studio-node-dot-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-node-dot-render')).toBeInTheDocument()
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

  /**
   * This used to assert `getAllByRole('button')` had length 1 — "exposes no interaction other than
   * collapse". That stopped being true when the flow rows became real buttons, because the Studio
   * ships three flows now and could only ever load the first. The honest statement of what the
   * panel offers is: collapse, plus one button per flow, and nothing else — the node rows and the
   * inventory rows are still inert, which is what the old test was really protecting.
   */
  it('offers collapse and one button per flow, and no other interaction', () => {
    renderSidebar()
    expect(screen.getAllByRole('button')).toHaveLength(1 + flows.length)
    for (const flow of flows) {
      expect(screen.getByTestId(`studio-flow-row-${flow.id}`).tagName).toBe('BUTTON')
    }
    expect(screen.getByTestId('studio-node-row-start1').tagName).not.toBe('BUTTON')
    expect(screen.getByTestId('studio-inventory-row-markdown').tagName).not.toBe('BUTTON')
  })

  it('selects the flow a row names', async () => {
    const onSelectFlow = vi.fn()
    render(
      <FlowsSidebar
        flows={flows}
        activeFlowId="publication"
        onSelectFlow={onSelectFlow}
        nodes={nodes}
        selectedNodeId="start1"
        inventory={inventory}
        onCollapse={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('studio-flow-row-digest'))
    expect(onSelectFlow).toHaveBeenCalledWith('digest')
  })

  it('leaves the rows inert when no handler is given', async () => {
    renderSidebar()
    // No throw, no handler: a sidebar mounted without `onSelectFlow` is the read-only listing
    // every artboard draws, and pressing a row does nothing.
    await userEvent.click(screen.getByTestId('studio-flow-row-digest'))
    expect(screen.getByTestId('studio-flow-row-digest')).toBeInTheDocument()
  })

  it('scrolls the lists rather than clipping them', () => {
    renderSidebar()
    expect(screen.getByTestId('studio-sidebar-scroll')).toBeInTheDocument()
  })
})
