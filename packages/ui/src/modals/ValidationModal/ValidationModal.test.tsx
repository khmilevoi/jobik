import type { FlowDocument } from '@jobik/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, SafeFlowDescriptorPayload, ValidatePayload } from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import { ValidationModal } from './ValidationModal.js'

/**
 * The dialog reads `ValidationModel` and takes no props, so every case drives one — a real
 * `reatomStudio` in a `StudioModelProvider`, with the check actually run against a stub server that
 * rejects the document. That is the only way this dialog opens: `reportOpen` derives itself from
 * `active()?.kind === 'invalid'`.
 *
 * **The wire carries one finding, so these cases assert one finding.** `POST
 * /api/flows/:id/validate` answers `{ valid: false, error }` with a single `WireErrorPayload` — no
 * severity, no second entry and no source location — and `ValidationModel.findings` passes no
 * `onRevealNode`, so no action links either. Artboard `3C` draws three findings across two
 * severities with `flow.ts:41` refs and `Reveal node` links, and the cases that used to assert
 * those shapes through props were deleted with the props: the component still draws them, nothing
 * can reach them, and inventing a model member to fill them is the fabrication
 * `toValidationFindings` refuses. What is kept here is everything the endpoint can actually
 * produce, plus the absences — no source cell, no action row — which are themselves assertions
 * about the wire.
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 }, render: { x: 300, y: 0 } },
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
} as unknown as SafeFlowDescriptorPayload

/** The one finding the endpoint can send, with the node it names — which `toProse` sets in mono. */
const REJECTED: ValidatePayload = {
  valid: false,
  error: {
    _tag: 'TypeMismatch',
    message: 'render.markdown expects string, receives Buffer',
    nodeId: 'render.markdown',
  },
} as unknown as ValidatePayload

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: vi.fn(async () => [{ id: 'publication', name: 'publication', nodeCount: 2 }]),
    loadFlow: vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    })),
    validate: vi.fn(async () => REJECTED),
    save: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
    ...overrides,
  } as unknown as JobikClient
}

const connected: (() => void)[] = []

afterEach(() => {
  for (const off of connected.splice(0)) off()
  cleanup()
})

interface World {
  readonly model: StudioModel
}

/**
 * Mounts the dialog over a loaded flow, with no check run yet.
 *
 * It subscribes to `flows.descriptor` itself because a shut dialog reads `reportOpen` and nothing
 * else — that is what moving the guard into the component bought — so without this subscription no
 * flow would ever load, and `validate` has no document to send.
 *
 * The teardown calls `validation.reset()`: `3D`'s resolved chip stands for `validatedHoldMs`
 * through `wrap(sleep(…))`, and `reset` is what aborts that hold rather than leaving a four-second
 * timer behind every case.
 */
async function mount(client: JobikClient = stubClient()): Promise<World> {
  const deps: StudioDeps = { client, now: () => 1_700_000_000_000 }
  const model = reatomStudio(deps)
  connected.push(model.flows.descriptor.subscribe(() => {}))
  connected.push(() => model.validation.reset())

  render(
    <StudioModelProvider model={model}>
      <ValidationModal />
    </StudioModelProvider>,
  )
  await waitFor(() => {
    expect(model.flows.descriptor()).toBeDefined()
  })
  return { model }
}

/** The check having run and been rejected — the only state this dialog is drawn in. */
async function mountRejected(client: JobikClient = stubClient()): Promise<World> {
  const world = await mount(client)
  await act(async () => {
    world.model.validation.validate()
  })
  await screen.findByTestId('validation-modal')
  return world
}

