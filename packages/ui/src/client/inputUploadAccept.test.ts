import { expect, it } from 'vitest'
import { inputUploadAccepts } from './inputUploadAccept.js'

it.each([
  ['image/png,image/jpeg', 'photo.png', 'IMAGE/PNG', true],
  ['image/*', 'photo.jpeg', 'image/jpeg', true],
  ['.PNG', 'photo.PNG', 'application/octet-stream', true],
  ['image/png', 'photo.jpg', 'image/jpeg', false],
])('matches file acceptance %s %s %s', (accept, name, type, expected) => {
  expect(inputUploadAccepts(accept, name, type)).toBe(expected)
})
