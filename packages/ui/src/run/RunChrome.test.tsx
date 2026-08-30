import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunAction, RunDivider, RunSpinner, RunStatusDot, RunWell } from './RunChrome.js'

afterEach(cleanup)

describe('RunDivider', () => {
  it('is the 1px inline hairline', () => {
    render(<RunDivider data-testid="d" />)
    const divider = screen.getByTestId('d')
    expect(divider.style.height).toBe('1px')
    expect(divider.style.background).toBe('rgb(22, 24, 27)')
  })
})

describe('RunWell', () => {
  it('draws the neutral well the partial output, the stack and the text outputs share', () => {
    render(
      <RunWell data-testid="w">
        <span>body</span>
      </RunWell>,
    )
    const well = screen.getByTestId('w')
    expect(well.style.border).toBe('1px solid rgb(28, 31, 34)')
    expect(well.style.background).toBe('rgb(12, 14, 16)')
    expect(well.style.borderRadius).toBe('5px')
    expect(well.style.padding).toBe('10px')
  })

  it('draws the error well of the failed state', () => {
    render(<RunWell data-testid="w" tone="error" />)
    const well = screen.getByTestId('w')
    expect(well.style.border).toBe('1px solid rgb(42, 31, 30)')
    expect(well.style.background).toBe('rgb(13, 11, 11)')
    expect(well.style.padding).toBe('11px')
  })

  it('takes the text padding of an output well', () => {
    render(<RunWell data-testid="w" padding="8px 10px" />)
    expect(screen.getByTestId('w').style.padding).toBe('8px 10px')
  })
})

describe('RunAction', () => {
  it('is the 34px outlined action of Cancel run and Copy log', () => {
    render(<RunAction data-testid="a">Copy log</RunAction>)
    const action = screen.getByTestId('a')
    expect(action.tagName).toBe('BUTTON')
    expect(action.style.height).toBe('34px')
    expect(action.style.borderRadius).toBe('5px')
    expect(action.style.border).toBe('1px solid rgb(42, 46, 50)')
    expect(action.style.width).toBe('100%')
    expect(action.style.fontSize).toBe('12.5px')
    expect(action.style.color).toBe('rgb(207, 213, 218)')
    expect(action.style.fontWeight).toBe('400')
  })

  it('carries a mono hint in the type-annotation step and the medium weight of Cancel run', () => {
    render(
      <RunAction data-testid="a" hint="esc" weight={500}>
        Cancel run
      </RunAction>,
    )
    expect(screen.getByTestId('a').style.fontWeight).toBe('500')
    const hint = screen.getByText('esc')
    expect(hint.style.fontFamily).toContain('JetBrains Mono')
    expect(hint.style.fontSize).toBe('10px')
    expect(hint.style.color).toBe('rgb(93, 101, 108)')
  })

  it('reports its click', async () => {
    const onClick = vi.fn()
    render(<RunAction onClick={onClick}>Cancel run</RunAction>)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('RunStatusDot', () => {
  it('is the 5px round filled dot of an ok node', () => {
    render(<RunStatusDot data-testid="dot" shape="round" color="#6f9c82" />)
    const dot = screen.getByTestId('dot')
    expect(dot.style.width).toBe('5px')
    expect(dot.style.height).toBe('5px')
    expect(dot.style.borderRadius).toBe('50%')
    expect(dot.style.background).toBe('rgb(111, 156, 130)')
  })

  it('is the 5px hollow dot of a queued node', () => {
    render(<RunStatusDot data-testid="dot" shape="hollow" />)
    const dot = screen.getByTestId('dot')
    expect(dot.style.width).toBe('5px')
    expect(dot.style.border).toBe('1px solid rgb(52, 57, 61)')
    expect(dot.style.background).toBe('')
  })

  it('is the 6px square dot of a state header', () => {
    render(<RunStatusDot data-testid="dot" shape="square" color="#c96a5c" />)
    const dot = screen.getByTestId('dot')
    expect(dot.style.width).toBe('6px')
    expect(dot.style.height).toBe('6px')
    expect(dot.style.borderRadius).toBe('2px')
    expect(dot.style.background).toBe('rgb(201, 106, 92)')
  })
})

describe('RunSpinner', () => {
  it('is the 9px .7s ring with an accent top', () => {
    render(<RunSpinner data-testid="s" />)
    const spinner = screen.getByTestId('s')
    expect(spinner.style.width).toBe('9px')
    expect(spinner.style.borderRadius).toBe('50%')
    expect(spinner.style.animation).toBe('jspin .7s linear infinite')
    expect(spinner.getAttribute('style')).toContain('rgba(31, 214, 189, 0.25)')
    expect(spinner.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
  })
})
