import { describe, expect, it } from 'vitest'
import { isRecentGpt, modelFamily, modelsForPicker } from '../src/shared/model-picker'
import type { ModelOption } from '../src/shared/types'

describe('model picker identity', () => {
  it('uses numeric GPT versions rather than names or lexical ordering', () => {
    for (const id of ['gpt-5.6', 'gpt-5.6-codex', 'gpt-5.10', 'gpt-6', 'gpt-6.1', 'gpt-10'])
      expect(isRecentGpt(id), id).toBe(true)
    for (const id of ['gpt-5', 'gpt-5.5', 'gpt-4.1', 'o3', 'gpt-56unknown', 'gpt-5.6unknown'])
      expect(isRecentGpt(id), id).toBe(false)
  })
  it('groups variants across providers and retains other model families', () => {
    const option = (id: string, provider = 'noctua-local') =>
      ({ id, name: id, provider, local: provider === 'noctua-local' }) as ModelOption
    expect(modelFamily(option('qwen3:8b'))).toBe('Qwen')
    expect(modelFamily(option('qwen/qwen3.5', 'openrouter'))).toBe('Qwen')
    expect(modelFamily(option('gpt-6.1', 'openai'))).toBe('GPT')
    expect(modelFamily(option('claude-sonnet', 'anthropic'))).toBe('Claude')
    expect(modelFamily(option('synthetic-test'))).toBe('Local')
  })
  it('makes the full connected GPT catalog selectable without unconnected legacy duplicates', () => {
    const model = (id: string, provider: string, ready: boolean) =>
      ({ id, provider, ready, key: `${provider}/${id}` }) as ModelOption
    const api = [
      model('gpt-6-sol', 'openai', true),
      model('gpt-6-luna', 'openai', true),
      model('gpt-5.6', 'openai', true)
    ]
    const legacy = [
      model('gpt-6-sol', 'openai-codex', false),
      model('gpt-6-codex', 'openai-codex', false)
    ]
    expect(modelsForPicker([...api, ...legacy])).toEqual(api)
    expect(
      modelsForPicker([
        ...api.map((entry) => ({ ...entry, ready: false })),
        ...legacy.map((entry) => ({ ...entry, ready: true }))
      ])
    ).toEqual(legacy.map((entry) => ({ ...entry, ready: true })))
    expect(
      modelsForPicker([...api, ...legacy.map((entry) => ({ ...entry, ready: true }))]).filter(
        (entry) => entry.id === 'gpt-6-sol'
      )
    ).toEqual([api[0]])
    expect(
      modelsForPicker([...api.map((entry) => ({ ...entry, ready: false })), ...legacy]).filter(
        (entry) => entry.id === 'gpt-6-sol'
      )
    ).toHaveLength(1)
  })
})
