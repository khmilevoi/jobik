import type { FlowDocument } from '@jobik/core'
import { atom, context, wrap } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, SafeFlowDescriptorPayload, ValidatePayload } from '#client/index.js'
import { JobikTransportError } from '#client/index.js'
import { ACTION_TIMINGS } from '#primitives/index.js'
import type { StudioDeps, ValidationModel } from './types.js'
import { reatomValidation } from './validation.js'

/**
 * The model's own tests for `validate()`, the result's lifetime, and artboard `3D`'s chip.
 *
 * The first five cases were `useStudioSession.test.ts` cases and keep their names; the chip cases
 * keep the names `primitives/actionState.test.ts` gave the same transitions, because that is what
 * this model now performs. That file is untouched and still covers `createValidateAction`, which
 * `StudioApp` uses until the wave that rewrites it.
 *
 * **Every promise this file awaits is a `wrap`ped one.** `context.start(async …)` holds its frame
 * only across wrapped boundaries; resuming from a bare `await` puts the reads that follow in the
 * DEFAULT context, where these atoms have never been written (RTM-A04).
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 } },
} as unknown as FlowDocument

/** A card dragged: `sameFlowShape` ignores `layout`, so this is the same flow. */
const MOVED_DOCUMENT = { ...DOCUMENT, layout: { start1: { x: 800, y: 0 } } } as FlowDocument

/** A new connection: a different flow, and the one thing that retires a standing result. */
const CONNECTED_DOCUMENT = {
  ...DOCUMENT,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
} as unknown as FlowDocument

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['start1'],
  nodes: [
    {
      id: 'start1',
      kind: 'start' as const,
      title: 'start',
      input: { nodeId: 'start1', fields: [] },
      output: { nodeId: 'start1', fields: [] },
    },
  ],
} satisfies SafeFlowDescriptorPayload

const REJECTED: ValidatePayload = {
  valid: false,
  error: { _tag: 'ConnectionError', message: 'render.markdown expects string' },
}

interface World {
  readonly validation: ValidationModel
  readonly validate: ReturnType<typeof vi.fn>
  readonly document: ReturnType<typeof atom<FlowDocument | undefined>>
  readonly flowId: ReturnType<typeof atom<string | undefined>>
  readonly locked: ReturnType<typeof atom<boolean>>
  /**
   * Lets the client's answer reach the model. The returned promise is `wrap`ped, and that is the
   * load-bearing part: `await settle()` is an ordinary `await`, and without the wrap the reads after
   * it would run in the default context and see nothing.
   */
  readonly settle: () => Promise<void>
  /**
   * Advances the fake clock, keeping the frame the same way {@link World.settle} does. It resolves
   * with whatever `vi.advanceTimersByTimeAsync` resolves with, because putting a `.then` in front of
   * it to narrow that away would hand the caller an unwrapped promise and lose the frame again.
   */
  readonly elapse: (ms: number) => Promise<unknown>
  readonly disconnect: () => void
}

