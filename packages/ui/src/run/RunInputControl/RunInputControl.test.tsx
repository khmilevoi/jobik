import type { InputFieldDescriptor } from '@jobik/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('offers an accessible native picker and local preview beside the advanced draft', async () => {
    const onSelect = vi.fn()
    render(
      <RunInputControl
        field={title}
        value="previous"
        upload={{
          accept: 'image/png,image/jpeg',
          maxBytes: 1000,
          uploading: true,
          previewUrl: 'blob:preview',
          fileName: 'photo.png',
          onSelect,
        }}
      />,
    )
    const picker = screen.getByLabelText('Upload image for title')
    expect(picker).toHaveAttribute('type', 'file')
    expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg')
    expect(screen.getByAltText('Selected file for title')).toHaveAttribute('src', 'blob:preview')
    expect(screen.getByRole('status')).toHaveTextContent('Uploading')
    const file = new File(['png'], 'photo.png', { type: 'image/png' })
    await userEvent.upload(picker, file)
    expect(onSelect).toHaveBeenCalledWith(file)
    expect(screen.getByTestId('run-input-title')).toHaveValue('previous')
  })

  it('labels the field beside its type annotation', () => {
    render(<RunInputControl field={title} value="Typed flows, quietly" />)
    expect(screen.getByTestId('run-input-label-title').textContent).toBe('title')
    expect(screen.getByTestId('run-input-annotation-title').textContent).toBe('string')
  })

  it('draws a single-line control for a string by default', () => {
    render(<RunInputControl field={title} value="Typed flows, quietly" />)
    const input = screen.getByTestId('run-input-title')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveValue('Typed flows, quietly')
  })

  it('draws a monospace area on its own shell when the caller asks for one', () => {
    render(<RunInputControl field={title} value="a" />)
    const line = screen.getByTestId('run-input-title').className
    cleanup()
    render(<RunInputControl field={markdown} value="## Release 0.4" presentation="area" />)
    const area = screen.getByTestId('run-input-markdown')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.className).not.toBe(line)
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
    render(<RunInputControl field={title} value="a" />)
    const line = screen.getByTestId('run-input-title').className
    cleanup()
    render(<RunInputControl field={field} value="1024" />)
    const input = screen.getByTestId('run-input-width')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('step', '1')
    expect(input.className).toBe(line)
  })

  it('forwards the schema bounds so the browser can report an out-of-range value', () => {
    const bounded: InputFieldDescriptor = {
      field: 'latitude',
      required: true,
      annotation: 'number',
      // forecast's own field: `z.number().min(-90).max(90)`.
      control: { kind: 'number', integer: false, minimum: -90, maximum: 90 },
    }
    render(<RunInputControl field={bounded} value="50.45" />)
    const input = screen.getByTestId('run-input-latitude')
    expect(input).toHaveAttribute('min', '-90')
    expect(input).toHaveAttribute('max', '90')
    expect((input as HTMLInputElement).validity.rangeUnderflow).toBe(false)
  })

  it('emits no bound a field does not declare', () => {
    const unbounded: InputFieldDescriptor = {
      field: 'width',
      required: true,
      annotation: 'number',
      control: { kind: 'number', integer: true },
    }
    render(<RunInputControl field={unbounded} value="1024" />)
    const input = screen.getByTestId('run-input-width')
    expect(input).not.toHaveAttribute('min')
    expect(input).not.toHaveAttribute('max')
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

  it('gives each mounted control a document-unique id, with htmlFor matching its own', () => {
    render(
      <div>
        <RunInputControl field={title} value="a" />
        <RunInputControl field={title} value="b" />
      </div>,
    )
    const inputs = screen.getAllByTestId('run-input-title')
    const labels = screen.getAllByTestId('run-input-label-title')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]?.id).not.toBe(inputs[1]?.id)
    expect(labels[0]).toHaveAttribute('for', inputs[0]?.id)
    expect(labels[1]).toHaveAttribute('for', inputs[1]?.id)
  })

  it('draws a nested schema on the area shell whatever the caller asks for', () => {
    render(<RunInputControl field={markdown} value="x" presentation="area" />)
    const area = screen.getByTestId('run-input-markdown').className
    cleanup()
    const field: InputFieldDescriptor = {
      field: 'meta',
      required: true,
      annotation: 'object',
      control: { kind: 'json', schema: { type: 'object' } },
    }
    render(<RunInputControl field={field} value={'{"a":1}'} presentation="line" />)
    const json = screen.getByTestId('run-input-meta')
    expect(json.tagName).toBe('TEXTAREA')
    expect(json).toHaveValue('{"a":1}')
    expect(json.className).toBe(area)
  })
})

it('keeps stored input intact when its preview fails and resets the visual error for another value', () => {
  const onChange = vi.fn()
  const upload = {
    accept: 'image/png',
    maxBytes: 100,
    uploading: false,
    previewUrl: '/preview?value=old',
    onSelect: vi.fn(),
  }
  const { rerender } = render(
    <RunInputControl field={title} value="old" upload={upload} onChange={onChange} />,
  )
  expect(screen.getByText('Stored image attached')).toBeVisible()
  fireEvent.error(screen.getByAltText('Stored image for title'))
  expect(screen.getByRole('status')).toHaveTextContent('input value is preserved')
  expect(screen.getByTestId('run-input-title')).toHaveValue('old')
  expect(onChange).not.toHaveBeenCalled()
  rerender(
    <RunInputControl
      field={title}
      value="new"
      upload={{ ...upload, previewUrl: '/preview?value=new' }}
      onChange={onChange}
    />,
  )
  expect(screen.getByAltText('Stored image for title')).toBeVisible()
  expect(screen.queryByRole('status')).toBeNull()
})
