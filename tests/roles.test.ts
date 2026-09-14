import assert from 'node:assert/strict'
import test from 'node:test'
import { ROLE_ACCESS_DESCRIPTIONS, ROLE_LABELS } from '../src/lib/roles.ts'

test('role labels and access descriptions cover exactly admin, hr, and employee', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ['admin', 'employee', 'hr'])
  assert.deepEqual(Object.keys(ROLE_ACCESS_DESCRIPTIONS).sort(), ['admin', 'employee', 'hr'])
})

test('access descriptions are non-empty, distinct copy per role', () => {
  const descriptions = Object.values(ROLE_ACCESS_DESCRIPTIONS)
  assert.equal(descriptions.every((description) => description.trim().length > 0), true)
  assert.equal(new Set(descriptions).size, descriptions.length)
})
