import type { FlowDocument } from '@jobik/core'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, SafeFlowDescriptorPayload, ValidatePayload } from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { ProblemRow } from './ProblemsStrip.js'
import { ProblemsStrip, problemCountLabel } from './ProblemsStrip.js'

/**
 * `3D` §3D.3, the invalid board's strip, reading `ValidationModel`.
 *
 * **The wire carries one finding, so the rendered cases assert one row.** `studio/problems.ts`'s
 * `toFlowProblems` builds exactly one `error` row out of the single `WireErrorPayload` the validate
 * endpoint returns — no second finding, no `warning`, and no `source`. `3D`'s own board draws
 * `2 errors, 1 warning` over three rows with a `flow.ts:41` location, and the cases that asserted
 * those through props were deleted with the props. The arithmetic that produced them is still
 * pinned directly, as a function: {@link problemCountLabel} is exported and takes rows, so its
 * plural forms stay covered without pretending the endpoint can send them.
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

const REJECTED: ValidatePayload = {
  valid: false,
  error: { _tag: 'TypeMismatch', message: 'render.markdown receives Buffer' },
} as unknown as ValidatePayload

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: vi.fn(async () => [{ id: 'publication', name: 'publication', nodeCount: 2 }]),
    loadFlow: vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    })),
    validate: vi.fn<JobikClient['validate']>(async () => REJECTED),
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

/**
 * The strip over a flow whose check has been rejected. `validation.reset()` runs at teardown
 * because `3D`'s resolved chip stands for `validatedHoldMs` through `wrap(sleep(…))`, and `reset`
 * is what aborts that hold rather than leaving a four-second timer behind every case.
 */
async function mountInvalid(client: JobikClient = stubClient()): Promise<{ model: StudioModel }> {
  const deps: StudioDeps = { client, now: () => 1_700_000_000_000 }
  const model = reatomStudio(deps)
  connected.push(model.flows.descriptor.subscribe(() => {}))
  connected.push(() => model.validation.reset())

  render(
    <StudioModelProvider model={model}>
      <ProblemsStrip />
    </StudioModelProvider>,
  )
  await waitFor(() => {
    expect(model.flows.descriptor()).toBeDefined()
  })
  await act(async () => {
    model.validation.validate()
  })
  await waitFor(() => {
    expect(model.validation.problems().problems).toHaveLength(1)
  })
  return { model }
}

describe('ProblemsStrip', () => {
  it('says 1 error when that is all there is, and never mentions warnings it does not have', async () => {
    await mountInvalid()

    expect(screen.getByTestId('studio-problems-count')).toHaveTextContent('1 error')
    expect(screen.getByTestId('studio-problems-count').textContent).not.toContain('warning')
    expect(screen.getAllByTestId('studio-problem-row')).toHaveLength(1)
  })

  /**
   * The header count is derived from the rows rather than passed in, so a strip can never claim
   * more findings than the model holds. Pinned here as a function because the endpoint cannot yet
   * produce a second row, let alone a warning — see this file's own header.
   */
  it('derives every plural form from the list alone', () => {
    const error: ProblemRow = { severity: 'error', code: 'TypeMismatch', message: 'a' }
    const warning: ProblemRow = { severity: 'warning', code: 'UnusedOutput', message: 'b' }

    expect(problemCountLabel([])).toBe('')
    expect(problemCountLabel([error])).toBe('1 error')
    expect(problemCountLabel([error, { ...error, code: 'Other' }, warning])).toBe(
      '2 errors, 1 warning',
    )
    expect(problemCountLabel([warning])).toBe('1 warning')
    expect(problemCountLabel([warning, { ...warning, code: 'Other' }])).toBe('2 warnings')
  })

  /**
   * The row is the server's own tag and its own words. No location cell is drawn at all:
   * `WireErrorPayload` carries no source, and `toFlowProblems` leaves `source` off rather than
   * guessing one.
   */
  it('draws the row code and its message, and no location the wire cannot supply', async () => {
    await mountInvalid()

    expect(screen.getByText('TypeMismatch')).toBeInTheDocument()
    expect(screen.getByText('render.markdown receives Buffer')).toBeInTheDocument()
    expect(screen.getByTestId('studio-problem-row').textContent).not.toContain('flow.ts')
  })

  it('opens the report from the header action', async () => {
    const { model } = await mountInvalid()
    // The check opens the dialog by itself, so this asserts the button re-opens a closed one.
    await act(async () => {
      model.validation.closeReport()
    })
    expect(model.validation.reportOpen()).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Open report' }))

    expect(model.validation.reportOpen()).toBe(true)
  })
})
