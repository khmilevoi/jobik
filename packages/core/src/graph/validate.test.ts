import { describe, expect, it } from 'vitest'
import { ConnectionError } from '../errors.js'
import {
  branchDocument,
  branchFlow,
  errorOrThrow,
  flowDocument,
  okOrThrow,
  pairFlow,
  publicationDocument,
  publicationFlow,
  render,
} from './fixtures.js'
import { validateFlowGraph } from './validate.js'

describe('validateFlowGraph() — the value it builds', () => {
  it('builds a node per attached definition, in topological order', () => {
    const graph = okOrThrow(
      validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
    )
    expect(graph.flowName).toBe('publication')
    expect(graph.order).toEqual(['start1', 'render', 'publish'])
    expect(graph.startIds).toEqual(['start1'])
    expect([...graph.nodes.keys()]).toEqual(['start1', 'render', 'publish'])
    expect(graph.nodes.get('render')?.definition).toBe(render)
  })

  it('records each incoming connection against the field it feeds', () => {
    const graph = okOrThrow(
      validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
    )
    expect(graph.nodes.get('render')?.inputs).toEqual([
      { field: 'markdown', from: { node: 'start1', field: 'markdown' } },
    ])
    expect(graph.nodes.get('start1')?.inputs).toEqual([])
  })

  it('records dependencies and dependents in both directions', () => {
    const graph = okOrThrow(validateFlowGraph({ flow: branchFlow, document: branchDocument() }))
    expect(graph.order).toEqual(['s1', 's2', 'a', 'c', 'b', 'd'])
    expect(graph.startIds).toEqual(['s1', 's2'])
    expect(graph.nodes.get('a')?.dependents).toEqual(['b', 'd'])
    expect(graph.nodes.get('d')?.dependencies).toEqual(['a', 'c'])
    expect(graph.nodes.get('d')?.inputs).toEqual([
      { field: 'left', from: { node: 'a', field: 'value' } },
      { field: 'right', from: { node: 'c', field: 'value' } },
    ])
  })

  it('carries each node its own literals and never gives a start any', () => {
    const graph = okOrThrow(
      validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
    )
    expect(graph.nodes.get('publish')?.literals).toEqual({ channel: 'blog' })
    expect(graph.nodes.get('render')?.literals).toEqual({})
    expect(graph.nodes.get('start1')?.literals).toEqual({})
  })

  it('does not alias the document, so a later edit cannot reach into the graph', () => {
    const document = publicationDocument()
    const graph = okOrThrow(validateFlowGraph({ flow: publicationFlow, document }))
    document.literals.publish.channel = 'newsletter'
    expect(graph.nodes.get('publish')?.literals).toEqual({ channel: 'blog' })
  })

  it('ignores layout entirely, including a stale entry for a node that is gone', () => {
    const document = publicationDocument()
    document.layout.ghost = { x: 0, y: 0 }
    expect(validateFlowGraph({ flow: publicationFlow, document })).not.toBeInstanceOf(Error)
  })
})

describe('validateFlowGraph() — connection endpoints', () => {
  it('rejects a connection whose source node is not in the flow', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'ghost', field: 'x' }, to: { node: 'render', field: 'markdown' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("connection source node 'ghost' does not exist")
    expect(error.message).toBe(
      "The flow graph is invalid: connection source node 'ghost' does not exist",
    )
    expect(error.from).toEqual({ node: 'ghost', field: 'x' })
    expect(error.to).toEqual({ node: 'render', field: 'markdown' })
  })

  it('rejects a connection whose target node is not in the flow', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'ghost', field: 'x' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("connection target node 'ghost' does not exist")
  })

  it('rejects a connection into a start, whose input comes from run()', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'render', field: 'caption' }, to: { node: 'start1', field: 'title' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe(
      "node 'start1' is a start: its input comes from run(startId, input), not from a connection",
    )
  })

  it('rejects a source field the producing node does not output', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'render', field: 'markdown' }, to: { node: 'publish', field: 'caption' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("node 'render' has no output field 'markdown'")
  })

  it("reads a start's own input fields as its output fields", () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'title' }, to: { node: 'publish', field: 'caption' } },
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
      ],
      literals: { publish: { channel: 'blog' } },
    })
    expect(validateFlowGraph({ flow: publicationFlow, document })).not.toBeInstanceOf(Error)
  })

  it('rejects a target field the consuming node does not accept', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'nope' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("node 'render' has no input field 'nope'")
  })
})