function createWorld(answer: () => Promise<ValidatePayload | Error>): World {
  const validate = vi.fn(answer)
  const deps: StudioDeps = {
    client: { validate } as unknown as JobikClient,
    now: () => 1000,
  }

  const flowId = atom<string | undefined>('publication', 'test.flowId')
  const document = atom<FlowDocument | undefined>(DOCUMENT, 'test.document')
  const descriptor = atom<SafeFlowDescriptorPayload | undefined>(DESCRIPTOR, 'test.descriptor')
  const locked = atom(false, 'test.locked')

  const validation = reatomValidation(
    deps,
    { flowId, document, descriptor, locked },
    'studio.validation',
  )

  // What `@reatom/react` does for the real Studio: the surfaces read these, which connects
  // everything derived behind them.
  const unsubscribes = [
    validation.state.subscribe(() => {}),
    validation.active.subscribe(() => {}),
    validation.chip.subscribe(() => {}),
    validation.problems.subscribe(() => {}),
    validation.findings.subscribe(() => {}),
    validation.reportFindings.subscribe(() => {}),
    validation.copyState.subscribe(() => {}),
    validation.blocked.subscribe(() => {}),
    validation.topBar.subscribe(() => {}),
    validation.reportOpen.subscribe(() => {}),
  ]

  return {
    validation,
    validate,
    document,
    flowId,
    locked,
    settle: () =>
      wrap(
        (async () => {
          for (let hop = 0; hop < 4; hop += 1) await vi.advanceTimersByTimeAsync(0)
        })(),
      ),
    elapse: (ms: number) => wrap(vi.advanceTimersByTimeAsync(ms)),
    disconnect: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}

async function withValidation(
  answer: () => Promise<ValidatePayload | Error>,
  body: (world: World) => Promise<void>,
): Promise<void> {
  await context.start(async () => {
    const world = createWorld(answer)
    try {
      await wrap(body(world))
    } finally {
      world.disconnect()
    }
  })
}

const passes = async (): Promise<ValidatePayload> => ({ valid: true })
const rejects = async (): Promise<ValidatePayload> => REJECTED

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('validate and save', () => {
  it('validates the current draft against the server', async () => {
    await withValidation(passes, async ({ validation, validate, settle }) => {
      validation.validate()
      await settle()

      expect(validate).toHaveBeenCalledWith('publication', DOCUMENT)
    })
  })

  /**
   * `3D` fixes the result's lifetime: *"errors persist until the flow changes"*. The check itself is
   * a request; how long its answer is allowed to describe the flow is this model's rule.
   */
  it('keeps the result across a drag, which changes only where the card sits', async () => {
    await withValidation(rejects, async ({ validation, document, settle }) => {
      validation.validate()
      await settle()
      expect(validation.active()?.kind).toBe('invalid')

      document.set(MOVED_DOCUMENT)

      expect(validation.active()?.kind).toBe('invalid')
    })
  })

  it('drops the result the moment the flow itself changes', async () => {
    await withValidation(rejects, async ({ validation, document, settle }) => {
      validation.validate()
      await settle()
      expect(validation.active()?.kind).toBe('invalid')

      document.set(CONNECTED_DOCUMENT)

      expect(validation.active()).toBeUndefined()
    })
  })

  it('stamps a passing check with the moment it answered, for the status strip', async () => {
    await withValidation(passes, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      expect(validation.state()).toEqual({ kind: 'valid', checkedAt: 1000 })
    })
  })
})

describe('switching flows', () => {
  /**
   * The hook's version drove this through `selectFlow`; in the model the transition is
   * `FlowSwitchModel.switchTo` calling every sub-model's `reset`, and `reset` is what this asserts.
   * The document is deliberately left alone, so `sameFlowShape` would still say "same flow" — which
   * is the whole point: a finding about flow `#1` says nothing at all about flow `#2`.
   */
  it('drops a standing validation result outright, not through sameFlowShape', async () => {
    await withValidation(rejects, async ({ validation, settle }) => {
      validation.validate()
      await settle()
      expect(validation.active()?.kind).toBe('invalid')

      validation.reset()

      expect(validation.state()).toBeUndefined()
      expect(validation.active()).toBeUndefined()
      expect(validation.problems().problems).toEqual([])
      expect(validation.reportOpen()).toBe(false)
    })
  })
})

/**
 * `3D` §3D.4's own script, minus the fake round trip. The artboard's `later(1200, …)` is how the
 * design pretends to reach a server; here the server settles the check, so the only clock this model
 * owns is the 4 s hold on the resolved chip — and it is a `sleep` inside an abortable action, never a
 * timer handle.
 */
