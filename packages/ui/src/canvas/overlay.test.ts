import { describe, expect, it } from 'vitest'
import type { NodeOverlay } from '#studio/graphModel.js'
import { applyNodeOverlay } from './overlay.js'
import type { NodeCardData } from './types.js'

/**
 * The merge a card makes between what the document declares and what the run has said about it.
 *
 * It is the half of `studio/graphModel.ts`'s `toCanvasNodes` that moved into the card, so what these
 * cases pin is the precedence — the same one `studio/graphModel.test.ts` states for the array —
 * plus the two things only the split can get wrong: an overlay that says nothing must not erase
 * what `data` said, and a card with no overlay must come back untouched, identity included.
 */

const CARD: NodeCardData = {
  id: 'render',
  state: 'idle',
  status: 'idle',
  inputs: [
    { name: 'title', annotation: 'string' },
    { name: 'caption', annotation: 'string', problem: 'unsourced' },
  ],
  outputs: [{ name: 'image', annotation: 'Buffer' }],
}

const RUNNING: NodeOverlay = {
  state: 'running',
  status: 'running',
  progress: 0.62,
  inputAnnotation: 'received',
  outputAnnotation: 'pending',
}

describe('applyNodeOverlay', () => {
  it('hands the card straight back when the model has nothing to say about it', () => {
    expect(applyNodeOverlay(CARD, undefined)).toBe(CARD)
  })

  it('takes the run state, the status and the progress from the overlay', () => {
    const decorated = applyNodeOverlay(CARD, RUNNING)
    expect(decorated.state).toBe('running')
    expect(decorated.status).toBe('running')
    expect(decorated.progress).toBe(0.62)
  })

  it('replaces every field annotation a run has one for, on both sides', () => {
    const decorated = applyNodeOverlay(CARD, RUNNING)
    expect(decorated.inputs?.[0]?.annotation).toBe('received')
    expect(decorated.outputs?.[0]?.annotation).toBe('pending')
  })

  it('leaves a port `3D` has marked spelling out its finding, not the run’s annotation', () => {
    const decorated = applyNodeOverlay(CARD, RUNNING)
    expect(decorated.inputs?.[1]?.annotation).toBe('string')
    expect(decorated.inputs?.[1]?.problem).toBe('unsourced')
  })

  it('keeps what the card states where the overlay states nothing', () => {
    const decorated = applyNodeOverlay(CARD, { state: 'cached' })
    expect(decorated.status).toBe('idle')
    expect(decorated.state).toBe('cached')
  })

  it('leaves the structural half of the card alone', () => {
    const start: NodeCardData = { id: 'start1', state: 'idle', isStart: true, selected: true }
    const decorated = applyNodeOverlay(start, { state: 'ok', elapsed: '2.1s', statusDot: true })
    expect(decorated).toMatchObject({
      id: 'start1',
      isStart: true,
      selected: true,
      state: 'ok',
      elapsed: '2.1s',
      statusDot: true,
    })
  })

  it('carries the whole detail and slot the overlay built', () => {
    const decorated = applyNodeOverlay(CARD, {
      state: 'queued',
      detail: { kind: 'queued', waitingOn: 'render.image' },
      outputSlot: { source: 'imageOut' },
    })
    expect(decorated.detail).toEqual({ kind: 'queued', waitingOn: 'render.image' })
    expect(decorated.outputSlot).toEqual({ source: 'imageOut' })
  })
})
