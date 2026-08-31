import { describe, expect, it } from 'vitest'
import { resolveCardChrome, resolveCardWidth } from './cardChrome.js'
import type { NodeRunState } from './types.js'

/**
 * `resolveCardChrome` is a pure function and this stays a pure-function test: it asserts the
 * branching of the `Node states` table, not the colours the table resolves to. Those live in
 * `cardChrome.module.css`, and `canvasTokens.css.test.ts` is what keeps them honest.
 */

const STATES: readonly NodeRunState[] = ['idle', 'queued', 'running', 'ok', 'failed', 'cached']

describe('resolveCardChrome — the state axis', () => {
  it('gives every one of the six states its own card treatment', () => {
    const cards = STATES.map((state) => resolveCardChrome({ state }).card)
    expect(new Set(cards).size).toBe(STATES.length)
  })

  it('washes the header only on the states that carry one', () => {
    expect(resolveCardChrome({ state: 'idle' }).header).toBe('')
    expect(resolveCardChrome({ state: 'queued' }).header).toBe('')
    expect(resolveCardChrome({ state: 'ok' }).header).toBe('')
    expect(resolveCardChrome({ state: 'cached' }).header).toBe('')
    expect(resolveCardChrome({ state: 'running' }).header).not.toBe('')
    expect(resolveCardChrome({ state: 'failed' }).header).not.toBe('')
  })
})

describe('resolveCardChrome — selection', () => {
  it('adds the selection treatment on top of the state', () => {
    const idle = resolveCardChrome({ state: 'idle' })
    const selected = resolveCardChrome({ state: 'idle', selected: true })
    expect(selected.card).not.toBe(idle.card)
    expect(selected.card.startsWith(idle.card)).toBe(true)
    expect(selected.header).not.toBe('')
  })

  it('selects a running card whether or not it was asked to, per the Node states artboard', () => {
    expect(resolveCardChrome({ state: 'running' }).card).toBe(
      resolveCardChrome({ state: 'running', selected: true }).card,
    )
  })

  it('keeps the failed treatment when the failed card is also selected', () => {
    expect(resolveCardChrome({ state: 'failed', selected: true })).toEqual(
      resolveCardChrome({ state: 'failed' }),
    )
  })

  it('leaves an unselected card alone', () => {
    expect(resolveCardChrome({ state: 'ok', selected: false }).card).toBe(
      resolveCardChrome({ state: 'ok' }).card,
    )
  })
})

describe('resolveCardChrome — the kind dot', () => {
  it('derives the dot from the state when the card does not name one', () => {
    const dot = (state: NodeRunState, isStart?: boolean) =>
      resolveCardChrome({ state, isStart }).kindDot

    // A start node always wears the accent dot, whatever it is doing.
    expect(dot('idle', true)).toBe(dot('running', true))
    // ok, failed and running share the status-coloured dot.
    expect(dot('ok')).toBe(dot('failed'))
    expect(dot('ok')).toBe(dot('running'))
    // queued, cached and idle each have their own.
    expect(new Set([dot('queued'), dot('cached'), dot('idle'), dot('ok')]).size).toBe(4)
  })

  it('lets a card name its own dot, as the default artboard asks for neutral on an ok card', () => {
    expect(resolveCardChrome({ state: 'ok', kindDot: 'neutral' }).kindDot).toBe(
      resolveCardChrome({ state: 'idle' }).kindDot,
    )
    expect(resolveCardChrome({ state: 'ok', kindDot: 'cached' }).kindDot).toBe(
      resolveCardChrome({ state: 'cached' }).kindDot,
    )
  })
})

describe('resolveCardChrome — the section label', () => {
  it('drops a queued card to the faintest step', () => {
    expect(resolveCardChrome({ state: 'queued' }).sectionLabel).not.toBe(
      resolveCardChrome({ state: 'idle' }).sectionLabel,
    )
  })

  it('lifts the label on a selected card, whether or not it is the start node', () => {
    const step = resolveCardChrome({ state: 'idle', selected: true, isStart: true }).sectionLabel
    expect(step).not.toBe(resolveCardChrome({ state: 'idle' }).sectionLabel)
    expect(resolveCardChrome({ state: 'ok', selected: true }).sectionLabel).toBe(step)
  })

  it('lifts it on a running card too, which wears the selection treatment whole', () => {
    expect(resolveCardChrome({ state: 'running' }).sectionLabel).toBe(
      resolveCardChrome({ state: 'idle', selected: true }).sectionLabel,
    )
  })

  it('keeps the ordinary label on an unselected start', () => {
    expect(resolveCardChrome({ state: 'ok', isStart: true }).sectionLabel).toBe(
      resolveCardChrome({ state: 'ok' }).sectionLabel,
    )
  })

  it('lets queued outrank selection, as the resolver has always ordered them', () => {
    expect(resolveCardChrome({ state: 'queued', selected: true, isStart: true }).sectionLabel).toBe(
      resolveCardChrome({ state: 'queued' }).sectionLabel,
    )
  })
})

describe('resolveCardWidth', () => {
  it('uses the design width for each of the three card shapes', () => {
    expect(resolveCardWidth({ id: 'start1', state: 'idle', isStart: true })).toBe(230)
    expect(resolveCardWidth({ id: 'render', state: 'ok', outputSlot: { caption: 'x' } })).toBe(316)
    expect(resolveCardWidth({ id: 'publish', state: 'idle' })).toBe(236)
  })

  it('lets a card override the width, as the Node states artboard does at 288', () => {
    expect(resolveCardWidth({ id: 'render', state: 'ok', width: 288 })).toBe(288)
  })
})

/**
 * `3D` — the validation axis. It is orthogonal to the run state, and it outranks selection for the
 * same reason `failed` does: the accent border would paint over the mark.
 */
describe('resolveCardChrome — the 3D validation mark', () => {
  it('gives the two marks two different treatments, on top of the state', () => {
    const idle = resolveCardChrome({ state: 'idle' })
    const error = resolveCardChrome({ state: 'idle', problem: 'error' })
    const blocked = resolveCardChrome({ state: 'idle', problem: 'blocked' })

    expect(error.card).not.toBe(idle.card)
    expect(blocked.card).not.toBe(idle.card)
    expect(error.card).not.toBe(blocked.card)
    expect(error.card.startsWith(idle.card)).toBe(true)
  })

  it('washes the header on the marked card and not on the blocked one', () => {
    expect(resolveCardChrome({ state: 'idle', problem: 'error' }).header).not.toBe('')
    expect(resolveCardChrome({ state: 'idle', problem: 'blocked' }).header).toBe('')
  })

  it('keeps the mark when the marked card is also selected', () => {
    expect(resolveCardChrome({ state: 'idle', problem: 'error', selected: true })).toEqual(
      resolveCardChrome({ state: 'idle', problem: 'error' }),
    )
  })

  it('paints the dot in the card own status colour, and the blocked one queued grey', () => {
    const marked = resolveCardChrome({ state: 'idle', isStart: true, problem: 'error' })
    const blocked = resolveCardChrome({ state: 'idle', isStart: true, problem: 'blocked' })
    const start = resolveCardChrome({ state: 'idle', isStart: true })

    expect(marked.kindDot).not.toBe(start.kindDot)
    expect(blocked.kindDot).toBe(resolveCardChrome({ state: 'queued' }).kindDot)
  })
})
