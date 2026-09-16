import assert from 'node:assert/strict'
import test from 'node:test'
import { getNavGroups } from '../src/lib/navigation.ts'

function flatten(role: 'admin' | 'hr' | 'employee' | null) {
  return getNavGroups(role).flatMap((group) => group.items)
}

test('admin navigation includes Dashboard, Employees, Forms, Onboarding Packages, and User Access', () => {
  const items = flatten('admin')
  const labels = items.map((item) => item.label)
  assert.deepEqual(labels, ['Dashboard', 'Employees', 'Forms', 'Onboarding Packages', 'User Access'])
  assert.deepEqual(
    items.map((item) => item.to),
    ['/', '/hr/employees', '/hr/forms', '/hr/onboarding-packages', '/admin'],
  )
})

test('admin navigation is grouped under Overview, People, and Administration', () => {
  const groups = getNavGroups('admin')
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Overview', 'People', 'Administration'],
  )
})

test('HR navigation includes Dashboard, Employees, Forms, and Onboarding Packages but not User Access', () => {
  const labels = flatten('hr').map((item) => item.label)
  assert.deepEqual(labels, ['Dashboard', 'Employees', 'Forms', 'Onboarding Packages'])
  assert.equal(labels.includes('User Access'), false)
})


test('employee navigation is dedicated Home, signed-out is Dashboard', () => {
  const empItems = flatten('employee')
  assert.deepEqual(empItems.map((item) => item.label), ['Home'])
  assert.deepEqual(empItems.map((item) => item.to), ['/employee'])

  const signedOutItems = flatten(null)
  assert.deepEqual(signedOutItems.map((item) => item.label), ['Dashboard'])
  assert.deepEqual(signedOutItems.map((item) => item.to), ['/'])
})

test('no role ever surfaces Profile or the legacy Invitations page in primary navigation', () => {
  for (const role of ['admin', 'hr', 'employee', null] as const) {
    const destinations = flatten(role).map((item) => item.to)
    assert.equal(destinations.includes('/profile'), false)
    assert.equal(destinations.includes('/hr'), false)
  }
})
