import { render } from '@testing-library/react'
import { ReactFlow } from '@xyflow/react'
import type { ReactNode } from 'react'

/**
 * Test-only. Not exported from any barrel.
 *
 * React Flow requires `nodeTypes` to be referentially stable, so the harness node type is a module
 * constant and the children travel through module state rather than through the type map.
 */
let harnessContent: ReactNode = null

function HarnessNode() {
  return <>{harnessContent}</>
}

const harnessNodeTypes = { harness: HarnessNode }
const harnessNodes = [{ id: 'harness-node', type: 'harness', position: { x: 0, y: 0 }, data: {} }]

/** Mounts `children` inside a real React Flow node — only context a `<Handle>` can live in. */
export function renderInNodeContext(children: ReactNode) {
  harnessContent = children
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow
        nodes={harnessNodes}
        edges={[]}
        nodeTypes={harnessNodeTypes}
        proOptions={{ hideAttribution: true }}
      />
    </div>,
  )
}
