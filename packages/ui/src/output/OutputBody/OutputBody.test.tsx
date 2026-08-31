import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { OutputComponentProps } from '#output/flowUi.js'
import { OutputBody } from './OutputBody.js'

afterEach(cleanup)

const output = { caption: 'Release 0.4' }

function SurfaceProbe(props: OutputComponentProps) {
  return <div data-testid="surface-probe">{props.surface}</div>
}

const descriptor = { nodes: { render: { Output: SurfaceProbe } } }

function body(tab: 'preview' | 'raw' | 'logs', surface: 'viewer' | 'dock' = 'viewer') {
  return (
    <OutputBody
      nodeId="render"
      output={output}
      descriptor={descriptor}
      raw={output}
      logs={[{ time: '0.00', message: 'start1 → emit title, markdown' }]}
      tab={tab}
      surface={surface}
    />
  )
}

describe('OutputBody', () => {
  it('renders the flow-local component on Preview', () => {
    render(body('preview'))
    expect(screen.getByTestId('surface-probe')).toHaveTextContent('viewer')
    expect(screen.queryByTestId('output-logs')).toBeNull()
  })

  it('tells the flow-local component which surface it is on', () => {
    render(body('preview', 'dock'))
    expect(screen.getByTestId('surface-probe')).toHaveTextContent('dock')
  })

  it('renders the line-numbered JSON on Raw', () => {
    render(body('raw'))
    expect(screen.getAllByTestId('raw-json-gutter').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('surface-probe')).toBeNull()
  })

  it('renders the log lines on Logs', () => {
    render(body('logs'))
    expect(screen.getByTestId('output-logs')).toHaveTextContent('start1 → emit title, markdown')
  })

  it('falls back to the generic JSON view when no component is registered', () => {
    render(
      <OutputBody
        nodeId="unregistered"
        output={output}
        raw={output}
        logs={[]}
        tab="preview"
        surface="viewer"
      />,
    )
    expect(screen.getByTestId('generic-output')).toBeInTheDocument()
  })
})
