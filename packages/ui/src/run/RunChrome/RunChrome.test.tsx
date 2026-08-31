import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunAction, RunDivider, RunSpinner, RunStatusDot, RunWell } from './RunChrome.js'

afterEach(cleanup)

describe('RunDivider', () => {
  it('renders under the test id every view looks the divider up by', () => {
    render(<RunDivider data-testid="d" />)
    expect(screen.getByTestId('d')).toBeInTheDocument()
  })
})

describe('RunWell', () => {
  it('renders its children', () => {
    render(
      <RunWell data-testid="w">
        <span>body</span>
      </RunWell>,
    )
    expect(screen.getByTestId('w')).toHaveTextContent('body')
  })

  it('separates the error tone from the neutral one', () => {
    render(<RunWell data-testid="neutral" />)
    render(<RunWell data-testid="error" tone="error" />)
    expect(screen.getByTestId('error').className).not.toBe(screen.getByTestId('neutral').className)
  })

  it('passes a padding override through as the custom property the tone rules read', () => {
    render(<RunWell data-testid="w" padding="8px 10px" />)
    expect(screen.getByTestId('w').style.getPropertyValue('--jbk-run-well-padding')).toBe(
      '8px 10px',
    )
  })
})

describe('RunAction', () => {
  it('is a button', () => {
    render(<RunAction data-testid="a">Copy log</RunAction>)
    expect(screen.getByTestId('a').tagName).toBe('BUTTON')
  })

  it('renders the keyboard hint only when one is supplied', () => {
    render(
      <RunAction data-testid="with" hint="esc">
        Cancel run
      </RunAction>,
    )
    expect(screen.getByText('esc')).toBeInTheDocument()
    cleanup()
    render(<RunAction data-testid="without">Copy log</RunAction>)
    expect(screen.queryByText('esc')).toBeNull()
  })

  it('separates the two weights the design draws', () => {
    render(<RunAction data-testid="regular">Copy log</RunAction>)
    render(
      <RunAction data-testid="medium" weight={500}>
        Cancel run
      </RunAction>,
    )
    expect(screen.getByTestId('medium').className).not.toBe(screen.getByTestId('regular').className)
  })

  it('reports its click', async () => {
    const onClick = vi.fn()
    render(<RunAction onClick={onClick}>Cancel run</RunAction>)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('RunStatusDot', () => {
  it('draws a different dot for each shape the design fixes', () => {
    render(<RunStatusDot data-testid="round" shape="round" />)
    render(<RunStatusDot data-testid="hollow" shape="hollow" />)
    render(<RunStatusDot data-testid="square" shape="square" />)
    const classes = ['round', 'hollow', 'square'].map((id) => screen.getByTestId(id).className)
    expect(new Set(classes).size).toBe(3)
  })

  /**
   * The three fills are what a node's state is read off, and one of them — `cached` — has no other
   * mark at all beyond the `cached · 0.0s` label. A resolver that collapsed two tones onto one
   * class would be invisible to every other test in this directory, so the branching is asserted
   * here rather than the colours, which now live in `RunChrome.module.css`.
   */
  it('draws a different fill for each of the three tones', () => {
    render(<RunStatusDot data-testid="ok" shape="round" tone="ok" />)
    render(<RunStatusDot data-testid="failed" shape="round" tone="failed" />)
    render(<RunStatusDot data-testid="cached" shape="round" tone="cached" />)
    const classes = ['ok', 'failed', 'cached'].map((id) => screen.getByTestId(id).className)
    expect(new Set(classes).size).toBe(3)
  })

  it('passes a colour override through as the custom property the fill reads', () => {
    render(<RunStatusDot data-testid="dot" shape="round" color="#6f9c82" />)
    expect(screen.getByTestId('dot').style.getPropertyValue('--jbk-run-dot-color')).toBe('#6f9c82')
  })
})

describe('RunSpinner', () => {
  it('renders under the test id the header and the active row look it up by', () => {
    render(<RunSpinner data-testid="s" />)
    expect(screen.getByTestId('s')).toBeInTheDocument()
  })
})
