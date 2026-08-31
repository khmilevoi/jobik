import { describe, expect, expectTypeOf, it } from 'vitest'
import type { SafeFlowDescriptor, SafeFlowSummary, SafeNodeDescriptor } from '#server/descriptor.js'
import type { LoadedFlow, SavedFlow } from '#server/flowService.js'
import type { AuthoredWireError, RunWireEvent, WireRunReport } from '#server/runWire.js'
import type { UntaggedWireError, WireError } from '#server/wireError.js'
import type {
  FlowListItem,
  LoadedFlowPayload,
  RevisionConflictPayload,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  SafeNodeDescriptorPayload,
  SavePayload,
  WireErrorPayload,
  WireRunReportPayload,
} from './wire.js'
import { isRevisionConflictPayload, wireErrorFrames } from './wire.js'

describe('the browser mirror of the server wire types', () => {
  it('accepts every shape the server can send for an error', () => {
    expectTypeOf<WireError>().toExtend<WireErrorPayload>()
    expectTypeOf<UntaggedWireError>().toExtend<WireErrorPayload>()
    expectTypeOf<AuthoredWireError>().toExtend<WireErrorPayload>()
  })

  it('accepts every event and report the server can stream', () => {
    expectTypeOf<RunWireEvent>().toExtend<RunStreamEvent>()
    expectTypeOf<WireRunReport>().toExtend<WireRunReportPayload>()
  })

  it('mirrors the flow list and descriptor types from the server', () => {
    expectTypeOf<SafeFlowSummary>().toExtend<FlowListItem>()
    expectTypeOf<SafeNodeDescriptor>().toExtend<SafeNodeDescriptorPayload>()
    expectTypeOf<SafeFlowDescriptor>().toExtend<SafeFlowDescriptorPayload>()
  })

  it('mirrors the loaded flow and save types from the server', () => {
    expectTypeOf<LoadedFlow>().toExtend<LoadedFlowPayload>()
    expectTypeOf<SavedFlow>().toExtend<SavePayload>()
  })

  it('mirrors the FlowRevisionConflictError from the wire error taxonomy', () => {
    type FlowRevisionConflictWireError = Extract<WireError, { _tag: 'FlowRevisionConflictError' }>
    expectTypeOf<FlowRevisionConflictWireError>().toExtend<RevisionConflictPayload>()
  })
})

describe('isRevisionConflictPayload', () => {
  it('narrows only the conflict tag carrying both revisions', () => {
    const conflict = {
      _tag: 'FlowRevisionConflictError',
      message: 'changed on disk',
      expectedRevision: 'a',
      actualRevision: 'b',
    }
    expect(isRevisionConflictPayload(conflict)).toBe(true)
    expect(isRevisionConflictPayload({ _tag: 'FlowSaveError', message: 'no' })).toBe(false)
    expect(isRevisionConflictPayload({ _tag: null, message: 'no' })).toBe(false)
  })
})

describe('wireErrorFrames', () => {
  it('returns the trimmed frames a NodeExecutionError carries', () => {
    expect(
      wireErrorFrames({
        _tag: 'NodeExecutionError',
        message: 'Node render failed',
        frames: [{ fn: 'imageOut', file: 'nodes/imageOut.ts', line: 21 }],
        hiddenFrames: 3,
      }),
    ).toEqual({
      frames: [{ fn: 'imageOut', file: 'nodes/imageOut.ts', line: 21 }],
      hiddenFrames: 3,
    })
  })

  it('returns undefined when no frames arrived', () => {
    expect(wireErrorFrames({ _tag: 'FlowSaveError', message: 'x' })).toBeUndefined()
    expect(wireErrorFrames({ _tag: null, message: 'x' })).toBeUndefined()
  })
})
