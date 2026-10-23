import { expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { validProfilePicture, withLearnerProfile } from '../src/main/profile'

it('adds explicit learner preferences to model context without sending the photo or implying assessed knowledge', () => {
  const profile = {
    name: 'Alex',
    about: 'Learning linear algebra',
    instructions: 'Ask me to explain my reasoning',
    picture: 'private-photo'
  }
  const prompt = withLearnerProfile('Keep the existing study boundaries.', profile)
  expect(prompt).toContain('Keep the existing study boundaries.')
  expect(prompt).toContain(profile.about)
  expect(prompt).toContain(profile.instructions)
  expect(prompt).toContain('not assessed learning evidence')
  expect(prompt).not.toContain(profile.picture)
  expect(withLearnerProfile('base')).toBe('base')
})

it('rejects remote URLs, SVG content, MIME mismatches and oversized avatar payloads', () => {
  expect(validProfilePicture('https://example.com/avatar.png')).toBe(false)
  expect(validProfilePicture('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
  expect(
    validProfilePicture('data:image/png;base64,' + Buffer.from('<svg/>').toString('base64'))
  ).toBe(false)
  expect(
    validProfilePicture('data:image/png;base64,' + Buffer.alloc(300000).toString('base64'))
  ).toBe(false)
})

it('keeps untouched chats out of durable records, retains used tab ancestors and restores temporary state on rollback', () => {
  const store = new Store(':memory:')
  try {
    const chat = { id: 'root', title: 'New conversation', createdAt: 'now', updatedAt: 'now' }
    store.stageConversation(chat)
    store.stageConversation({ ...chat, id: 'child', parentId: chat.id })
    expect(
      store.db.prepare("SELECT COUNT(*) AS total FROM records WHERE kind='conversation'").get()
        ?.total
    ).toBe(0)
    expect(() =>
      store.transaction(() => {
        store.put('message', { id: 'failed', conversationId: 'child' })
        throw new Error('rollback')
      })
    ).toThrow('rollback')
    expect(store.get<{ temporary: boolean }>('conversation', chat.id)?.temporary).toBe(true)
    store.put('message', { id: 'message', conversationId: 'child' })
    store.releaseEmptyConversation(chat.id)
    expect(store.get<{ temporary?: boolean }>('conversation', chat.id)?.temporary).toBeUndefined()
    expect(
      store.db.prepare("SELECT COUNT(*) AS total FROM records WHERE kind='conversation'").get()
        ?.total
    ).toBe(2)
  } finally {
    store.close()
  }
})
