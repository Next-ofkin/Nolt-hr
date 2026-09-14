import assert from 'node:assert/strict'
import test from 'node:test'
import { isRouteAllowedForRole, ROLE_ACCESS_DESCRIPTIONS, ROLE_LABELS } from '../src/lib/roles.ts'

test('role labels and access descriptions cover exactly admin, hr, and employee', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), ['admin', 'employee', 'hr'])
  assert.deepEqual(Object.keys(ROLE_ACCESS_DESCRIPTIONS).sort(), ['admin', 'employee', 'hr'])
})

test('access descriptions are non-empty, distinct copy per role', () => {
  const descriptions = Object.values(ROLE_ACCESS_DESCRIPTIONS)
  assert.equal(descriptions.every((description) => description.trim().length > 0), true)
  assert.equal(new Set(descriptions).size, descriptions.length)
})

test('direct-route access enforces role isolation for /employee, /hr, and /admin', () => {
  // Employee Portal route is strictly for employee role only
  assert.equal(isRouteAllowedForRole('/employee', 'employee'), true)
  assert.equal(isRouteAllowedForRole('/employee', 'admin'), false)
  assert.equal(isRouteAllowedForRole('/employee', 'hr'), false)

  // Employee cannot access HR or Admin management routes
  assert.equal(isRouteAllowedForRole('/hr/employees', 'employee'), false)
  assert.equal(isRouteAllowedForRole('/admin', 'employee'), false)

  // Admin and HR access rules for operational routes
  assert.equal(isRouteAllowedForRole('/hr/employees', 'admin'), true)
  assert.equal(isRouteAllowedForRole('/hr/employees', 'hr'), true)
  assert.equal(isRouteAllowedForRole('/admin', 'admin'), true)
  assert.equal(isRouteAllowedForRole('/admin', 'hr'), false)
})
