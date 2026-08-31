import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInNodeContext } from '../canvasTestUtils.js'
import { NodeFieldRow } from './NodeFieldRow.js'

afterEach(cleanup)

describe('NodeFieldRow', () => {
  it('puts the field name left and the type annotation right', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )

    await screen.findByTestId('field-row-target-title')
    expect(screen.getByTestId('field-name')).toHaveTextContent('title')
    expect(screen.getByTestId('field-annotation')).toHaveTextContent('string')
  })

  it('wraps only a dimmed annotation in its own span, so a pending row reads as one', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'pending' }}
        direction="source"
        isStart={false}
        live={false}
      />,
    )
    expect(await screen.findByTestId('field-annotation-dim')).toHaveTextContent('pending')
  })

  it('leaves an ordinary annotation unwrapped', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )
    await screen.findByTestId('field-row-target-title')
    expect(screen.queryByTestId('field-annotation-dim')).toBeNull()
  })

  it('renders a source handle for an output row', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="source"
        isStart
        live
      />,
    )
    expect(await screen.findByTestId('field-handle-source-title')).toBeInTheDocument()
  })

  it('renders a target handle for an input row', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'Buffer' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )
    expect(await screen.findByTestId('field-handle-target-image')).toBeInTheDocument()
  })
})