describe('validateFlowGraph() — cycles', () => {
  it('rejects a two-node cycle and reports the closed path', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'a', field: 'value' }, to: { node: 'b', field: 'value' } },
        { from: { node: 'b', field: 'value' }, to: { node: 'a', field: 'value' } },
      ],
    })
    const error = errorOrThrow(validateFlowGraph({ flow: pairFlow, document }), ConnectionError)
    expect(error.reason).toBe('the graph contains a cycle: a -> b -> a')
    expect(error.cycle).toEqual(['a', 'b', 'a'])
    expect(error.from).toBeNull()
    expect(error.to).toBeNull()
  })

  it('rejects a node connected to itself', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'a', field: 'value' }, to: { node: 'a', field: 'value' } },
        { from: { node: 'a', field: 'value' }, to: { node: 'b', field: 'value' } },
      ],
    })
    const error = errorOrThrow(validateFlowGraph({ flow: pairFlow, document }), ConnectionError)
    expect(error.cycle).toEqual(['a', 'a'])
  })
})

describe('validateFlowGraph() — field types', () => {
  it('rejects a string feeding a number', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'width' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("cannot connect string 'start1.title' to number 'render.width'")
    expect(error.from).toEqual({ node: 'start1', field: 'title' })
    expect(error.to).toEqual({ node: 'render', field: 'width' })
  })

  it('rejects binary output feeding a text input', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'render', field: 'image' }, to: { node: 'publish', field: 'caption' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("cannot connect asset 'render.image' to string 'publish.caption'")
  })

  it('accepts a required string feeding an optional string, and never guesses beyond kind', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
        { from: { node: 'render', field: 'caption' }, to: { node: 'publish', field: 'caption' } },
      ],
      literals: { publish: { channel: 'blog' } },
    })
    expect(validateFlowGraph({ flow: publicationFlow, document })).not.toBeInstanceOf(Error)
  })
})

describe('validateFlowGraph() — one connection per input field', () => {
  it('rejects a second connection into a field that already has one', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
        { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'markdown' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("input field 'render.markdown' already has an incoming connection")
    expect(error.from).toEqual({ node: 'start1', field: 'title' })
  })

  it('allows one output field to feed several different input fields', () => {
    const result = validateFlowGraph({ flow: branchFlow, document: branchDocument() })
    expect(result).not.toBeInstanceOf(Error)
  })
})

describe('validateFlowGraph() — literals', () => {
  it('rejects a required input that is neither connected nor given a literal', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
        { from: { node: 'render', field: 'caption' }, to: { node: 'publish', field: 'caption' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe(
      "required input field 'publish.channel' is neither connected nor given a literal",
    )
    expect(error.to).toEqual({ node: 'publish', field: 'channel' })
    expect(error.from).toBeNull()
  })

  it('lets an optional input stay unconnected with no literal', () => {
    const graph = okOrThrow(
      validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
    )
    expect(graph.nodes.get('render')?.literals).toEqual({})
  })

  it('treats a missing literals entry as an empty one', () => {
    const document = publicationDocument()
    document.literals = { publish: { channel: 'blog' } }
    expect(validateFlowGraph({ flow: publicationFlow, document })).not.toBeInstanceOf(Error)
  })

  it('rejects a literal for a field that is already connected', () => {
    const document = publicationDocument()
    document.literals = { render: { markdown: 'inline' }, publish: { channel: 'blog' } }
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe(
      "input field 'render.markdown' is connected, so it cannot also take a literal",
    )
    expect(error.to).toEqual({ node: 'render', field: 'markdown' })
  })

  it('rejects a literal for a field the node does not accept', () => {
    const document = publicationDocument()
    document.literals = { publish: { channel: 'blog', nope: 1 } }
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe(
      "node 'publish' has no input field 'nope', so it cannot take a literal for it",
    )
  })

  it('rejects literals on a start, whose input comes from run()', () => {
    const document = publicationDocument()
    document.literals = { start1: { title: 'x' }, publish: { channel: 'blog' } }
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe(
      "node 'start1' is a start: its input comes from run(startId, input), so it takes no literals",
    )
    expect(error.to).toBeNull()
  })

  it('rejects literals for a node that is not in the flow', () => {
    const document = publicationDocument()
    document.literals = { ghost: {}, publish: { channel: 'blog' } }
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe("literals reference node 'ghost', which does not exist")
  })

  it('reports a cycle before it reports a missing literal', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'a', field: 'value' }, to: { node: 'b', field: 'value' } },
        { from: { node: 'b', field: 'value' }, to: { node: 'a', field: 'value' } },
      ],
    })
    const error = errorOrThrow(validateFlowGraph({ flow: pairFlow, document }), ConnectionError)
    expect(error.cycle).toEqual(['a', 'b', 'a'])
  })

  it('reports the cycle even when a required literal is also missing', () => {
    const document = flowDocument({
      connections: [
        { from: { node: 'render', field: 'caption' }, to: { node: 'render', field: 'markdown' } },
      ],
    })
    const error = errorOrThrow(
      validateFlowGraph({ flow: publicationFlow, document }),
      ConnectionError,
    )
    expect(error.reason).toBe('the graph contains a cycle: render -> render')
    expect(error.cycle).toEqual(['render', 'render'])
  })
})
