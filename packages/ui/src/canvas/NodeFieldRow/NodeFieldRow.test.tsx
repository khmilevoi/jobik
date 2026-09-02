import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInNodeContext } from '#canvas/canvasTestUtils.js'
import { fieldHandleClass } from '#canvas/fields.js'
import type { FieldProblem, HandleDirection } from '#canvas/types.js'
import { NodeFieldRow } from './NodeFieldRow.js'

afterEach(cleanup)

/**
 * The classes a validation mark ADDS to a handle: the resolver's marked output minus its plain one.
 *
 * Derived rather than spelled, because this file's question is only whether the row forwards
 * `field.problem` to the handle at all. Which colour or border style each class resolves to is
 * `fields.test.ts`'s question and the styling gates'.
 */
function markOnHandle(direction: HandleDirection, problem: FieldProblem): readonly string[] {
  const plain = new Set(fieldHandleClass('idle', direction).split(' '))
  return fieldHandleClass('idle', direction, problem)
    .split(' ')
    .filter((name) => name !== '' && !plain.has(name))
}

describe('NodeFieldRow', () => {
  it('puts the field name left and the type annotation right', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )

    await screen.findByTestId('field-row-target-title')
    expect(screen.getByTestId('field-name')).toHaveTextContent('title')
    expect(screen.getByTestId('field-annotation')).toHaveTextContent('string')
  })

  it('wraps only a dimmed annotation in its own span, so a pending row reads as one', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'pending' }}
        direction="source"
        isStart={false}
        live={false}
      />,
    )
    expect(await screen.findByTestId('field-annotation-dim')).toHaveTextContent('pending')
  })

  it('leaves an ordinary annotation unwrapped', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )
    await screen.findByTestId('field-row-target-title')
    expect(screen.queryByTestId('field-annotation-dim')).toBeNull()
  })

  /**
   * `3D` — *"Errors mark only what is wrong: the port, its type label, the edge, and the node
   * border."* Two of those four are this row's: the port's handle and its type label.
   *
   * These cases exist because the mark is easy to look for in the wrong place. The hue lands on a
   * span **inside** `field-annotation` (see the component's own note on why), so an observer that
   * reads `field-annotation` itself sees the unmarked wrapper and concludes the port is bare. That
   * is exactly the reading an acceptance pass recorded against this artboard, and it was wrong.
   */
  describe("3D's port marks reach the rendered row", () => {
    it("wraps a mismatching port's annotation and marks its handle", async () => {
      renderInNodeContext(
        <NodeFieldRow
          field={{ name: 'image', annotation: 'Buffer', problem: 'mismatch' }}
          direction="target"
          isStart={false}
          live={false}
        />,
      )

      const marked = await screen.findByTestId('field-annotation-problem')
      expect(marked).toHaveTextContent('Buffer')
      // The nesting the audit missed: the marked span is a child of the annotation element.
      expect(screen.getByTestId('field-annotation')).toContainElement(marked)
      expect(screen.getByTestId('field-handle-target-image')).toHaveClass(
        ...markOnHandle('target', 'mismatch'),
      )
    })

    it('marks the sending end of the same connection, annotation and handle both', async () => {
      renderInNodeContext(
        <NodeFieldRow
          field={{ name: 'caption', annotation: 'string', problem: 'linked' }}
          direction="source"
          isStart={false}
          live={false}
        />,
      )

      expect(await screen.findByTestId('field-annotation-problem')).toHaveTextContent('string')
      expect(screen.getByTestId('field-handle-source-caption')).toHaveClass(
        ...markOnHandle('source', 'linked'),
      )
    })

    /**
     * `no source` is the one label `3D` prints that the wire can justify: `graph/validate.ts` sets
     * `to` and no `from` on an unconnected required input, and the document confirms the port has
     * nothing feeding it. The artboard's other label — `string ≠ Buffer` — has no such backing, so
     * the mismatching port above keeps its own declared type and is marked by hue alone.
     */
    it('prints `no source` where the port has none, on a handle of its own', async () => {
      renderInNodeContext(
        <NodeFieldRow
          field={{ name: 'caption', annotation: 'no source', problem: 'unsourced' }}
          direction="target"
          isStart={false}
          live={false}
        />,
      )

      expect(await screen.findByTestId('field-annotation-problem')).toHaveTextContent('no source')
      const handle = screen.getByTestId('field-handle-target-caption')
      expect(handle).toHaveClass(...markOnHandle('target', 'unsourced'))
      // The whole distinction the artboard draws between a bad source and no source at all.
      expect(handle).not.toHaveClass(...markOnHandle('target', 'mismatch'))
    })

    it('leaves an unmarked port on the plain annotation, so only what is wrong is marked', async () => {
      renderInNodeContext(
        <NodeFieldRow
          field={{ name: 'url', annotation: 'string' }}
          direction="source"
          isStart={false}
          live={false}
        />,
      )

      await screen.findByTestId('field-row-source-url')
      expect(screen.queryByTestId('field-annotation-problem')).toBeNull()
    })
  })

  it('renders a source handle for an output row', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'title', annotation: 'string' }}
        direction="source"
        isStart
        live
      />,
    )
    expect(await screen.findByTestId('field-handle-source-title')).toBeInTheDocument()
  })

  it('renders a target handle for an input row', async () => {
    renderInNodeContext(
      <NodeFieldRow
        field={{ name: 'image', annotation: 'Buffer' }}
        direction="target"
        isStart={false}
        live={false}
      />,
    )
    expect(await screen.findByTestId('field-handle-target-image')).toBeInTheDocument()
  })
})
