import type { InputFieldDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunInputControl } from './RunInputControl.js'

afterEach(cleanup)

const title: InputFieldDescriptor = {
  field: 'title',
  required: true,
  annotation: 'string',
  control: { kind: 'string' },
}

const markdown: InputFieldDescriptor = {
  field: 'markdown',
  required: true,
  annotation: 'string',
  control: { kind: 'string' },
}

describe('RunInputControl', () => {
  it('labels the field in mono beside its type annotation', () => {
    render(<RunInputControl field={title} value="Typed flows, quietly" />)
    const label = screen.getByTestId('run-input-label-title')
    expect(label.textContent).toBe('title')
    expect(label.style.fontFamily).toContain('JetBrains Mono')
    expect(label.style.fontSize).toBe('11.5px')
    expect(label.style.color).toBe('rgb(195, 201, 206)')
    const annotation = screen.getByTestId('run-input-annotation-title')
    expect(annotation.textContent).toBe('string')
    expect(annotation.style.fontSize).toBe('10px')
    expect(annotation.style.color).toBe('rgb(93, 101, 108)')
  })

  it('draws a single-line control for a string by default', () => {
    render(<RunInputControl field={title} value="Typed flows, quietly" />)
    const input = screen.getByTestId('run-input-title')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveValue('Typed flows, quietly')
    expect(input.style.border).toBe('1px solid rgb(33, 37, 40)')
    expect(input.style.background).toBe('rgb(12, 14, 16)')
    expect(input.style.borderRadius).toBe('5px')
    expect(input.style.padding).toBe('9px 10px')
    expect(input.style.fontSize).toBe('12px')
    expect(input.style.color).toBe('rgb(213, 218, 222)')
  })

  it('draws a 118px monospace area when the caller asks for one', () => {
    render(<RunInputControl field={markdown} value="## Release 0.4" presentation="area" />)
    const area = screen.getByTestId('run-input-markdown')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.style.height).toBe('118px')
    expect(area.style.fontFamily).toContain('JetBrains Mono')
    expect(area.style.fontSize).toBe('11px')
    expect(area.style.lineHeight).toBe('1.65')
    expect(area.style.color).toBe('rgb(170, 177, 183)')
  })

  it('reports every keystroke as a draft change', async () => {
    const onChange = vi.fn()
    render(<RunInputControl field={title} value="" onChange={onChange} />)
    await userEvent.type(screen.getByTestId('run-input-title'), 'a')
    expect(onChange).toHaveBeenCalledWith('title', 'a')
  })

  it('draws a number control on the single-line shell', () => {
    const field: InputFieldDescriptor = {
      field: 'width',
      required: true,
      annotation: 'number',
      control: { kind: 'number', integer: true },
    }
    render(<RunInputControl field={field} value="1024" />)
    const input = screen.getByTestId('run-input-width')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('step', '1')
    expect(input.style.border).toBe('1px solid rgb(33, 37, 40)')
  })

  it('draws a boolean as a checkbox and reports its next value', async () => {
    const onChange = vi.fn()
    const field: InputFieldDescriptor = {
      field: 'draft',
      required: false,
      annotation: 'boolean',
      control: { kind: 'boolean' },
    }
    render(<RunInputControl field={field} value={false} onChange={onChange} />)
    const box = screen.getByTestId('run-input-draft')
    expect(box).toHaveAttribute('type', 'checkbox')
    await userEvent.click(box)
    expect(onChange).toHaveBeenCalledWith('draft', true)
  })

  it('draws an enum as a select over its options', () => {
    const field: InputFieldDescriptor = {
      field: 'format',
      required: true,
      annotation: 'string',
      control: { kind: 'enum', options: ['png', 'webp'] },
    }
    render(<RunInputControl field={field} value="webp" />)
    const select = screen.getByTestId('run-input-format')
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveValue('webp')
    expect(screen.getByRole('option', { name: 'png' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'webp' })).toBeInTheDocument()
  })

  it('draws a literal disabled, showing the fixed value', () => {
    const field: InputFieldDescriptor = {
      field: 'kind',
      required: true,
      annotation: 'string',
      control: { kind: 'literal', value: 'article' },
    }
    render(<RunInputControl field={field} value="" />)
    const input = screen.getByTestId('run-input-kind')
    expect(input).toBeDisabled()
    expect(input).toHaveValue('article')
  })

  it('draws an asset disabled, showing its annotation, because it is never a form control', () => {
    const field: InputFieldDescriptor = {
      field: 'cover',
      required: true,
      annotation: 'Buffer',
      title: 'Buffer',
      control: { kind: 'asset', mime: 'image/png' },
    }
    render(<RunInputControl field={field} value="" />)
    const input = screen.getByTestId('run-input-cover')
    expect(input).toBeDisabled()
    expect(input).toHaveValue('Buffer')
  })

  it('draws a nested schema in the monospace area whatever the caller asks for', () => {
    const field: InputFieldDescriptor = {
      field: 'meta',
      required: true,
      annotation: 'object',
      control: { kind: 'json', schema: { type: 'object' } },
    }
    render(<RunInputControl field={field} value={'{"a":1}'} presentation="line" />)
    const area = screen.getByTestId('run-input-meta')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.style.height).toBe('118px')
    expect(area).toHaveValue('{"a":1}')
  })
})
