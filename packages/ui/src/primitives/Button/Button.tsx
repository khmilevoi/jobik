import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx, type StyleWithVars } from '#cx.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { Spinner, type SpinnerSize } from '#primitives/Spinner/Spinner.js'
import { px } from '#tokens.js'
import s from './Button.module.css'

export type ButtonVariant = 'quiet' | 'outlined' | 'panel' | 'accent' | 'destructive'

/**
 * `modal` is a height, not a rank: `3C` §1.5 makes every modal-footer button 32 px, "one notch
 * shorter than the 34 px panel buttons". It is a separate step from `lg` because the design writes
 * the top bar's ghost as `padding:6px 12px` with no height and the footer's as
 * `height:32px; padding:0 12px` — the same chrome in two different boxes.
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'modal'

/**
 * The four states artboard `3A` draws every button shape in, named once for both of its actions.
 *
 * The artboard runs two columns of headers — copy is `Default → Working → Copied → Failed`,
 * download is `Default → Preparing → Transferring → Saved` — but they are the same five cells of
 * chrome, so the props are named after what the button is doing rather than after one action:
 *
 *   idle      Default
 *   busy      Working / Preparing — the indeterminate loader, no number yet
 *   progress  Transferring — the determinate loader; pass `progress`
 *   ok        Copied / Saved
 *   failed    Failed
 *
 * `busy` and `progress` are both "working" and differ only in whether a size is known. Rule 03:
 * "Percent only when the size is known, otherwise the spinner stays indeterminate." A caller that
 * cannot honestly produce a percentage stays on `busy`.
 */
export type ButtonState = 'idle' | 'busy' | 'progress' | 'ok' | 'failed'

interface ButtonCommonProps {
  readonly children: ReactNode
  /**
   * The leading icon, drawn only while idle. Every other state owns that slot: `busy` puts the
   * spinner there, `ok` the check, and `failed` and `progress` draw nothing — `3A` §2.1 is
   * explicit that the failed cell carries **no icon**.
   */
  readonly icon?: ReactNode
  /** The mono span an accent fill carries: `⌘↵` on a run button, `654 kb` on the download primary. */
  readonly hint?: ReactNode
  /** The mono state read-out beside the label: `42%`, `274 / 654 kb`, `18 lines`. */
  readonly meta?: ReactNode
  /**
   * A plain trailing slot, separated by the cell's own gap and inheriting its colour — `2A`'s
   * `Show output` puts its chevron here. Unlike `hint` and `meta` it carries no type of its own,
   * so an icon in it follows the button through every hover and state.
   */
  readonly trailing?: ReactNode
  readonly state?: ButtonState
  /**
   * `0`–`100`. Draws the determinate loader — a 2 px bar flush to the bottom edge on every shape
   * but the h34 primary, which takes an inner fill instead. Only meaningful with
   * `state="progress"`; never synthesise one, because `3A` rule 03 makes its absence a state of
   * its own.
   */
  readonly progress?: number
  /**
   * Rule 02 — the width the button reserves for its longest label, so a state change never shifts
   * the row around it. The design fixes three: `106` on the copy toolbar button, `112` on the
   * download toolbar button, `132` on the live download button.
   */
  readonly reserveWidth?: number
  /**
   * `3B` — the surface around this button already reports the work, so the button only dims to
   * 45 % and stops responding. It does not grow a loader of its own. Implies `disabled`.
   */
  readonly dimmed?: boolean
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly className?: string
  readonly 'aria-label'?: string
  readonly 'data-testid'?: string
}

/**
 * Only the eight (variant, size) cells the artboards contain are typed. A plan that needs a ninth
 * reports it as a gap rather than inventing its metrics.
 */
export type ButtonProps =
  | (ButtonCommonProps & {
      readonly variant: 'quiet'
      readonly size: 'xs' | 'sm' | 'md' | 'lg' | 'modal'
    })
  | (ButtonCommonProps & { readonly variant: 'outlined'; readonly size: 'md' | 'lg' })
  | (ButtonCommonProps & { readonly variant: 'panel'; readonly size: 'lg' })
  | (ButtonCommonProps & { readonly variant: 'accent'; readonly size: 'xs' | 'lg' | 'modal' })
  | (ButtonCommonProps & { readonly variant: 'destructive'; readonly size: 'modal' })

/** The twelve cells, spelled out. `satisfies` makes a missing or invented cell a type error. */
type ButtonCell =
  | 'quiet:xs'
  | 'quiet:sm'
  | 'quiet:md'
  | 'quiet:lg'
  | 'quiet:modal'
  | 'outlined:md'
  | 'outlined:lg'
  | 'panel:lg'
  | 'accent:xs'
  | 'accent:lg'
  | 'accent:modal'
  | 'destructive:modal'

