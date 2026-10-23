import { describe, expect, it } from 'vitest'
import { emptyStudyTabs, updateStudyTabs } from '../src/renderer/src/StudyTabs'

describe('movable study tabs', () => {
  it('starts at a chooser and turns it into the chosen activity', () => {
    const initial = emptyStudyTabs()
    expect(initial.tabs).toEqual([{ id: 'new-right', kind: 'new', pane: 'right' }])
    const state = updateStudyTabs(initial, {
      type: 'open',
      kind: 'cards',
      pane: 'right',
      replace: initial.right!
    })
    expect(state.tabs).toEqual([{ id: 'cards', kind: 'cards', pane: 'right' }])
    expect(state.right).toBe('cards')
  })
  it('moves an activity to main and back without changing its identity or duplicating it', () => {
    let state = updateStudyTabs(emptyStudyTabs(), {
      type: 'open',
      kind: 'exercises',
      pane: 'right',
      replace: 'new-right'
    })
    state = updateStudyTabs(state, { type: 'move', id: 'exercises', pane: 'main' })
    expect(state.main).toBe('exercises')
    expect(state.right).toBe('new-right')
    state = updateStudyTabs(state, { type: 'move', id: 'exercises', pane: 'right' })
    expect(state.main).toBeNull()
    expect(state.right).toBe('exercises')
    expect(state.tabs.filter((t) => t.kind === 'exercises')).toHaveLength(1)
  })
  it('keeps independent active tabs in each pane and chooses safe fallbacks on close', () => {
    let state = updateStudyTabs(emptyStudyTabs(), { type: 'open', kind: 'cards', pane: 'main' })
    state = updateStudyTabs(state, {
      type: 'open',
      kind: 'sources',
      pane: 'right',
      replace: 'new-right'
    })
    expect(state.main).toBe('cards')
    expect(state.right).toBe('sources')
    state = updateStudyTabs(state, { type: 'mainChat' })
    expect(state.main).toBeNull()
    expect(state.right).toBe('sources')
    state = updateStudyTabs(state, { type: 'close', id: 'sources' })
    expect(state.right).toBe('new-right')
    expect(state.tabs.some((t) => t.id === 'cards')).toBe(true)
  })
  it('focuses an existing activity in its pane, and explicit chooser selection moves it', () => {
    let state = updateStudyTabs(emptyStudyTabs(), { type: 'open', kind: 'cards', pane: 'main' })
    state = updateStudyTabs(state, { type: 'open', kind: 'cards' })
    expect(state.main).toBe('cards')
    state = updateStudyTabs(state, {
      type: 'open',
      kind: 'cards',
      pane: 'right',
      replace: 'new-right'
    })
    expect(state.main).toBeNull()
    expect(state.right).toBe('cards')
    expect(state.tabs).toHaveLength(1)
  })
  it('ignores missing drag identities and keeps choosers scoped to their panes', () => {
    const initial = emptyStudyTabs()
    expect(updateStudyTabs(initial, { type: 'move', id: 'external', pane: 'main' })).toBe(initial)
    expect(updateStudyTabs(initial, { type: 'move', id: 'new-right', pane: 'main' })).toBe(initial)
  })
})
