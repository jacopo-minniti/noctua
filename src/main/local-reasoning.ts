import type { ReasoningEffort } from '../shared/types'

const efforts: ReasoningEffort[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
export interface LocalReasoning {
  reasoning: boolean
  thinkingLevelMap: Record<ReasoningEffort, string | null>
  labels: Partial<Record<ReasoningEffort, string>>
}

// Ollama's OpenAI endpoint accepts exact named efforts; 'none' disables thinking.
export function ollamaReasoning(raw: unknown): LocalReasoning | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as { capabilities?: unknown; thinking?: { values?: unknown } }
  let values = data.thinking?.values
  if (!Array.isArray(values)) {
    if (!Array.isArray(data.capabilities)) return null
    values = data.capabilities.includes('thinking') ? [false, true] : [false]
  }
  const map = Object.fromEntries(
    efforts.map((effort) => [effort, null])
  ) as LocalReasoning['thinkingLevelMap']
  const labels: LocalReasoning['labels'] = {}
  for (const value of values as unknown[]) {
    if (value === false) map.off = 'none'
    else if (value === true) {
      map.medium = 'medium'
      labels.medium = 'Thinking on'
    } else if (
      typeof value === 'string' &&
      efforts.includes(value as ReasoningEffort) &&
      value !== 'off'
    )
      map[value as ReasoningEffort] = value
  }
  const reasoning = efforts.some((effort) => effort !== 'off' && map[effort] !== null)
  return { reasoning, thinkingLevelMap: map, labels }
}

export async function discoverLocalReasoning(
  baseUrl: string,
  ids: string[],
  cached: Record<string, LocalReasoning>,
  scan: boolean
): Promise<Record<string, LocalReasoning>> {
  const result = { ...cached }
  const pending = ids.filter((id) => scan || !result[id]).slice(0, 64)
  if (!pending.length) return result
  const deadline = AbortSignal.timeout(4000)
  // Other OpenAI-compatible servers keep their default behavior; never infer effort from a name.
  const origin = new URL(baseUrl).origin
  try {
    const response = await fetch(`${origin}/api/version`, { signal: deadline })
    const version = (await response.json()) as { version?: unknown }
    if (!response.ok || typeof version.version !== 'string') return result
  } catch {
    return result
  }
  for (let index = 0; index < pending.length && !deadline.aborted; index += 4) {
    await Promise.all(
      pending.slice(index, index + 4).map(async (id) => {
        try {
          const response = await fetch(`${origin}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: id }),
            signal: deadline
          })
          if (!response.ok) return
          const capability = ollamaReasoning(await response.json())
          if (capability) result[id] = capability
        } catch {
          /* Keep last known capabilities when the local server is unavailable. */
        }
      })
    )
  }
  return result
}
