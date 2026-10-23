import { expect, it } from 'vitest'
import { ollamaReasoning } from '../src/main/local-reasoning'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai/compat'

it('exposes the exact Qwen effort levels and explicit off wire value', () => {
  const capability = ollamaReasoning({
    capabilities: ['thinking'],
    thinking: { values: [false, 'low', 'medium', 'xhigh'] }
  })!
  expect(capability.reasoning).toBe(true)
  expect(capability.thinkingLevelMap.off).toBe('none')
  expect(
    getSupportedThinkingLevels(
      capability as unknown as Parameters<typeof getSupportedThinkingLevels>[0]
    )
  ).toEqual(['off', 'low', 'medium', 'xhigh'])
})
it('distinguishes boolean thinking, always-on models, and unknown servers', () => {
  expect(ollamaReasoning({ capabilities: ['thinking'] })?.labels.medium).toBe('Thinking on')
  const always = ollamaReasoning({ thinking: { values: ['low', 'medium', 'high'] } })!
  expect(always.thinkingLevelMap.off).toBeNull()
  expect(ollamaReasoning({ thinking: { values: [false] } })?.reasoning).toBe(false)
  expect(ollamaReasoning({})).toBeNull()
  expect(ollamaReasoning({ thinking: { values: ['unsupported'] } })?.reasoning).toBe(false)
})
