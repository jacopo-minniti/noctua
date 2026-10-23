import type { ModelOption } from './types'

/** One GPT entry per model, using the provider connection the learner already has. */
export function modelsForPicker(models: ModelOption[]): ModelOption[] {
  const isOpenAi = (model: ModelOption) => ['openai', 'openai-codex'].includes(model.provider)
  const connected = models.some((model) => isOpenAi(model) && model.ready)
  const preferred = new Map<string, ModelOption>()
  for (const model of models) {
    if (!isOpenAi(model) || !isRecentGpt(model.id) || (connected && !model.ready)) continue
    const key = model.id.toLowerCase()
    const current = preferred.get(key)
    if (
      !current ||
      (model.ready && !current.ready) ||
      (model.ready === current.ready && model.provider === 'openai')
    )
      preferred.set(key, model)
  }
  return models.filter(
    (model) => !isOpenAi(model) || preferred.get(model.id.toLowerCase()) === model
  )
}

export function isRecentGpt(id: string): boolean {
  const version = /(?:^|\/)gpt-(\d+)(?:\.(\d+))?(?=$|[-:/])/i.exec(id)
  if (!version) return false
  const major = Number(version[1])
  return major > 5 || (major === 5 && Number(version[2] || 0) >= 6)
}

export function modelFamily(model: ModelOption): string {
  const identity = `${model.id} ${model.name}`.toLowerCase()
  if (identity.includes('qwen')) return 'Qwen'
  if (/\bgpt[-\s]/.test(identity)) return 'GPT'
  if (identity.includes('claude')) return 'Claude'
  if (identity.includes('gemini')) return 'Gemini'
  if (identity.includes('llama')) return 'Llama'
  if (identity.includes('deepseek')) return 'DeepSeek'
  if (identity.includes('mistral') || identity.includes('ministral')) return 'Mistral'
  if (identity.includes('grok')) return 'Grok'
  return model.local ? 'Local' : model.provider
}
