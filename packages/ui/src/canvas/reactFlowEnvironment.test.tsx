import { cleanup, render, waitFor } from '@testing-library/react'
import { ReactFlow } from '@xyflow/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(cleanup)

const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, data: { label: 'a' }, style: { width: 120, height: 40 } },
  { id: 'b', position: { x: 300, y: 0 }, data: { label: 'b' }, style: { width: 120, height: 40 } },
]
const edges = [{ id: 'a-b', source: 'a', target: 'b' }]

describe('the jsdom React Flow environment', () => {
  it('measures nodes, so edges render', async () => {
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={nodes} edges={edges} proOptions={{ hideAttribution: true }} />
      </div>,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(1)
    })
  })

  it('gives ResizeObserver a callback that actually fires', async () => {
    let fired = false
    const target = document.createElement('div')
    const observer = new ResizeObserver(() => {
      fired = true
    })
    observer.observe(target)

    await waitFor(() => {
      expect(fired).toBe(true)
    })
    observer.disconnect()
  })
})