/**
 * The same table that used to hold a `CSSProperties` per cell, holding a class name per cell. The
 * keys are unchanged, so the cell a `(variant, size)` pair selects is still readable at a glance.
 *
 * Every value is a literal `s.<name>` read on purpose: `cssModuleUsage.test.ts` compares the reads
 * in this file against the classes `Button.module.css` defines, in both directions, and a computed
 * key would make a typo invisible to it.
 */
const cells = {
  'quiet:xs': s.quietXs,
  'quiet:sm': s.quietSm,
  'quiet:md': s.quietMd,
  'quiet:lg': s.quietLg,
  'quiet:modal': s.quietModal,
  'outlined:md': s.outlinedMd,
  'outlined:lg': s.outlinedLg,
  'panel:lg': s.panelLg,
  'accent:xs': s.accentXs,
  'accent:lg': s.accentLg,
  'accent:modal': s.accentModal,
  'destructive:modal': s.destructiveModal,
} satisfies Record<ButtonCell, string>

/** `idle` adds no class; `cx` drops the empty string. */
const states = {
  idle: '',
  busy: s.busy,
  progress: s.progress,
  ok: s.ok,
  failed: s.failed,
} satisfies Record<ButtonState, string>

/**
 * The determinate loader's shape, per variant. `08-buttons.md` §1 draws the 2 px bar flush to the
 * bottom edge everywhere except the h34 primary, where §3.2 replaces it with an inner fill running
 * the full height with the label floating above it.
 */
const progressShape = {
  quiet: s.progressBar,
  outlined: s.progressBar,
  panel: s.progressBar,
  destructive: s.progressBar,
  accent: s.progressFill,
} satisfies Record<ButtonVariant, string>

/**
 * Ring and check size follow the control's size step, per `08-buttons.md` §1: 9 px in an h20/h24
 * control, 10 px in an h26, 11 px in an h34. The design draws a loader only in the cells that
 * actually load — `quiet:lg`, `outlined:lg` and `accent:xs` are never shown working — so their
 * entries follow the same rule rather than inventing a size of their own.
 */
const indicatorSizes = {
  xs: 9,
  sm: 9,
  md: 10,
  lg: 11,
  // `3C` rule 04 sends the 32px footer button to "the loader from 3a" without naming a size. 11 is
  // the step the neighbouring h34 takes and the nearest the appendix states; nothing new is minted.
  modal: 11,
} satisfies Record<ButtonSize, SpinnerSize>

/**
 * The table is two-axis and deliberately partial — there is no `outlined:sm` cell — so the switch
 * is what narrows `size` to the sizes that variant actually has. It costs four lines and buys the
 * lookup with no cast: a ninth cell cannot be selected without adding it above first.
 */
function cellClass(props: ButtonProps): string {
  switch (props.variant) {
    case 'quiet':
      return cells[`quiet:${props.size}`]
    case 'outlined':
      return cells[`outlined:${props.size}`]
    case 'panel':
      return cells[`panel:${props.size}`]
    case 'accent':
      return cells[`accent:${props.size}`]
    case 'destructive':
      return cells[`destructive:${props.size}`]
  }
}

function indicator(state: ButtonState, size: SpinnerSize, icon: ReactNode): ReactNode {
  switch (state) {
    case 'busy':
      return <Spinner size={size} />
    case 'ok':
      return <CheckIcon size={size} />
    case 'idle':
      return icon
    // 3A draws no glyph in either: the failed cell says "no icon", and the transferring cell
    // gives the slot to the percentage instead.
    case 'progress':
    case 'failed':
      return null
  }
}

export const Button = reatomComponent(function Button(props: ButtonProps) {
  const {
    children,
    icon,
    hint,
    meta,
    trailing,
    state = 'idle',
    progress,
    reserveWidth,
    dimmed,
  } = props
  const size = indicatorSizes[props.size]
  const leading = indicator(state, size, icon)

  const style: StyleWithVars = {}
  if (reserveWidth !== undefined) style['--jbk-button-reserve'] = px(reserveWidth)
  if (progress !== undefined) style['--jbk-button-progress'] = `${progress}%`

  return (
    <button
      type="button"
      onClick={props.onClick}
      // `3B`'s dim means "stops responding", so it disables rather than only fading.
      disabled={props.disabled === true || dimmed === true}
      aria-label={props['aria-label']}
      data-testid={props['data-testid']}
      style={reserveWidth === undefined && progress === undefined ? undefined : style}
      className={cx(
        s.button,
        cellClass(props),
        states[state],
        dimmed === true && s.dimmed,
        props.className,
      )}
    >
      {state === 'progress' && progress !== undefined ? (
        <span aria-hidden="true" className={progressShape[props.variant]} />
      ) : null}
      {leading === null || leading === undefined ? null : (
        <span className={s.indicator}>{leading}</span>
      )}
      <span className={s.label}>{children}</span>
      {meta === undefined ? null : <span className={s.meta}>{meta}</span>}
      {hint === undefined ? null : <span className={s.hint}>{hint}</span>}
      {trailing}
    </button>
  )
}, 'Button')
