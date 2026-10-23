import { expect, it } from 'vitest'
import { normalizeChatTitle } from '../src/main/chat-titles'

it('accepts a bounded plain chat title while rejecting empty placeholder output', () => {
  expect(normalizeChatTitle('  Title: "Understanding eigenvectors"\nExtra explanation.')).toBe(
    'Understanding eigenvectors'
  )
  expect(normalizeChatTitle('## **Queue behavior**')).toBe('Queue behavior')
  expect(normalizeChatTitle('x'.repeat(500))).toHaveLength(80)
  expect(normalizeChatTitle('')).toBeNull()
  expect(normalizeChatTitle('New conversation')).toBeNull()
})
