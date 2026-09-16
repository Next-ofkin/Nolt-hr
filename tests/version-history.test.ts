import assert from 'node:assert/strict'
import test from 'node:test'
import { splitVersionsForDisplay, VISIBLE_PUBLISHED_VERSION_LIMIT } from '../src/lib/utils.ts'

interface SampleVersion {
  id: string
  state: 'draft' | 'published'
  versionNumber: number
}

function v(id: string, state: 'draft' | 'published', versionNumber: number): SampleVersion {
  return { id, state, versionNumber }
}

test('VISIBLE_PUBLISHED_VERSION_LIMIT is 3', () => {
  assert.equal(VISIBLE_PUBLISHED_VERSION_LIMIT, 3)
})

test('splitVersionsForDisplay shows everything and hides nothing when at or under the limit', () => {
  const versions = [v('p3', 'published', 3), v('p2', 'published', 2), v('p1', 'published', 1)]
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, false)

  assert.equal(hiddenCount, 0)
  assert.deepEqual(visible.map((x) => x.id), ['p3', 'p2', 'p1'])
})

test('splitVersionsForDisplay collapses published versions beyond the limit, most recent first', () => {
  const versions = [
    v('p5', 'published', 5),
    v('p4', 'published', 4),
    v('p3', 'published', 3),
    v('p2', 'published', 2),
    v('p1', 'published', 1),
  ]
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, false)

  assert.equal(hiddenCount, 2)
  assert.deepEqual(visible.map((x) => x.id), ['p5', 'p4', 'p3'])
})

test('splitVersionsForDisplay with showAll=true reveals every version', () => {
  const versions = [
    v('p5', 'published', 5),
    v('p4', 'published', 4),
    v('p3', 'published', 3),
    v('p2', 'published', 2),
    v('p1', 'published', 1),
  ]
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, true)

  assert.equal(hiddenCount, 2) // still reported, so the "show fewer" toggle knows there's something to collapse
  assert.deepEqual(visible.map((x) => x.id), ['p5', 'p4', 'p3', 'p2', 'p1'])
})

test('splitVersionsForDisplay always shows the draft, on top of (not instead of) the visible published versions', () => {
  const versions = [
    v('draft-6', 'draft', 6),
    v('p5', 'published', 5),
    v('p4', 'published', 4),
    v('p3', 'published', 3),
    v('p2', 'published', 2),
    v('p1', 'published', 1),
  ]
  const { visible, hiddenCount } = splitVersionsForDisplay(versions, false)

  assert.equal(hiddenCount, 2)
  assert.deepEqual(visible.map((x) => x.id), ['draft-6', 'p5', 'p4', 'p3'])
})

test('splitVersionsForDisplay does not depend on input order (published rows are re-sorted internally)', () => {
  const versions = [v('p1', 'published', 1), v('p3', 'published', 3), v('p2', 'published', 2)]
  const { visible } = splitVersionsForDisplay(versions, false)
  assert.deepEqual(visible.map((x) => x.id), ['p3', 'p2', 'p1'])
})
