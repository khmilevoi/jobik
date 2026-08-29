import { FlowSchemaError } from '@jobik/core'
import { describe, expect, it } from 'vitest'

describe('workspace resolution', () => {
  it('resolves @jobik/core through source', () => {
    expect(new FlowSchemaError({ path: '/a.json' })._tag).toBe('FlowSchemaError')
  })
})
