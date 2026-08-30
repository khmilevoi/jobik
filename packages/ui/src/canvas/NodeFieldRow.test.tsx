import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { accent, textColors } from '../tokens.js'
import { renderInNodeContext } from './canvasTestUtils.js'
import { canvasColors } from './canvasTokens.js'
import { NodeFieldRow } from './NodeFieldRow.js'

afterEach(cleanup)

describe('NodeFieldRow', () => {
  it('is a 30px row with the field name left and the mono annotation right', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )

    const row = await screen.findByTestId('field-row-target-title')
    expect(row).toHaveStyle({
      height: '30px',
      padding: '0 12px',
      justifyContent: 'space-between',
      position: 'relative',
    })
    expect(screen.getByTestId('field-name')).toHaveTextContent('title')
    expect(screen.getByTestId('field-name')).toHaveStyle({
      fontSize: '11.5px',
      color: textColors.fieldLabel,
    })
    expect(screen.getByTestId('field-annotation')).toHaveTextContent('string')
    expect(screen.getByTestId('field-annotation')).toHaveStyle({ fontSize: '10px' })
  })

  it('activates the label on a start node', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'markdown', annotation: 'string' }}
        direction="source"
        isStart
        live
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toHaveStyle({
        color: textColors.activeFieldLabel,
      })
    })
  })

  it('dims both the label and the annotation on a pending row', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'pending' }}
        direction="source"
        isStart={false}
        live={false}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('field-name')).toHaveStyle({
        color: canvasColors.fieldLabelDim,
      })
    })
    expect(screen.getByTestId('field-annotation-dim')).toHaveStyle({
      color: canvasColors.annotationDim,
    })
  })

  it('renders a source handle on the right edge, accent when the field is live', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="source"
        isStart
        live
      />,
    )
    const handle = await screen.findByTestId('field-handle-source-title')
    expect(handle).toHaveStyle({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: canvasColors.handleFill,
      border: `1.5px solid ${accent.cssVar}`,
      right: '-4px',
      top: '50%',
      transform: 'translateY(-50%)',
    })
  })

  it('renders a target handle on the left edge, idle when the field is not live', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'Buffer' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )
    const handle = await screen.findByTestId('field-handle-target-image')
    expect(handle).toHaveStyle({
      left: '-4px',
      border: `1.5px solid ${canvasColors.handleIdle}`,
    })
  })
})
