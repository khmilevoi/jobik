import { deriveInputControls } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { POKEDEX_METRICS, POKEDEX_THEMES } from '../types.js'
import { pokedexCardInput, pokedexRosterInput } from './start.js'

/**
 * The run panel is derived, not written, so the only way to know a start is usable is to derive it.
 *
 * `deriveInputControls` returns a `json` control for anything it cannot make a native control for —
 * an object, an array, a union — and a `JobUiSchemaError` for a schema it cannot represent at all.
 * A start whose fields all come back native is a start a person can fill in; that is exactly what
 * these assertions pin, and why `roster` takes a string rather than an array of names.
 */
function controlsOf(definition: { input: Parameters<typeof deriveInputControls>[0]['input'] }) {
  const derived = deriveInputControls({ nodeId: 'start', input: definition.input })
  if (derived instanceof Error) throw derived
  return derived.fields
}

describe('pokedexCardInput', () => {
  it('is a start: a title and an input schema, and no handler', () => {
    expect(pokedexCardInput.kind).toBe('start')
    expect(pokedexCardInput.title).toBe('Card input')
    expect('run' in pokedexCardInput).toBe(false)
  })

  it('derives a native control for every field — no raw JSON editor anywhere', () => {
    expect(controlsOf(pokedexCardInput).map((field) => [field.field, field.control.kind])).toEqual([
      ['name', 'string'],
      ['shiny', 'boolean'],
      ['theme', 'enum'],
    ])
  })

  it('offers the themes as the enum`s options, so they cannot be mistyped', () => {
    const theme = controlsOf(pokedexCardInput).find((field) => field.field === 'theme')
    expect(theme?.control).toEqual({ kind: 'enum', options: [...POKEDEX_THEMES] })
    expect(theme?.default).toBe('type')
    expect(theme?.title).toBe('Card theme')
  })

  it('accepts the shape the card pipeline runs on', () => {
    expect(
      pokedexCardInput.input.safeParse({ name: 'charizard', shiny: false, theme: 'type' }).success,
    ).toBe(true)
    // `shiny` and `theme` carry defaults, so a name alone is a valid run.
    const minimal = pokedexCardInput.input.safeParse({ name: 'pikachu' })
    expect(minimal.success).toBe(true)
    if (minimal.success)
      expect(minimal.data).toEqual({ name: 'pikachu', shiny: false, theme: 'type' })
  })

  it('rejects an empty name and an unknown theme', () => {
    expect(pokedexCardInput.input.safeParse({ name: '' }).success).toBe(false)
    expect(pokedexCardInput.input.safeParse({ name: 'pikachu', theme: 'neon' }).success).toBe(false)
  })
})

describe('pokedexRosterInput', () => {
  it('is a start with the two fields the roster pipeline runs on', () => {
    expect(pokedexRosterInput.kind).toBe('start')
    expect(pokedexRosterInput.title).toBe('Roster input')
  })

  it('derives native controls, which an array of names would NOT have done', () => {
    expect(
      controlsOf(pokedexRosterInput).map((field) => [field.field, field.control.kind]),
    ).toEqual([
      ['names', 'string'],
      ['metric', 'enum'],
    ])
  })

  it('asks for the multiline area, because a roster is unreadable on one line', () => {
    const names = controlsOf(pokedexRosterInput).find((field) => field.field === 'names')
    expect(names?.control).toMatchObject({ kind: 'string', multiline: true })
    expect(names?.title).toBe('Roster')
    expect(names?.description).toContain('One pokémon per line')
  })

  it('offers the metrics as the enum`s options and defaults to attack', () => {
    const metric = controlsOf(pokedexRosterInput).find((field) => field.field === 'metric')
    expect(metric?.control).toEqual({ kind: 'enum', options: [...POKEDEX_METRICS] })
    expect(metric?.default).toBe('attack')
  })

  it('accepts a comma or newline separated roster', () => {
    expect(
      pokedexRosterInput.input.safeParse({ names: 'pikachu\nsnorlax', metric: 'speed' }).success,
    ).toBe(true)
    expect(pokedexRosterInput.input.safeParse({ names: '' }).success).toBe(false)
  })
})
