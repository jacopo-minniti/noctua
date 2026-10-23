import { expect, it } from 'vitest'
import { activityDetails } from '../src/main/response-work'
it('keeps activity inspectable while excluding private solutions, card answers and credentials in nested tool JSON', () => {
  const display = activityDetails({
    query: 'eigenvectors',
    cards: [{ front: 'Definition?', back: 'PRIVATE_CARD' }],
    solution: 'PRIVATE_SOLUTION',
    nested: JSON.stringify({ apiKey: 'SECRET_KEY', text: 'Visible result' })
  })
  expect(display).toContain('eigenvectors')
  expect(display).toContain('Visible result')
  for (const privateText of ['PRIVATE_CARD', 'PRIVATE_SOLUTION', 'SECRET_KEY'])
    expect(display).not.toContain(privateText)
  expect(display).toContain('[Hidden]')
  expect(activityDetails({ text: 'x'.repeat(100000) }).length).toBeLessThanOrEqual(16000)
})
