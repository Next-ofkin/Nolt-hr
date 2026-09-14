import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveNeedsAttention, getGreeting } from '../src/lib/dashboard.ts'

test('getGreeting uses the time of day and first name when available', () => {
  assert.equal(getGreeting(new Date('2026-09-14T08:00:00'), 'Ada'), 'Good morning, Ada')
  assert.equal(getGreeting(new Date('2026-09-14T14:00:00'), 'Ada'), 'Good afternoon, Ada')
  assert.equal(getGreeting(new Date('2026-09-14T20:00:00'), 'Ada'), 'Good evening, Ada')
})

test('getGreeting falls back to a neutral variant when no name is available', () => {
  assert.equal(getGreeting(new Date('2026-09-14T08:00:00'), null), 'Good morning')
  assert.equal(getGreeting(new Date('2026-09-14T08:00:00'), '   '), 'Good morning')
  assert.equal(getGreeting(new Date('2026-09-14T08:00:00')), 'Good morning')
})

test('deriveNeedsAttention surfaces employees in Draft and HR Review', () => {
  const entries = deriveNeedsAttention({ DRAFT: 3, HR_REVIEW: 1, COMPLETED: 5 })
  assert.deepEqual(
    entries.map((entry) => entry.status),
    ['DRAFT', 'HR_REVIEW'],
  )
  assert.equal(entries[0].message, '3 employees in Draft')
  assert.equal(entries[1].message, '1 employee in HR Review')
})

test('deriveNeedsAttention is empty when nothing needs review', () => {
  assert.deepEqual(deriveNeedsAttention({}), [])
  assert.deepEqual(deriveNeedsAttention({ DRAFT: 0, HR_REVIEW: 0, COMPLETED: 10 }), [])
})
