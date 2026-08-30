import * as errore from 'errore'
import type { WireErrorPayload } from './wire.js'

/**
 * The two failures that belong to the *client*, not to the flow.
 *
 * `packages/core/src/errors.ts` is the flow taxonomy and is frozen; neither of these is a member of
 * it. A tagged Jobik error the server produced arrives inside `JobikServerError.payload`, untouched.
 */

export class JobikTransportError extends errore.createTaggedError({
  name: 'JobikTransportError',
  message: 'The Jobik server could not be reached at $url',
}) {}

export class JobikServerError extends errore.createTaggedError({
  name: 'JobikServerError',
  message: 'The Jobik server rejected the request: $reason',
}) {
  readonly status: number
  /** Exactly what the server sent. Never re-tagged, never re-humanised. */
  readonly payload: WireErrorPayload

  constructor(args: {
    reason: string
    status: number
    payload: WireErrorPayload
    cause?: unknown
  }) {
    super(args)
    this.status = args.status
    this.payload = args.payload
  }
}
