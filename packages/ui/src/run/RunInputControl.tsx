import type { InputFieldDescriptor } from '@jobik/core'
import { type CSSProperties, useId } from 'react'
import { TypeAnnotation } from '../primitives/index.js'
import { borders, fontFamilies, px, radii, surfaces, textColors } from '../tokens.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'
import type { RunInputDraftValue, RunInputPresentation } from './types.js'

/** `Studio — default`, line 283: the single-line control shell. */
const lineShell: CSSProperties = {
  width: '100%',
  border: `1px solid ${borders.quietControl}`,
  borderRadius: px(radii.control),
  background: surfaces.inputWell,
  padding: '9px 10px',
  fontFamily: fontFamilies.ui,
  fontSize: px(12),
  color: runPanelColors.controlValue,
}

/** `Studio — default`, line 290: the same shell as a 118px monospace area. */
const areaShell: CSSProperties = {
  ...lineShell,
  height: px(runPanelMetrics.markdownAreaHeight),
  fontFamily: fontFamilies.mono,
  fontSize: px(11),
  lineHeight: 1.65,
  color: textColors.fieldLabel,
  resize: 'none',
}

export interface RunInputControlProps {
  readonly field: InputFieldDescriptor
  readonly value: RunInputDraftValue
  /** `'line'` by default. A `json` control is always an area whatever this says. */
  readonly presentation?: RunInputPresentation
  readonly onChange?: (field: string, value: RunInputDraftValue) => void
}

/**
 * One control per top-level input field, drawn on one of the two shells the design fixes.
 *
 * `number`, `boolean` and `enum` are named by `## Zod and editor controls` but by no artboard, so
 * they reuse the single-line shell and change only the element inside it. `literal` and `asset` are
 * never editable and render disabled: a literal is fixed, and an unconnected asset input is a graph
 * validation error rather than an empty form control.
 */
export function RunInputControl(props: RunInputControlProps) {
  const { field, onChange } = props
  const control = field.control
  const testId = `run-input-${field.field}`
  // A document may mount more than one run panel — a RunPanelCard beside a docked RunPanel, or
  // several state cards side by side — so the real DOM id must be unique per mounted control.
  // data-testid stays the field-only form: existing tests and the label's own testid depend on it.
  const domId = `${useId()}-${field.field}`
  const emit = (next: RunInputDraftValue) => onChange?.(field.field, next)
  const text = typeof props.value === 'string' ? props.value : ''

  const element = (() => {
    if (control.kind === 'json') {
      return (
        <textarea
          data-testid={testId}
          id={domId}
          value={text}
          onChange={(event) => emit(event.target.value)}
          style={areaShell}
        />
      )
    }

    if (control.kind === 'literal' || control.kind === 'asset') {
      const fixed =
        control.kind === 'literal' ? String(control.value ?? 'null') : (field.title ?? 'Buffer')
      return (
        <input data-testid={testId} id={domId} disabled readOnly value={fixed} style={lineShell} />
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
          style={{ ...lineShell, width: 'auto', padding: 0 }}
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
          style={lineShell}
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
          value={text}
          onChange={(event) => emit(event.target.value)}
          style={lineShell}
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
          style={areaShell}
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
        style={lineShell}
      />
    )
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: px(7) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <label
          htmlFor={domId}
          data-testid={`run-input-label-${field.field}`}
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(11.5),
            color: textColors.activeFieldLabel,
          }}
        >
          {field.field}
        </label>
        <TypeAnnotation data-testid={`run-input-annotation-${field.field}`}>
          {field.annotation}
        </TypeAnnotation>
      </div>
      {element}
    </div>
  )
}