describe('the 3D chip', () => {
  it('runs idle -> checking -> valid and holds the chip for exactly 4 s', async () => {
    await withValidation(passes, async ({ validation, settle, elapse }) => {
      validation.validate()
      expect(validation.chip()).toBe('checking')

      await settle()
      expect(validation.chip()).toBe('valid')

      await elapse(ACTION_TIMINGS.validatedHoldMs - 1)
      expect(validation.chip()).toBe('valid')

      await elapse(1)
      expect(validation.chip()).toBe('idle')
    })
  })

  it('holds the invalid chip for the same 4 s', async () => {
    await withValidation(rejects, async ({ validation, settle, elapse }) => {
      validation.validate()
      await settle()
      expect(validation.chip()).toBe('invalid')

      await elapse(ACTION_TIMINGS.validatedHoldMs)

      expect(validation.chip()).toBe('idle')
    })
  })

  it('ignores a press while the check runs and while a result still stands', async () => {
    await withValidation(rejects, async ({ validation, validate, settle, elapse }) => {
      validation.validate()
      validation.validate()
      await settle()
      expect(validate).toHaveBeenCalledTimes(1)

      validation.validate()
      await settle()
      expect(validate).toHaveBeenCalledTimes(1)
      expect(validation.chip()).toBe('invalid')

      // Only once the hold has expired does the control take a press again.
      await elapse(ACTION_TIMINGS.validatedHoldMs)
      validation.validate()

      expect(validation.chip()).toBe('checking')
      expect(validate).toHaveBeenCalledTimes(2)
    })
  })

  it('drops the result the moment the flow changes', async () => {
    await withValidation(rejects, async ({ validation, settle, elapse }) => {
      validation.validate()
      await settle()
      expect(validation.chip()).toBe('invalid')

      validation.reset()
      expect(validation.chip()).toBe('idle')

      // The hold that was still running must not put the chip back afterwards.
      await elapse(ACTION_TIMINGS.validatedHoldMs)
      expect(validation.chip()).toBe('idle')
    })
  })

  it('refuses a press while a run is in flight', async () => {
    await withValidation(passes, async ({ validation, validate, locked, settle }) => {
      locked.set(true)

      validation.validate()
      await settle()

      expect(validate).not.toHaveBeenCalled()
      expect(validation.chip()).toBe('idle')
    })
  })

  /**
   * `unreachable` is kept apart from `invalid` because the check never *ran*: there is no result to
   * hold, so the chip goes straight back to idle instead of standing for four seconds saying a flow
   * is broken when the server is simply down.
   */
  it('takes the chip straight back to idle when the server cannot be reached', async () => {
    const unreachable = async () => new JobikTransportError({ url: '/api/flows/publication' })
    await withValidation(unreachable, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      expect(validation.state()?.kind).toBe('unreachable')
      expect(validation.chip()).toBe('idle')
      expect(validation.findings()).toBeUndefined()
      expect(validation.blocked()).toBe(false)
    })
  })
})

describe('what the answer is drawn as', () => {
  it('blocks a run while an error stands, and lets it through once the flow is valid again', async () => {
    await withValidation(rejects, async ({ validation, document, settle }) => {
      validation.validate()
      await settle()
      expect(validation.errorCount()).toBe(1)
      expect(validation.blocked()).toBe(true)

      document.set(CONNECTED_DOCUMENT)

      expect(validation.blocked()).toBe(false)
    })
  })

  it('says what the server said, and marks the node the finding names', async () => {
    await withValidation(rejects, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      expect(validation.problems().problems).toEqual([
        {
          severity: 'error',
          code: 'ConnectionError',
          message: 'render.markdown expects string',
        },
      ])
      expect(validation.findings()).toEqual([
        expect.objectContaining({ severity: 'error', code: 'ConnectionError' }),
      ])
    })
  })

  it('gives the top bar a count while the chip says invalid, and idle once it has none', async () => {
    await withValidation(rejects, async ({ validation, document, settle }) => {
      validation.validate()
      await settle()
      expect(validation.topBar()).toEqual({ state: 'invalid', errorCount: 1 })

      // The flow changed under the report: the chip still says `invalid`, but there is no longer a
      // count to print, so the cell falls back to idle rather than printing `0 errors`.
      document.set(CONNECTED_DOCUMENT)

      expect(validation.chip()).toBe('invalid')
      expect(validation.topBar()).toEqual({ state: 'idle' })
    })
  })

  it('opens the report on a rejected document and keeps the findings when it is closed', async () => {
    await withValidation(rejects, async ({ validation, settle }) => {
      validation.validate()
      await settle()
      expect(validation.reportOpen()).toBe(true)

      validation.closeReport()

      expect(validation.reportOpen()).toBe(false)
      expect(validation.findings()).toHaveLength(1)

      validation.openReport()
      expect(validation.reportOpen()).toBe(true)
    })
  })

  it('draws no dialog when the document validates', async () => {
    await withValidation(passes, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      expect(validation.reportOpen()).toBe(false)
      expect(validation.findings()).toBeUndefined()
    })
  })

  it('dismisses the answer without touching the chip', async () => {
    await withValidation(rejects, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      validation.dismiss()

      expect(validation.state()).toBeUndefined()
      expect(validation.validatedFor()).toBeUndefined()
      expect(validation.chip()).toBe('invalid')
    })
  })
})

