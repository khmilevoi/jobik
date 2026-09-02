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
  /**
   * The unlit ring behind a spinner's accent arc, at the wider of the design's two alphas.
   * `canvas`, `run` and `studio` each drew their own ring until `primitives/Spinner` replaced all
   * three, so `primitives` is now its only reader — it stays here because it is the `.25` half of
   * a pair whose `.22` half is `primitiveColors.accentSoft`, and because the value is the
   * design's, not one directory's.
   */
  spinnerTrack: 'rgba(31,214,189,.25)',
  /**
   * The colour every accent inline link and the accent primary swap to on hover.
   *
   * The one value in this group that does **not** follow `cssVar`, because the design states it as
   * a literal rather than as a function of the accent. A themed frame that overrides `--accent`
   * therefore keeps this hover, which is a real limitation and not an oversight — the design fixes
   * no hover for the three `accentAlternates`.
   */
  hover: '#4ce3ce',
} as const

export const accentAlternates = ['#28c8d8', '#3ecf8e', '#c8a24a'] as const

export const statusColors = {
  ok: '#6f9c82',
  failed: '#c96a5c',
  errorTag: '#dc8577',
  errorBody: '#a79b98',
  unsaved: '#8a7d4a',
  /**
   * shared — `primitives` and `shell`: a success LABEL, one step lighter than `ok`, which stays the
   * dot and the column header. `3A` §2.1 gives it to the copied/saved button, `3D` §3D.3 to the
   * status strip's `No issues`.
   */
  okLabel: '#8bb69c',
  /**
   * shared — `shell` and `modals`: the one colour a warning gets anywhere. `3D` §3D.3 uses it for
   * the problems strip's warning code, `09-modals.md` §2 for the Validation dialog's warning tag
   * and its `1 warning` badge. The design gives a warning no second, brighter step — a highlighted
   * warning row keeps this exact value.
   */
  warningTag: '#b3a069',
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

/**
 * The design's motion, whole. The keyframe names match `STUDIO_GLOBAL_CSS`.
 *
 * Two halves, and the second one is new. The **loops** come first: something is moving because work
 * is in progress. `validateSweep` joined them with artboard `3D`, and `resultPop` is the loop
 * group's one exception — a `.22s` entrance for a result chip, and the only `ease-out` in the
 * design. Then come the **transitions**, from artboard `4A` (`.design/raw/studio.dc.html`, lines
 * 32-209), which is the normative motion spec and *reverses* the older "nothing moves because a
 * state changed" rule: six durations and three curves, the whole scale, nothing outside it.
 *
 * `4A`'s four rules, because a duration alone does not say how to use it:
 *
 * 1. Anything that answers the pointer is instant — `durationPointer` is `0ms` and means *no*
 *    transition and *no* keyframe, not a very short one.
 * 2. One property moves at a time. A node changes colour, a dock changes height, a screen changes
 *    opacity. Nothing changes colour and size and position at once.
 * 3. Exits are shorter than entrances — 200 in, 120 out — and take `easeExit`.
 * 4. A transition never delays a result, and under `prefers-reduced-motion` every duration here
 *    becomes `0` except the spinner. `globalStyles.css` does that by redefining these tokens.
 */
export const motion = {
  spinner: 'jspin .7s linear infinite',
  edgeDash: 'jdash .8s linear infinite',
  shimmer: 'jshim 1.5s linear infinite',
  pulseSlow: 'jpulse 1.5s ease-in-out infinite',
  pulseFast: 'jpulse 1s ease-in-out infinite',
  /** `3D`: the 2px gradient bar under a validating button. Its host must clip and be positioned. */
  validateSweep: 'jsweep 1.1s ease-in-out infinite',
  /** `3D`: the resolved `Valid` / `2 errors` chip arriving. */
  resultPop: 'jpop .22s ease-out',
  /** `4A`: the control swap — the frame holds still and only its contents cross-fade. */
  swapFade: 'jfade 90ms linear',
  /** `4A`/demo: a log line or run-history row arriving, lifting 3px as it fades in. */
  lineIn: 'jline 140ms cubic-bezier(.2,.8,.25,1)',

  /**
   * `4A`'s own tile (`.design/raw/studio.dc.html:51,71`): `0 · pointer · hover · press · focus
   * ring`, the first of the six named durations. Rule 01 spells out what the zero means — *no*
   * transition and *no* keyframe for hover/press/focus, not a very short one — so this token is
   * read by no stylesheet, and that is correct rather than dead: it states that the scale starts
   * at zero, the same way `durationScreen` states where it ends. Keep it even though nothing
   * consumes it.
   */
  durationPointer: '0ms',
  /** `4A` swap: a label or icon changing inside one control. */
  durationSwap: '90ms',
  /** `4A` state: node, chip, tab marker, row. Also the entrance for a toast or an error. */
  durationState: '140ms',
  /** `4A` layout: dock height, panel width. Paired with `opacity durationExit linear`. */
  durationLayout: '180ms',
  /** `4A` overlay, entering: the modal backdrop and card together. */
  durationOverlayIn: '200ms',
  /** `4A` everything leaving: the modal out, a layout's opacity, a toast out. Rule 03. */
  durationExit: '120ms',
  /** `4A` screen: flow switch, route change. "The only 240 ms in the app." */
  durationScreen: '240ms',

  /** `4A`: everything that arrives or settles. */
  easeSettle: 'cubic-bezier(.2,.8,.25,1)',
  /** `4A`: everything that leaves. */
  easeExit: 'cubic-bezier(.4,0,1,1)',
  /** `4A`: spinners, progress fills, opacity-only fades. */
  easeLinear: 'linear',
} as const

/**
 * The scrollbar. `Studio — full page, output open` draws it three times — down the flows sidebar,
 * down the run dock and beside the output dock's typed-value grid — always as a `3px` track at
 * `rgba(255,255,255,.025)` with a `#333940` thumb, both `2px` rounded. A Studio-wide treatment
 * rather than one panel's, which is why it lives here.
 *
 * The design *draws* a scrollbar; a browser *styles* one, and the two are not the same thing.
 * `globalStyles.css` reads `thumb` and `track` through the standard `scrollbar-color`, and reaches
 * `width`/`radius` only inside its `@supports not (scrollbar-color: auto)` fallback — `scrollbar-width`
 * has no length form, so `thin` is as close to `3px` as a native scrollbar goes.
 */
export const scrollbar = {
  width: 3,
  radius: 2,
  track: 'rgba(255,255,255,.025)',
  thumb: '#333940',
} as const

export const layout = {
  topBarHeight: 52,
  panelHeaderHeight: 38,
  leftSidebarWidth: 248,
  rightDockWidth: 320,
  /**
   * Below this, the output dock's own header (tabs, the mono source line, `Copy all` / `Download`,
   * the `esc` hint, the close button) needs more room than the centre column has left once the
   * fixed sidebar and run dock are subtracted, and its actions overflow past the dock's own edge
   * into the run dock beside it. Measured: the overflow clears at a canvas column width around
   * 1088px (`1200 - leftSidebarWidth - rightDockWidth = 632px` of headroom), so the frame — not any
   * one inner panel — carries a floor here and the page scrolls horizontally below it instead of
   * letting components spill into each other. No artboard defines a narrower Studio state than this.
   */
  studioMinWidth: 1200,
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