describe('ValidationModal', () => {
  it('draws the artboard header, over the one finding the wire carries', async () => {
    await mountRejected()

    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
    expect(screen.getByTestId('modal-context')).toHaveTextContent('publication · flow.ts')
    expect(screen.getByTestId('validation-error-count')).toHaveTextContent('1 error')
    // A count of zero draws no badge, and the wire has no way to say `warning` at all.
    expect(screen.queryByTestId('validation-warning-count')).toBeNull()
  })

  /**
   * The two absences are the point. `3C` puts a `flow.ts:41` at the right of every tag row and two
   * action links under the first two findings; `WireErrorPayload` carries no source location, and
   * `ValidationModel.findings` passes no `onRevealNode`, so neither is ever drawn today.
   */
  it('draws the finding’s class, with no source ref and no action links the wire can fill', async () => {
    await mountRejected()

    expect(screen.getAllByTestId('validation-finding')).toHaveLength(1)
    expect(screen.getAllByTestId('validation-code').map((node) => node.textContent)).toEqual([
      'TypeMismatch',
    ])
    expect(screen.queryByTestId('validation-source')).toBeNull()
    expect(screen.queryByTestId('validation-action')).toBeNull()
  })

  it('renders a message with its identifiers inlined', async () => {
    await mountRejected()

    expect(screen.getByTestId('validation-message')).toHaveTextContent(
      'render.markdown expects string, receives Buffer',
    )
  })

  it('draws the footer verbatim', async () => {
    await mountRejected()

    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc to close')
    expect(screen.getByRole('button', { name: /Copy report/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-validate' })).toBeInTheDocument()
  })

  /**
   * `Re-validate` is `ValidationModel.revalidate`, and the press happens **without** the chip being
   * put back to idle first. That is rule 04: the press lands the moment the report opens, which is
   * inside `3D`'s four-second hold, and `validate` — the top bar's action — refuses exactly then.
   */
  it('asks the server again from Re-validate, inside the chip’s own hold', async () => {
    const validate = vi.fn<JobikClient['validate']>(async () => REJECTED)
    const { model } = await mountRejected(stubClient({ validate }))
    expect(validate).toHaveBeenCalledTimes(1)
    expect(model.validation.chip()).toBe('invalid')

    fireEvent.click(screen.getByRole('button', { name: 'Re-validate' }))

    expect(validate).toHaveBeenCalledTimes(2)
  })

  /** Rule 04's other half: *"the modal stays open until the work settles"*. */
  it('stays open, with its rows, for the length of the re-check', async () => {
    let answer: ((payload: ValidatePayload) => void) | undefined
    const validate = vi.fn<JobikClient['validate']>(async () => {
      if (answer === undefined) return REJECTED
      return new Promise<ValidatePayload>((resolve) => {
        answer = resolve
      })
    })
    const { model } = await mountRejected(stubClient({ validate }))
    // Arms the second answer: from here the stub holds its promise open.
    answer = () => {}

    fireEvent.click(screen.getByRole('button', { name: 'Re-validate' }))
    await waitFor(() => {
      expect(model.validation.active()?.kind).toBe('checking')
    })

    expect(screen.getByTestId('validation-modal')).toBeInTheDocument()
    expect(screen.getAllByTestId('validation-finding')).toHaveLength(1)
    // The footer's primary carries `3A`'s loader while the answer is out, and a second press is
    // refused for as long as it does — the visible half is the gates' business, this is the
    // behaviour behind it.
    fireEvent.click(screen.getByTestId('validation-revalidate'))
    expect(validate).toHaveBeenCalledTimes(2)
  })

  /** `Copy report` writes the rows the dialog draws — `3C` §2's ghost, on `3A` §4.1's matrix. */
  it('copies the standing findings from Copy report', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    try {
      await mountRejected()

      fireEvent.click(screen.getByTestId('validation-copy-report'))
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1)
      })

      expect(writeText.mock.calls[0]?.[0]).toBe(
        'TypeMismatch\nrender.markdown expects string, receives Buffer',
      )
      expect(await screen.findByText('Copied')).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard')
    }
  })

  it('is non-destructive: esc and the backdrop both dismiss it', async () => {
    const { model } = await mountRejected()

    fireEvent.keyDown(screen.getByTestId('validation-modal'), { key: 'Escape' })
    expect(model.validation.reportOpen()).toBe(false)
    await waitFor(() => {
      expect(screen.queryByTestId('validation-modal')).toBeNull()
    })

    // Re-opened rather than re-mounted: `3D` makes the findings outlive the dialog, so `openReport`
    // is enough to put the same report back on screen.
    await act(async () => {
      model.validation.openReport()
    })
    fireEvent.click(await screen.findByTestId('validation-modal'))

    expect(model.validation.reportOpen()).toBe(false)
  })

  /**
   * The guard the caller used to hold: `StudioApp` wrote
   * `validation.reportOpen() && findings !== undefined ? … : null`. It is here now, so a shut
   * dialog subscribes to `reportOpen` and reads neither the findings nor the descriptor.
   */
  it('draws nothing until a check has rejected the document', async () => {
    const { model } = await mount()
    expect(screen.queryByTestId('validation-modal')).toBeNull()

    // A passing check does not open it either: the wire answers `{ valid: true }` with no findings,
    // and no artboard draws an all-clear dialog.
    expect(model.validation.reportOpen()).toBe(false)

    cleanup()
    const passing = await mount(
      stubClient({ validate: vi.fn<JobikClient['validate']>(async () => ({ valid: true })) }),
    )
    await act(async () => {
      passing.model.validation.validate()
    })
    await waitFor(() => {
      expect(passing.model.validation.active()?.kind).toBe('valid')
    })
    expect(screen.queryByTestId('validation-modal')).toBeNull()
    expect(passing.model.validation.reportOpen()).toBe(false)
  })
})
