import { describe, expect, it } from 'vitest'
import { accent, statusColors, surfaces, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { resolveCardChrome, resolveCardWidth } from './cardChrome.js'

describe('resolveCardChrome', () => {
  it('gives an idle card the plain node treatment', () => {
    const chrome = resolveCardChrome({ state: 'idle' })
    expect(chrome.background).toBe(surfaces.nodeCard)
    expect(chrome.border).toBe('1px solid #232629')
    expect(chrome.boxShadow).toBeUndefined()
    expect(chrome.headerDivider).toBe('#1c1f22')
    expect(chrome.headerWash).toBeUndefined()
    expect(chrome.title).toBe(textColors.nodeTitle)
    expect(chrome.status).toBe(textColors.activeMeta)
    expect(chrome.kindDot).toBe('#3d4348')
    expect(chrome.sectionLabel).toBe(textColors.sectionLabel)
  })

  it('gives a queued card the dashed border, dimmed title and faintest section label', () => {
    const chrome = resolveCardChrome({ state: 'queued' })
    expect(chrome.background).toBe(surfaces.queuedNode)
    expect(chrome.border).toBe('1px dashed #23262a')
    expect(chrome.headerDivider).toBe('#16181b')
    expect(chrome.title).toBe(textColors.inactiveListItem)
    expect(chrome.status).toBe(textColors.sectionLabel)
    expect(chrome.kindDot).toBe('#2e3337')
    expect(chrome.sectionLabel).toBe(textColors.faintest)
  })

  it('gives a running card the selection border, halo and header wash by default', () => {
    const chrome = resolveCardChrome({ state: 'running' })
    expect(chrome.border).toBe(`1px solid ${accent.selectionBorder}`)
    expect(chrome.boxShadow).toBe(accent.selectionHalo)
    expect(chrome.headerWash).toBe(accent.headerWash)
    expect(chrome.title).toBe(canvasColors.titleSelected)
    expect(chrome.status).toBe(accent.cssVar)
  })

  it('gives an ok card the green status and a status-coloured dot', () => {
    const chrome = resolveCardChrome({ state: 'ok' })
    expect(chrome.background).toBe(surfaces.nodeCard)
    expect(chrome.border).toBe('1px solid #232629')
    expect(chrome.status).toBe(statusColors.ok)
    expect(chrome.kindDot).toBe(statusColors.ok)
  })

  it('lets an ok card ask for the neutral kind dot instead, as the default artboard does', () => {
    expect(resolveCardChrome({ state: 'ok', kindDot: 'neutral' }).kindDot).toBe('#3d4348')
  })

  it('gives a failed card its own card, border, halo, divider and wash', () => {
    const chrome = resolveCardChrome({ state: 'failed' })
    expect(chrome.background).toBe(surfaces.failedNodeCard)
    expect(chrome.border).toBe(`1px solid ${canvasColors.failedBorder}`)
    expect(chrome.boxShadow).toBe(canvasColors.failedHalo)
    expect(chrome.headerDivider).toBe(canvasColors.failedHeaderDivider)
    expect(chrome.headerWash).toBe(canvasColors.failedHeaderWash)
    expect(chrome.title).toBe(canvasColors.titleFailed)
    expect(chrome.status).toBe(statusColors.failed)
    expect(chrome.kindDot).toBe(statusColors.failed)
  })

  it('keeps the failed treatment when the failed card is also selected', () => {
    const chrome = resolveCardChrome({ state: 'failed', selected: true })
    expect(chrome.border).toBe(`1px solid ${canvasColors.failedBorder}`)
    expect(chrome.boxShadow).toBe(canvasColors.failedHalo)
    expect(chrome.headerWash).toBe(canvasColors.failedHeaderWash)
    expect(chrome.title).toBe(canvasColors.titleFailed)
  })

  it('gives a cached card the muted card, inset border and cached dot', () => {
    const chrome = resolveCardChrome({ state: 'cached' })
    expect(chrome.background).toBe(surfaces.cachedNode)
    expect(chrome.border).toBe('1px solid #1e2124')
    expect(chrome.headerDivider).toBe(canvasColors.cachedHeaderDivider)
    expect(chrome.title).toBe(canvasColors.titleCached)
    expect(chrome.status).toBe(textColors.muted)
    expect(chrome.kindDot).toBe('#4a5157')
  })

  it('selects with a border, a halo and a wash — never a glow', () => {
    const chrome = resolveCardChrome({ state: 'idle', selected: true, isStart: true })
    expect(chrome.border).toBe(`1px solid ${accent.selectionBorder}`)
    expect(chrome.boxShadow).toBe('0 0 0 3px rgba(31,214,189,.06)')
    expect(chrome.headerWash).toBe(accent.headerWash)
    expect(chrome.title).toBe(canvasColors.titleSelected)
    expect(chrome.kindDot).toBe(accent.cssVar)
    expect(chrome.sectionLabel).toBe(canvasColors.sectionLabelSelectedStart)
  })

  it('keeps the ordinary section label on an unselected start', () => {
    expect(resolveCardChrome({ state: 'ok', isStart: true }).sectionLabel).toBe(
      textColors.sectionLabel,
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
