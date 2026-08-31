/**
 * Jobik Studio design tokens, transcribed from `Jobik Studio.dc.html`.
 *
 * The design file is the source of truth. Where the spec's prose lists a shorter ramp than the
 * artboards use, the extra values are kept and marked `artboard-only`. Never add a value that is
 * not in an artboard.
 */

/** Surfaces, darkest first. The last three are artboard-only. */
export const surfaces = {
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
  /** artboard-only — the selected flow row in the left sidebar */
  activeListRow: '#131518',
  /** artboard-only — the selected node row in the left sidebar */
  activeNodeRow: '#111316',
  /** artboard-only — a panel control docked into the collapsed top bar */
  dockedControl: '#0e1012',
} as const

/** Borders, from structural to incidental. The last two are artboard-only. */
export const borders = {
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
  /** artboard-only — the selected flow row */
  activeListRow: '#202427',
  /** artboard-only — the 22px chevron collapse button */
  iconButton: '#212427',
} as const

/**
 * The eleven-step text ramp, plus four artboard-only steps and five shared by two directories.
 *
 * The last five arrived here from `canvasTokens.ts` and `runPanelTokens.ts` when the CSS Modules
 * migration made the cost of leaving them there visible. A custom property exists only while the
 * stylesheet declaring it is on the page, so `shell/RunDock` reading `--jbk-text-failed-meta` was a
 * silent dependency on some `run/` component also being mounted — and `--jbk-text-failed-meta` is
 * one of only two colours that are the *sole* mark of a state. A value two directories read is a
 * shared value, and `tokens.css` is the stylesheet every component already has.
 */
export const textColors = {
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
  /** artboard-only — the panel header's own uppercase label */
  panelHeaderLabel: '#5b6167',
  /** artboard-only — chevron strokes and the `Unsaved changes` label */
  chevron: '#7c848b',
  /** artboard-only — the mono file badge */
  badge: '#5c646b',
  /** artboard-only — the count and kind label on an active list row */
  activeMeta: '#5f676e',
  /** shared — `canvas` and `output`: the mono metadata row under an image, and its `·` separators */
  metadata: '#636c73',
  metadataSeparator: '#2f3438',
  /** shared — `canvas` and `output`: the caption under an inline output placeholder */
  slotCaption: '#5b646b',
  /** shared — `run` and `studio`: `n of m nodes complete`, `Cancel run`, `Copy log` */
  actionLabel: '#cfd5da',
  /**
   * shared — `run` and `shell`: a failed run's `#220 · 0.8s` meta and the error well's owning node
   * (`Run panel — states` failed, 801 and 806). Load-bearing rather than decorative: with the
   * `#4a5157` cached dot it is one of only two colours that are the sole mark of a state, so it
   * must survive exactly and may never be approximated.
   */
  failedMeta: '#6d5f5c',
} as const

export const accent = {
  base: '#1fd6bd',
  onFill: '#04211d',
  onFillMuted: 'rgba(4,33,29,.6)',
  /** Every accent-coloured element reads this, so the frame's `--accent` can override it. */
  cssVar: 'var(--accent, #1fd6bd)',
  selectionBorder: 'rgba(31,214,189,.42)',
  selectionHalo: '0 0 0 3px rgba(31,214,189,.06)',
  headerWash: 'rgba(31,214,189,.05)',
  chipBorder: 'rgba(31,214,189,.3)',
  chipFill: 'rgba(31,214,189,.06)',
  /** shared — `canvas`, `run` and `studio`: the unlit ring behind a spinner's accent arc */
  spinnerTrack: 'rgba(31,214,189,.25)',
} as const

export const accentAlternates = ['#28c8d8', '#3ecf8e', '#c8a24a'] as const

export const statusColors = {
  ok: '#6f9c82',
  failed: '#c96a5c',
  errorTag: '#dc8577',
  errorBody: '#a79b98',
  unsaved: '#8a7d4a',
} as const

export type KindDotTone = 'start' | 'neutral' | 'queued' | 'cached'

export const kindDotColors: Readonly<Record<KindDotTone, string>> = {
  start: accent.cssVar,
  neutral: '#3d4348',
  queued: '#2e3337',
  cached: '#4a5157',
}

export const fontFamilies = {
  ui: 'Archivo, Helvetica, sans-serif',
  mono: "'JetBrains Mono', monospace",
} as const

/** The nine-step scale, in px. Nothing in the Studio uses a size outside it. */
export const typeScale = [14, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5] as const

export type FontSize = (typeof typeScale)[number]

export const fontWeights = { regular: 400, medium: 500, semibold: 600 } as const

export const tracking = {
  title: '-0.01em',
  wide: '.01em',
  sectionLabel: '.1em',
  startTag: '.08em',
} as const

/**
 * `control: 5` covers chips, inputs and the padded top-bar buttons; `small: 4` covers the icon
 * button, the compact buttons and thumbnails. The spec's prose labels `4` as the chip radius, but
 * every chip in the artboards is `5` — the design wins.
 */
export const radii = {
  panel: 8,
  nodeCard: 7,
  control: 5,
  small: 4,
  badge: 3,
  kindDot: 2,
  round: '50%',
} as const

/** The four motion loops. The keyframe names match `STUDIO_GLOBAL_CSS`. */
export const motion = {
  spinner: 'jspin .7s linear infinite',
  edgeDash: 'jdash .8s linear infinite',
  shimmer: 'jshim 1.5s linear infinite',
  pulseSlow: 'jpulse 1.5s ease-in-out infinite',
  pulseFast: 'jpulse 1s ease-in-out infinite',
} as const

export const layout = {
  topBarHeight: 52,
  panelHeaderHeight: 38,
  leftSidebarWidth: 248,
  rightDockWidth: 320,
  nodeHeaderHeight: 36,
  sectionLabelRowHeight: 22,
  fieldRowHeight: 30,
  cardFooterHeight: 8,
  listRowHeight: 30,
  inventoryRowHeight: 28,
  iconButtonSize: 22,
  chipHeight: 28,
} as const

/** `12.5` -> `'12.5px'`. Keeps every call site on the scale. */
export function px(value: number): string {
  return `${value}px`
}
