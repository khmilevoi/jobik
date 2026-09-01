import type { InputFieldDescriptor } from '@jobik/core'
import { reatomComponent } from '@reatom/react'
import { useId } from 'react'
import { cx } from '#cx.js'
import { TypeAnnotation } from '#primitives/index.js'
import type { RunInputDraftValue, RunInputPresentation } from '#run/types.js'
import s from './RunInputControl.module.css'

/** The three shells a control can sit on. `line` and `area` are the two the design draws. */
type RunInputShell = 'line' | 'area' | 'checkbox'

const shells = {
  line: s.shell,
  area: cx(s.shell, s.area),
  checkbox: cx(s.shell, s.checkbox),
} satisfies Record<RunInputShell, string>

type RunInputControlKind = InputFieldDescriptor['control']['kind']

/**
 * Every control kind, spelled out, and the shell it sits on.
 *
 * `number`, `boolean` and `enum` are named by `## Zod and editor controls` but by no artboard, so
 * they reuse the single-line shell and change only the element inside it. `satisfies` makes a new
 * kind in `@jobik/core`'s `ControlDescriptor` a type error here rather than a control that renders
 * unstyled.
 */
const shellByControl = {
  string: 'line',
  number: 'line',
  boolean: 'checkbox',
  enum: 'line',
  literal: 'line',
  asset: 'line',
  json: 'area',
} satisfies Record<RunInputControlKind, RunInputShell>

/**
 * Which shell a field takes. `string` is the only kind the caller's `presentation` moves, and a
 * `json` control is an area whatever it says — the table above already fixes that.
 */
function shellOf(
  kind: RunInputControlKind,
  presentation: RunInputPresentation | undefined,
): string {
  if (kind === 'string' && presentation === 'area') return shells.area
  return shells[shellByControl[kind]]
}

export interface RunInputControlProps {
  readonly field: InputFieldDescriptor
  readonly value: RunInputDraftValue
  /** `'line'` by default. A `json` control is always an area whatever this says. */
  readonly presentation?: RunInputPresentation
  readonly onChange?: (field: string, value: RunInputDraftValue) => void
  readonly className?: string
}

/**
 * One control per top-level input field, drawn on one of the two shells the design fixes.
 *
 * `literal` and `asset` are never editable and render disabled: a literal is fixed, and an
 * unconnected asset input is a graph validation error rather than an empty form control.
 *
 * It keeps its four props rather than reading `InputsModel`. `field` — which control this is — has
 * no model home: it is one element of `startNode().input.fields`, and the same component draws the
 * failed and completed cards' `RunInputForm`, whose descriptor is the model's too. Reading the
 * draft here instead would also cost `RunPanelCard` the ability to draw a form outside a Studio,
 * and buys nothing: a keystroke already rebuilds `RunPanelModel.state`, so the panel re-renders
 * either way.
 */
export const RunInputControl = reatomComponent(function RunInputControl(
  props: RunInputControlProps,
) {
  const { field, onChange } = props
  const control = field.control
  const testId = `run-input-${field.field}`
  // A document may mount more than one run panel — a RunPanelCard beside a docked RunPanel, or
  // several state cards side by side — so the real DOM id must be unique per mounted control.
  // data-testid stays the field-only form: existing tests and the label's own testid depend on it.
  const domId = `${useId()}-${field.field}`
  const emit = (next: RunInputDraftValue) => onChange?.(field.field, next)
  const text = typeof props.value === 'string' ? props.value : ''
  const shell = shellOf(control.kind, props.presentation)

  const element = (() => {
    if (control.kind === 'json') {
      return (
        <textarea
          data-testid={testId}
          id={domId}
          value={text}
          onChange={(event) => emit(event.target.value)}
          className={shell}
        />
      )
    }

    if (control.kind === 'literal' || control.kind === 'asset') {
      const fixed =
        control.kind === 'literal' ? String(control.value ?? 'null') : (field.title ?? 'Buffer')
      return (
        <input data-testid={testId} id={domId} disabled readOnly value={fixed} className={shell} />
      )
    }

    if (control.kind === 'boolean') {
      return (
        <input
          data-testid={testId}
          id={domId}
          type="checkbox"
          checked={props.value === true}
          onChange={(event) => emit(event.target.checked)}
          className={shell}
        />
      )
    }

    if (control.kind === 'enum') {
      return (
        <select
          data-testid={testId}
          id={domId}
          value={text}
          onChange={(event) => emit(event.target.value)}
          className={shell}
        >
          {control.options.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      )
    }

    if (control.kind === 'number') {
      return (
        <input
          data-testid={testId}
          id={domId}
          type="number"
          step={control.integer ? 1 : 'any'}
          // The schema's own bounds, so the browser can report an out-of-range value. React omits
          // an `undefined` attribute, so a field with no bound emits none. Only the INCLUSIVE
          // bounds exist to forward: `min`/`max` are inclusive by definition, and the descriptor
          // carries nothing else — `z.number().gt(0)` converts to `exclusiveMinimum`, which
          // `deriveInputControls` does not read.
          min={control.minimum}
          max={control.maximum}
          value={text}
          onChange={(event) => emit(event.target.value)}
          className={shell}
        />
      )
    }

    if (props.presentation === 'area') {
      return (
        <textarea
          data-testid={testId}
          id={domId}
          value={text}
          onChange={(event) => emit(event.target.value)}
          className={shell}
        />
      )
    }

    return (
      <input
        data-testid={testId}
        id={domId}
        type="text"
        value={text}
        onChange={(event) => emit(event.target.value)}
        className={shell}
      />
    )
  })()

  return (
    <div className={cx(s.field, props.className)}>
      <div className={s.head}>
        <label htmlFor={domId} data-testid={`run-input-label-${field.field}`} className={s.label}>
          {field.field}
        </label>
        <TypeAnnotation data-testid={`run-input-annotation-${field.field}`}>
          {field.annotation}
        </TypeAnnotation>
      </div>
      {element}
    </div>
  )
}, 'RunInputControl')
