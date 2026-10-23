import { describe, expect, it } from 'vitest'
import { locateAnswerAnnotations } from '../src/renderer/src/AnswerCanvas'

describe('answer feedback locations', () => {
  it('uses verified offsets to distinguish repeated reasoning excerpts', () => {
    const answer = 'retry safely, then retry safely'
    const result = locateAnswerAnnotations(answer, [
      {
        quote: 'retry safely',
        start: 19,
        end: 31,
        kind: 'gap',
        comment: 'Explain the idempotency condition.'
      }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].start).toBe(19)
    expect(answer.slice(result[0].start, result[0].end)).toBe('retry safely')
  })

  it('does not highlight a repeated quote when its claimed offsets do not match', () => {
    const answer = 'retry safely, then retry safely'
    expect(
      locateAnswerAnnotations(answer, [
        {
          quote: 'retry safely',
          start: 6,
          end: 18,
          kind: 'gap',
          comment: 'A condition is missing.'
        }
      ])
    ).toEqual([])
  })

  it('relocates an exact unique quote while rejecting paraphrased or absent evidence', () => {
    const answer = 'A queue smooths the arrival rate; it does not increase the API limit.'
    const result = locateAnswerAnnotations(answer, [
      {
        quote: 'does not increase the API limit',
        start: 0,
        end: 30,
        kind: 'strength',
        comment: 'Correct boundary.'
      },
      {
        quote: 'the queue increases the API limit',
        kind: 'gap',
        comment: 'This claim would be wrong.'
      },
      { quote: ' ', kind: 'question', comment: 'No evidence supplied.' }
    ])
    expect(result).toHaveLength(1)
    expect(answer.slice(result[0].start, result[0].end)).toBe('does not increase the API limit')
  })
})
