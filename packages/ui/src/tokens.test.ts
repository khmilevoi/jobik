import { describe, expect, it } from 'vitest'
import {
  accent,
  accentAlternates,
  borders,
  fontFamilies,
  kindDotColors,
  layout,
  motion,
  radii,
  statusColors,
  surfaces,
  textColors,
  tracking,
  typeScale,
} from './tokens.js'

describe('tokens', () => {
  it('carries the twelve surfaces darkest first', () => {
    expect(surfaces).toEqual({
      page: '#050506',
      shell: '#070809',
      panel: '#0a0b0d',
      topBar: '#0b0c0e',
      queuedNode: '#0c0d0f',
      cachedNode: '#0d0e10',
      nodeCard: '#0f1114',
      inputWell: '#0c0e10',
      outputWell: '#0a0b0c',
      imagePlaceholder: '#0d0f11',
      saveFill: '#16181a',
      failedNodeCard: '#100e0e',
      failedErrorWell: '#0d0b0b',
      activeListRow: '#131518',
      activeNodeRow: '#111316',
      dockedControl: '#0e1012',
    })
  })

  it('carries the border ramp from structural to incidental', () => {
    expect(borders).toEqual({
      frame: '#1a1d20',
      shellDivider: '#17191c',
      panelHeaderDivider: '#141618',
      inlineHairline: '#16181b',
      control: '#232629',
      quietControl: '#212528',
      nodeHeaderDivider: '#1c1f22',
      inset: '#1e2124',
      saveButton: '#2c3033',
      secondaryButton: '#2a2e32',
      dashed: '#23262a',
      activeListRow: '#202427',
      iconButton: '#212427',
    })
  })

  it('carries the eleven-step text ramp, the artboard-only steps and the five shared ones', () => {
    expect(textColors).toEqual({
      primary: '#e8eaec',
      nodeTitle: '#e2e6e9',
      activeIdentifier: '#dfe3e6',
      activeFieldLabel: '#c3c9ce',
      fieldLabel: '#aab1b7',
      controlLabel: '#aeb5bb',
      inactiveListItem: '#8d949a',
      muted: '#79828a',
      typeAnnotation: '#5d656c',
      sectionLabel: '#4e555b',
      faintest: '#41474c',
      panelHeaderLabel: '#5b6167',
      chevron: '#7c848b',
      badge: '#5c646b',
      activeMeta: '#5f676e',
      // Promoted out of `canvasTokens.ts` and `runPanelTokens.ts`: each is read from a second
      // directory, and a custom property only exists while its own stylesheet is on the page.
      metadata: '#636c73',
      metadataSeparator: '#2f3438',
      slotCaption: '#5b646b',
      actionLabel: '#cfd5da',
      failedMeta: '#6d5f5c',
    })
  })

  it('carries the accent, its on-fill colour and its three alternates', () => {
    expect(accent.base).toBe('#1fd6bd')
    expect(accent.onFill).toBe('#04211d')
    expect(accent.onFillMuted).toBe('rgba(4,33,29,.6)')
    expect(accent.cssVar).toBe('var(--accent, #1fd6bd)')
    expect(accent.selectionBorder).toBe('rgba(31,214,189,.42)')
    expect(accent.selectionHalo).toBe('0 0 0 3px rgba(31,214,189,.06)')
    expect(accent.headerWash).toBe('rgba(31,214,189,.05)')
    expect(accent.chipBorder).toBe('rgba(31,214,189,.3)')
    expect(accent.chipFill).toBe('rgba(31,214,189,.06)')
    // Promoted out of `canvasTokens.ts` and `runPanelTokens.ts` — canvas, run and studio all draw
    // the same unlit spinner ring, so it is a shared value rather than three copies of one.
    expect(accent.spinnerTrack).toBe('rgba(31,214,189,.25)')
    expect(accentAlternates).toEqual(['#28c8d8', '#3ecf8e', '#c8a24a'])
  })

  it('carries the status colours and the kind dots', () => {
    expect(statusColors).toEqual({
      ok: '#6f9c82',
      failed: '#c96a5c',
      errorTag: '#dc8577',
      errorBody: '#a79b98',
      unsaved: '#8a7d4a',
      // Folded up from `primitives`/`shell` and `shell`/`modals` respectively: a value two
      // directories read is a shared value.
      okLabel: '#8bb69c',
      warningTag: '#b3a069',
    })
    expect(kindDotColors).toEqual({
      start: 'var(--accent, #1fd6bd)',
      neutral: '#3d4348',
      queued: '#2e3337',
      cached: '#4a5157',
    })
  })

  it('carries the typography, the nine-step scale and the tracking', () => {
    expect(fontFamilies).toEqual({
      ui: 'Archivo, Helvetica, sans-serif',
      mono: "'JetBrains Mono', monospace",
    })
    expect(typeScale).toEqual([14, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5])
    expect(tracking).toEqual({
      title: '-0.01em',
      wide: '.01em',
      sectionLabel: '.1em',
      startTag: '.08em',
    })
  })

  it('carries the radii and every animation the design declares', () => {
    expect(radii).toEqual({
      panel: 8,
      nodeCard: 7,
      control: 5,
      small: 4,
      badge: 3,
      kindDot: 2,
      round: '50%',
    })
    expect(motion).toEqual({
      spinner: 'jspin .7s linear infinite',
      edgeDash: 'jdash .8s linear infinite',
      shimmer: 'jshim 1.5s linear infinite',
      pulseSlow: 'jpulse 1.5s ease-in-out infinite',
      pulseFast: 'jpulse 1s ease-in-out infinite',
      // Artboard `3D` took the design from four keyframes to six. `resultPop` is the only
      // `ease-out` in the file and the only animation that is not a loop.
      validateSweep: 'jsweep 1.1s ease-in-out infinite',
      resultPop: 'jpop .22s ease-out',
      // `4A` added the last two keyframes: a cross-fade for a control swapping its contents, and
      // the 3px lift of a log line or run-history row arriving.
      swapFade: 'jfade 90ms linear',
      lineIn: 'jline 140ms cubic-bezier(.2,.8,.25,1)',

      // The `4A` transition scale. Six durations — `0` is a real member of it and means no
      // transition at all — and three curves, which is the whole vocabulary. A duration or an
      // easing outside this list is not design.
      durationPointer: '0ms',
      durationSwap: '90ms',
      durationState: '140ms',
      durationLayout: '180ms',
      durationOverlayIn: '200ms',
      durationExit: '120ms',
      durationScreen: '240ms',
      easeSettle: 'cubic-bezier(.2,.8,.25,1)',
      easeExit: 'cubic-bezier(.4,0,1,1)',
      easeLinear: 'linear',
    })
  })

  it('carries the layout metrics', () => {
    expect(layout).toEqual({
      topBarHeight: 52,
      panelHeaderHeight: 38,
      leftSidebarWidth: 248,
      rightDockWidth: 320,
      studioMinWidth: 1200,
      nodeHeaderHeight: 36,
      sectionLabelRowHeight: 22,
      fieldRowHeight: 30,
      cardFooterHeight: 8,
      listRowHeight: 30,
      inventoryRowHeight: 28,
      iconButtonSize: 22,
      chipHeight: 28,
    })
  })
})
