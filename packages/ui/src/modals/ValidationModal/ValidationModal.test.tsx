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
 * severity and no second entry — and `ValidationModel.findings` passes no `onRevealNode`, so no
 * action links either. Artboard `3C` draws three findings across two severities with `Reveal node`
 * links, and the cases that used to assert those shapes through props were deleted with the props:
 * the component still draws them, nothing can reach them, and inventing a model member to fill them
 * is the fabrication `toValidationFindings` refuses.
 *
 * The source cell is the exception and is exercised in both directions: the payload does say where
 * in the graph the check failed, so a rejection that names a port or a node draws a location and
 * one that names neither draws none. The artboard's `flow.ts:41` stays unfillable either way.
 *
 * What is kept here is everything the endpoint can actually produce, plus the absences — no warning
 * ramp, no action row — which are themselves assertions about the wire.
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
   * R2 — `3C` puts a location at the right of every tag row, and the dialog printed none.
   *
   * The artboard's own `flow.ts:41` stays unfillable: no wire payload carries a file or a line. But
   * the payload does say *where in the graph* the check failed, and `model/validation.ts` now reads
   * it, so the finding names the node the server named.
   */
  it('draws the finding’s class over the location the payload names', async () => {
    await mountRejected()

    expect(screen.getAllByTestId('validation-finding')).toHaveLength(1)
    expect(screen.getAllByTestId('validation-code').map((node) => node.textContent)).toEqual([
      'TypeMismatch',
    ])
    expect(screen.getByTestId('validation-source')).toHaveTextContent('render.markdown')
  })

  /** `ConnectionError`'s `to` — the receiving port, which is the end the check is reported against. */
  it('prefers the field ref the payload carries over its bare node id', async () => {
    await mountRejected(
      stubClient({
        validate: vi.fn(async () => ({
          valid: false,
          error: {
            _tag: 'ConnectionError',
            message: 'The flow graph is invalid: markdown has no source',
            to: { node: 'render', field: 'markdown' },
          },
        })),
      } as unknown as Partial<JobikClient>),
    )

    expect(screen.getByTestId('validation-source')).toHaveTextContent('render.markdown')
  })

  /** A payload that names neither prints no location, rather than a guessed one. */
  it('draws no location for a payload that names nowhere', async () => {
    await mountRejected(
      stubClient({
        validate: vi.fn(async () => ({
          valid: false,
          error: { _tag: 'FlowSchemaError', message: 'The document does not parse' },
        })),
      } as unknown as Partial<JobikClient>),
    )

    expect(screen.getByTestId('validation-code')).toHaveTextContent('FlowSchemaError')
    expect(screen.queryByTestId('validation-source')).toBeNull()
  })

  /**
   * The remaining absence, and it is deliberate. `3C` draws `Reveal node` and `Open in editor`
   * under a finding; the canvas cannot scroll to a node and the Studio has no editor, so a control
   * that cannot do what its label says is not offered. See `findingSource`'s own note.
   */
  it('offers no per-finding action links, because neither would do what it says', async () => {
    await mountRejected()

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

  /**
   * `Copy report` writes the rows the dialog draws — `3C` §2's ghost, on `3A` §4.1's matrix.
   *
   * Every half of a row is read off the screen and asserted to be in the text, so the two cannot
   * drift: a finding whose payload names a port draws a location cell, and the clipboard carries
   * that same location. The design puts the class and the location on one row, so the text puts
   * them on one line.
   */
  it('copies the standing findings from Copy report, location included', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    try {
      await mountRejected()

      const code = screen.getByTestId('validation-code').textContent
      const source = screen.getByTestId('validation-source').textContent
      const message = screen.getByTestId('validation-message').textContent

      fireEvent.click(screen.getByTestId('validation-copy-report'))
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1)
      })

      const copied = writeText.mock.calls[0]?.[0]
      expect(copied).toBe(`${code} · ${source}\n${message}`)
      expect(copied).toBe(
        'TypeMismatch · render.markdown\nrender.markdown expects string, receives Buffer',
      )
      expect(await screen.findByText('Copied')).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard')
    }
  })

  /** A row with no location cell copies no separator either — the text says what the row says. */
  it('copies a finding that names nowhere as its class and sentence alone', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    try {
      await mountRejected(
        stubClient({
          validate: vi.fn(async () => ({
            valid: false,
            error: { _tag: 'FlowSchemaError', message: 'The document does not parse' },
          })),
        } as unknown as Partial<JobikClient>),
      )
      expect(screen.queryByTestId('validation-source')).toBeNull()

      fireEvent.click(screen.getByTestId('validation-copy-report'))
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1)
      })

      expect(writeText.mock.calls[0]?.[0]).toBe('FlowSchemaError\nThe document does not parse')
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
