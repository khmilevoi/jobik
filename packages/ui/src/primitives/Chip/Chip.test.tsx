import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Chip, chipBox } from './Chip.js'

afterEach(cleanup)

describe('Chip', () => {
  it('renders leading, children and trailing content in order', () => {
    render(
      <Chip data-testid="chip" leading={<span>dot</span>} trailing={<span>Cancel</span>}>
        Running
      </Chip>,
    )
    expect(screen.getByTestId('chip')).toHaveTextContent('dotRunningCancel')
  })
})

describe('chipBox', () => {
  /**
   * A custom property that a *prop* feeds is plumbing between a caller and a rule, not appearance:
   * the rule's value lives in `Chip.module.css`, but whether the caller's number reaches it at all
   * is this function's own behaviour and nothing else tests it. Class names are never asserted.
   */
  it('carries the caller`s gap through as a custom property, and none when unasked', () => {
    expect(chipBox({ gap: 7 }).style).toEqual({ '--jbk-chip-gap': '7px' })
    expect(chipBox().style).toBeUndefined()
  })
})
