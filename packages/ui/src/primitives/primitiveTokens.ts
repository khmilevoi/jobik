/**
 * The values artboards `3A`, `3B` and `3C` add to the button system, and that no other layer
 * carries.
 *
 * `tokens.ts` owns everything the Studio shares; this file owns only what the button, icon-button,
 * inline-link, value-row, checkbox, toggle and segmented-control primitives add on top of it.
 * **Never re-declare a value another layer carries — import it.** Everything already in
 * `tokens.css` is read from there: `--jbk-status-error-tag` is the failed label, `--jbk-status-ok`
 * the success hue, `--jbk-accent-chip-border` / `--jbk-accent-chip-fill` the icon-button's
 * transferring chrome, `--jbk-accent-spinner-track` the unlit ring on an 11 px spinner,
 * `--jbk-border-save-button` the unchecked checkbox border, `--jbk-surface-input-well` the
 * segmented-control track.
 *
 * Every entry names the artboard section it came from. The `3A` state chrome (`ok*`, `failed*`) is
 * one palette drawn at two strengths: `.4/.08` on a button, `.35/.05` on the value row's field
 * shell — the design draws both, so both are here.
 */

export const primitiveColors = {
  /** 3A §2.1 — the copied/saved button border. */
  okBorder: 'rgba(111,156,130,.4)',
  /** 3A §2.1 — the copied/saved button fill. */
  okFill: 'rgba(111,156,130,.08)',
  /** 3A §2.4 — the value row's copied shell, one step softer than a button's. */
  okBorderSoft: 'rgba(111,156,130,.35)',
  okFillSoft: 'rgba(111,156,130,.05)',
  /** 3A §2.5 — the mono `18 lines` span beside `Log copied`. */
  okMeta: '#63866f',
  /** 3A §2.1 — the failed button border. Its label is `--jbk-status-error-tag`. */
  failedBorder: 'rgba(201,106,92,.4)',
  failedFill: 'rgba(201,106,92,.07)',
  /** 3A §2.4 — the value row's failed shell. */
  failedBorderSoft: 'rgba(201,106,92,.35)',
  failedFillSoft: 'rgba(201,106,92,.05)',
  /**
   * 3D §3D.1 — the `Invalid` Validate button's border. A new step on the failure ramp: `.42`, one
   * notch firmer than the `.4` a `3A` failed button takes, and the same alpha the accent ramp uses
   * for a selected node's border. Its fill is `failedFill`, which `3A` already carries.
   */
  invalidBorder: 'rgba(201,106,92,.42)',
  /** 3D §3D.1 — the `report` sub-chip's fill inside that button. The ramp's other new step. */
  reportChipFill: 'rgba(201,106,92,.16)',
  /** 3D §3D.1 — the `report` sub-chip's mono label, on that fill. */
  reportChipLabel: '#e5a094',
  /**
   * One design value with three roles, all `rgba(31,214,189,.22)`: the unlit ring on an 8/9/10 px
   * spinner (foundations §6-appendix), the primary's inner progress fill (3A §3.2), and the
   * toggle's on-state track (3C). `--jbk-accent-spinner-track` is the `.25` sibling and stays in
   * `tokens.css` — three directories read it.
   */
  accentSoft: 'rgba(31,214,189,.22)',
  /** 3A §3.2 — the primary's fill while preparing. */
  accentTintFill: 'rgba(31,214,189,.14)',
  /** 3A §3.2 — the primary's border while preparing and transferring. */
  accentTintBorder: 'rgba(31,214,189,.35)',
  /** 3A §3.2 — the primary's fill while transferring, under the inner fill. */
  accentProgressFill: 'rgba(31,214,189,.12)',
  /** 3C — the toggle track border in its on state. */
  accentToggleBorder: 'rgba(31,214,189,.4)',
  /** 3A §3.3 — the bare numeral inside the 26 × 26 icon button while transferring. */
  accentPercent: '#9fd8ce',
  /**
   * 3C §1.5 — the label on a destructive primary. Its fill is `--jbk-status-failed`, which already
   * exists. `canvasColors.failedSolidLabel` is the same hex for the failed node card's own
   * `Retry node`; two directories now spell it, so it is a candidate for `tokens.ts`.
   */
  destructiveLabel: '#1a0d0b',
  /** 3C §1.5 and foundations §6.4 — the destructive primary's instant hover swap. */
  destructiveHover: '#d8796b',
  /** Foundations §6.4 — hover border on an h26 ghost button and the h24 output-row button. */
  hoverBorder: '#2f3438',
  /** Foundations §6.4 — hover border on a 24 × 24 / 26 × 26 icon button. */
  hoverBorderIcon: '#33383c',
  /** Foundations §6.4 — hover border on the h34 ghost panel button. */
  hoverBorderPanel: '#34393d',
  /**
   * `#131518`, twice: the hover fill on a 24 × 24 / 26 × 26 icon button (foundations §6.4) and
   * the fill of the `copied` chip that trails that button once it succeeds (3A §2.2).
   */
  iconFill: '#131518',
  /** Foundations §6.4 — hover fill on the h34 ghost panel button. */
  hoverFillPanel: '#101214',
  /** 3A §2.4 — hover fill on the value row's trailing copy button. */
  hoverFillField: '#15181a',
  /**
   * `#1c1f22`, twice: the hover fill on the h26 raised Download button (foundations §6.4) and the
   * selected option's fill in the `3C` segmented control. One value, one property.
   */
  raisedFill: '#1c1f22',
  /** 3A §3.4 — the unfilled part of the output row's 2 px progress track. */
  progressTrackFill: '#16191c',
  /**
   * 3C, extrapolated. The toggle's off state **is not drawn anywhere in the design**;
   * `09-modals.md` says to extrapolate a `#0c0e10` / `#212528` track with a `#4a5157` knob and
   * record it as an extrapolation. The track and border read existing tokens; only the knob needs
   * a value, and this is it. It is the one colour in this file the design does not draw.
   */
  toggleKnobOff: '#4a5157',
} as const

export const primitiveMetrics = {
  /**
   * 3A §3.3 — the bare `42` inside the 26 × 26 icon button while transferring. The only size the
   * Studio uses outside `typeScale`'s nine steps, which is why it cannot live in `tokens.ts`.
   */
  percentSize: 8.5,
  /** 3C — the toggle track's pill radius. `radii` carries no 9. */
  toggleRadius: 9,
  /** 3A §3.4 — the output row's 2 px progress track. `radii` carries no 1. */
  progressTrackRadius: 1,
} as const
