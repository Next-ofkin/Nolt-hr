import assert from 'node:assert/strict'
import test from 'node:test'
import { getNavGroups } from '../src/lib/navigation.ts'

function flatten(role: 'admin' | 'hr' | 'employee' | null) {
  return getNavGroups(role).flatMap((group) => group.items)
}

test('admin navigation includes Dashboard, Employees, and User Access', () => {
  const items = flatten('admin')
  const labels = items.map((item) => item.label)
  assert.deepEqual(labels, ['Dashboard', 'Employees', 'User Access'])
  assert.deepEqual(
    items.map((item) => item.to),
    ['/', '/hr/employees', '/admin'],
  )
})

test('admin navigation is grouped under Overview, People, and Administration', () => {
  const groups = getNavGroups('admin')
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Overview', 'People', 'Administration'],
  )
})

test('HR navigation includes Dashboard and Employees but not User Access', () => {
  const labels = flatten('hr').map((item) => item.label)
  assert.deepEqual(labels, ['Dashboard', 'Employees'])
  assert.equal(labels.includes('User Access'), false)
})

test('employee and signed-out navigation is limited to Dashboard', () => {
  assert.deepEqual(flatten('employee').map((item) => item.label), ['Dashboard'])
  assert.deepEqual(flatten(null).map((item) => item.label), ['Dashboard'])
})

test('no role ever surfaces Profile or the legacy Invitations page in primary navigation', () => {
  for (const role of ['admin', 'hr', 'employee', null] as const) {
    const destinations = flatten(role).map((item) => item.to)
    assert.equal(destinations.includes('/profile'), false)
    assert.equal(destinations.includes('/hr'), false)
  }
})
