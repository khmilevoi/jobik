import { afterEach, expect, it, vi } from 'vitest'
import { browserInputDraftStorage } from './inputDraftStorage.js'

afterEach(() => vi.restoreAllMocks())

it('uses the browser storage with the supplied API namespace', () => {
  expect(browserInputDraftStorage('/studio-api')).toEqual({
    storage: localStorage,
    namespace: '/studio-api',
  })
})

it('leaves the Studio usable when the localStorage getter throws', () => {
  vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('disabled')
  })
  expect(browserInputDraftStorage('')).toBeUndefined()
})