/**
 * `3C` rule 04 — *"While the footer action runs it shows the loader from 3a and the modal stays
 * open until the work settles."* Both halves were broken: the press did nothing for the four
 * seconds `3D`'s chip holds its result, and past them it closed the dialog it was pressed in.
 */
describe('the dialog’s own Re-validate', () => {
  it('sends a second check inside the four-second chip hold, which validate refuses', async () => {
    await withValidation(rejects, async ({ validation, validate, settle }) => {
      validation.validate()
      await settle()
      expect(validation.chip()).toBe('invalid')

      // The top bar's control is showing a result and must not be asked to show a second one.
      validation.validate()
      await settle()
      expect(validate).toHaveBeenCalledTimes(1)

      validation.revalidate()
      await settle()
      expect(validate).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps the report open, with its rows, for the length of the re-check', async () => {
    let answer!: (payload: ValidatePayload) => void
    const pending = async (): Promise<ValidatePayload> =>
      new Promise<ValidatePayload>((resolve) => {
        answer = resolve
      })

    await withValidation(pending, async ({ validation, settle }) => {
      validation.validate()
      await settle()
      answer(REJECTED)
      await settle()
      expect(validation.reportOpen()).toBe(true)

      validation.revalidate()
      await settle()

      // The check is out and its answer has not landed.
      expect(validation.state()).toEqual({ kind: 'checking' })
      expect(validation.reportOpen()).toBe(true)
      // The strip goes quiet; the dialog does not.
      expect(validation.findings()).toBeUndefined()
      expect(validation.reportFindings()).toHaveLength(1)

      answer(REJECTED)
      await settle()
      expect(validation.reportOpen()).toBe(true)
      expect(validation.reportFindings()).toHaveLength(1)
    })
  })

  it('leaves a dismissed report shut while a check started elsewhere runs', async () => {
    await withValidation(rejects, async ({ validation, settle, elapse }) => {
      validation.validate()
      await settle()
      validation.closeReport()
      expect(validation.reportOpen()).toBe(false)

      // Past the hold, so the top bar's own control admits the press.
      await elapse(ACTION_TIMINGS.validatedHoldMs)
      validation.validate()
      expect(validation.state()).toEqual({ kind: 'checking' })
      expect(validation.reportOpen()).toBe(false)

      // It reopens on the next rejection, exactly as it did before.
      await settle()
      expect(validation.reportOpen()).toBe(true)
    })
  })

  it('returns the chip to idle on the re-check’s own answer, not on the aborted hold', async () => {
    await withValidation(rejects, async ({ validation, settle, elapse }) => {
      validation.validate()
      await settle()

      // Two seconds into the first result's four-second hold.
      await elapse(2000)
      validation.revalidate()
      expect(validation.chip()).toBe('checking')

      // The first hold would have fired here; it was aborted with the re-check.
      await elapse(2000)
      await settle()
      expect(validation.chip()).toBe('invalid')
    })
  })
})

/** `3C` §2's footer ghost, on `3A` §4.1's copy matrix. */
describe('Copy report', () => {
  it('writes the standing findings to the clipboard and holds Copied', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    try {
      await withValidation(rejects, async ({ validation, settle, elapse }) => {
        validation.validate()
        await settle()

        validation.copyReport()
        await settle()

        expect(writeText).toHaveBeenCalledTimes(1)
        // The server's own words, under the tag it sent them with. Nothing is added.
        expect(writeText.mock.calls[0]?.[0]).toBe('ConnectionError\nrender.markdown expects string')
        expect(validation.copyState()).toBe('ok')

        await elapse(ACTION_TIMINGS.copiedHoldMs)
        expect(validation.copyState()).toBe('idle')
      })
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard')
    }
  })

  it('lands on failed when there is no clipboard to write to', async () => {
    await withValidation(rejects, async ({ validation, settle }) => {
      validation.validate()
      await settle()

      validation.copyReport()
      await settle()

      expect(validation.copyState()).toBe('failed')
    })
  })
})
