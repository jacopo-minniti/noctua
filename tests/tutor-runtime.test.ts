import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { AgentSessionEvent, ToolDefinition } from '@earendil-works/pi-coding-agent'
import type {
  Attempt,
  Conversation,
  Exercise,
  Message,
  ModelOption,
  StudyHandoff
} from '../src/shared/types'
import { Store } from '../src/main/store'
import { Vault } from '../src/main/vault'
import { Keys, PiHarness } from '../src/main/pi'

interface SessionInput {
  model: { id: string; provider: string; maxTokens?: number }
  tools: string[]
  customTools: ToolDefinition[]
}
const mock = vi.hoisted(() => ({
  sessions: [] as SessionInput[],
  prompts: [] as string[],
  completions: [] as unknown[],
  failCompletion: false,
  titleWait: null as (() => Promise<void>) | null,
  titleResponse: 'Understanding queue behavior'
}))
vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@earendil-works/pi-coding-agent')>()
  return {
    ...actual,
    createAgentSession: vi.fn(async (input: SessionInput) => {
      mock.sessions.push(input)
      let listener: ((event: AgentSessionEvent) => void) | undefined
      let aborted = false
      let onAbort: () => void = () => {}
      const abort = new Promise<void>((resolve) => {
        onAbort = resolve
      })
      return {
        session: {
          getActiveToolNames: () => input.tools,
          subscribe: (callback: (event: AgentSessionEvent) => void) => {
            listener = callback
            return () => {}
          },
          abort: async () => {
            aborted = true
            onAbort()
          },
          dispose: () => {},
          prompt: async (content: string) => {
            mock.prompts.push(content)
            if (input.model.maxTokens === 128) {
              if (mock.titleWait) await Promise.race([mock.titleWait(), abort])
              if (!aborted)
                listener?.({
                  type: 'message_end',
                  message: {
                    role: 'assistant',
                    content: [{ type: 'text', text: mock.titleResponse }],
                    stopReason: 'stop'
                  }
                } as AgentSessionEvent)
            }
            const feedback = input.customTools.find((tool) => tool.name === 'record_feedback')
            if (feedback)
              await feedback.execute(
                'test',
                { outcome: 'correct', feedback: 'Your definition is accurate.' } as never,
                undefined,
                undefined,
                {} as never
              )
            const placement = input.customTools.find((tool) => tool.name === 'record_placement')
            if (placement) {
              const parsed = JSON.parse(content) as { concepts: { id: string }[] }
              await placement.execute(
                'test',
                {
                  conceptId: parsed.concepts[0].id,
                  reason: 'Matches the retrieval target.'
                } as never,
                undefined,
                undefined,
                {} as never
              )
            }
          },
          sendCustomMessage: async (content: unknown) => {
            mock.completions.push(content)
            if (mock.failCompletion) throw new Error('Synthetic provider failure.')
          }
        }
      }
    })
  }
})

const stores: Store[] = []
const harnesses: PiHarness[] = []
const directories: string[] = []
const option = (id: string, provider: string, ready = true): ModelOption => ({
  key: `${provider}/${id}`,
  id,
  provider,
  name: id,
  ready,
  local: provider === 'noctua-local',
  contextWindow: 16384,
  reasoningEfforts: ['off']
})
async function fixture() {
  const store = new Store(':memory:')
  stores.push(store)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-pi-test-'))
  directories.push(directory)
  store.settings = {
    ...store.settings,
    modelKey: 'noctua-local/tutor',
    embeddings: { ...store.settings.embeddings, enabled: false }
  }
  store.put('conversation', {
    id: 'chat',
    title: 'Study',
    createdAt: '2026-10-04',
    updatedAt: '2026-10-04'
  })
  const vault = new Vault(store, () => {})
  vi.spyOn(vault, 'search').mockResolvedValue([])
  const pi = new PiHarness(
    store,
    vault,
    new Keys(store, { encrypt: () => null, decrypt: (value) => value }),
    directory,
    () => {}
  )
  harnesses.push(pi)
  pi.models = [
    option('tutor', 'noctua-local'),
    option('small', 'noctua-local'),
    option('reviewer', 'anthropic')
  ]
  // The tests exercise the real harness/session boundaries with synthetic model/session transports.
  ;(pi as unknown as { runtime: unknown }).runtime = {
    getModel: (provider: string, id: string) => ({
      provider,
      id,
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:1',
      reasoning: false,
      input: ['text'],
      contextWindow: 16384,
      maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    })
  }
  return { store, vault, pi }
}
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((pi) => pi.shutdown()))
  mock.sessions.length = 0
  mock.prompts.length = 0
  mock.completions.length = 0
  mock.failCompletion = false
  mock.titleWait = null
  mock.titleResponse = 'Understanding queue behavior'
  vi.restoreAllMocks()
  stores.splice(0).forEach((store) => store.close())
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})
const exercise: Exercise = {
  id: 'exercise',
  scope: 'no-vault',
  conversationId: 'chat',
  conceptId: null,
  title: 'Definition',
  prompt: 'Define a queue.',
  kind: 'knowledge',
  hints: [],
  solution: 'Waiting work.',
  criteria: ['An accurate definition'],
  sources: [],
  createdAt: '2026-10-04',
  origin: 'learner'
}
const attempt: Attempt = {
  id: 'attempt',
  exerciseId: exercise.id,
  answer: 'Waiting work.',
  assistance: 0,
  solutionSeen: false,
  at: '2026-10-04T10:00:00Z',
  feedback: null,
  outcome: 'ungraded',
  assessedBy: null
}

describe('explicit role-model routing', () => {
  it('keeps grading local by default and uses another provider only after an explicit role selection', async () => {
    const { store, pi } = await fixture()
    store.put('exercise', exercise)
    store.put('attempt', attempt)
    await pi.grade(exercise, attempt)
    expect(mock.sessions[0].model.provider).toBe('noctua-local')
    store.settings = { ...store.settings, roleModels: { evaluator: 'anthropic/reviewer' } }
    const second = { ...attempt, id: 'second' }
    store.put('attempt', second)
    await pi.grade(exercise, second)
    expect(mock.sessions[1].model.provider).toBe('anthropic')
    expect(mock.sessions.every((input) => input.tools.join(',') === 'record_feedback')).toBe(true)
  })
  it('retains an unavailable explicit role choice instead of silently falling back', async () => {
    const { store, pi } = await fixture()
    store.put('exercise', exercise)
    store.put('attempt', attempt)
    store.settings = { ...store.settings, roleModels: { evaluator: 'missing/provider' } }
    await pi.grade(exercise, attempt)
    expect(mock.sessions).toHaveLength(0)
    const saved = store.get<Attempt>('attempt', attempt.id)!
    expect(saved.outcome).toBe('ungraded')
    expect(saved.feedback).toContain('selected evaluator model is unavailable')
    expect(store.settings.roleModels?.evaluator).toBe('missing/provider')
  })
  it('gives the organizer only supplied placement candidates and its selected model', async () => {
    const { store, vault, pi } = await fixture()
    store.put('concept', {
      id: 'queue',
      scope: vault.scope,
      path: '',
      anchor: '',
      title: 'Queue',
      level: null,
      levelOrigin: null,
      archived: false,
      updatedAt: '2026-10-04'
    })
    store.settings = { ...store.settings, roleModels: { organizer: 'noctua-local/small' } }
    const placement = await pi.organize('How a queue holds waiting work.', 'chat')
    expect(placement.conceptId).toBe('queue')
    expect(mock.sessions[0].model.id).toBe('small')
    expect(mock.sessions[0].tools).toEqual(['record_placement'])
    expect(mock.prompts[0]).not.toContain('recentWork')
  })
})

describe('one-time chat continuation after actual desk completion', () => {
  it('adds a hidden Pi completion event without manufacturing a user turn or enabling another handoff', async () => {
    const { store, pi } = await fixture()
    const handoff: StudyHandoff = {
      id: 'handoff',
      conversationId: 'chat',
      kind: 'exercise',
      itemIds: [exercise.id],
      reason: 'Try the definition.',
      status: 'completed',
      createdAt: '2026-10-04T09:00:00Z',
      completedAt: '2026-10-04T10:00:00Z'
    }
    store.put('handoff', handoff)
    await pi.resumeStudy('chat', handoff)
    expect(mock.completions).toHaveLength(1)
    expect(mock.sessions[0].tools).not.toContain('focus_study')
    expect(store.all<Message>('message').filter((message) => message.role === 'user')).toHaveLength(
      0
    )
    expect(store.get<StudyHandoff>('handoff', handoff.id)?.resumedAt).toBeTruthy()
    await pi.resumeStudy('chat', handoff)
    expect(mock.completions).toHaveLength(1)
  })
  it('keeps failed continuation retryable and marks resumed only after success', async () => {
    const { store, pi } = await fixture()
    const handoff: StudyHandoff = {
      id: 'retry',
      conversationId: 'chat',
      kind: 'guide',
      itemIds: [],
      reason: 'Inspect the questions.',
      status: 'completed',
      createdAt: '2026-10-04T09:00:00Z'
    }
    store.put('handoff', handoff)
    mock.failCompletion = true
    await expect(pi.resumeStudy('chat', handoff)).rejects.toThrow('can be retried')
    expect(store.get<StudyHandoff>('handoff', handoff.id)?.resumedAt).toBeUndefined()
    expect(store.meta(`study-continuation:${handoff.id}`, false)).toBe(false)
    mock.failCompletion = false
    await pi.resumeStudy('chat', handoff)
    expect(mock.completions).toHaveLength(2)
    expect(store.get<StudyHandoff>('handoff', handoff.id)?.resumedAt).toBeTruthy()
  })
})

describe('background chat naming', () => {
  const freshChat = (store: Store) =>
    store.put('conversation', {
      id: 'chat',
      title: 'New conversation',
      createdAt: '2026-10-04',
      updatedAt: '2026-10-04'
    })
  it('uses the naming model once without blocking replies or adding tool/chat history', async () => {
    const { store, pi } = await fixture()
    freshChat(store)
    store.settings = { ...store.settings, roleModels: { chatTitle: 'noctua-local/small' } }
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.titleWait = () => gate
    await pi.send('chat', 'How does a queue hold waiting work?', [])
    expect(pi.busy).toBe(false)
    await vi.waitFor(() =>
      expect(mock.prompts.some((text) => text.includes('"firstQuestion"'))).toBe(true)
    )
    expect(store.get<Conversation>('conversation', 'chat')?.titleGeneration?.status).toBe('pending')
    const naming = mock.sessions.find((input) => input.model.maxTokens === 128)!
    expect(naming.model).toMatchObject({ id: 'small', provider: 'noctua-local' })
    expect(naming.tools).toEqual([])
    expect(naming.customTools).toEqual([])
    expect(store.all<Message>('message')).toHaveLength(2)
    release()
    await vi.waitFor(() =>
      expect(store.get<Conversation>('conversation', 'chat')).toMatchObject({
        title: 'Understanding queue behavior',
        titleOrigin: 'model',
        titleGeneration: { status: 'complete', modelKey: 'noctua-local/small' }
      })
    )
    await pi.send('chat', 'A follow-up question', [])
    expect(mock.sessions.filter((input) => input.model.maxTokens === 128)).toHaveLength(1)
    await pi.shutdown()
  })
  it('does not overwrite a manual rename or recreate a deleted chat when naming finishes', async () => {
    const { store, pi } = await fixture()
    freshChat(store)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.titleWait = () => gate
    await pi.send('chat', 'Explain a queue', [])
    await vi.waitFor(() =>
      expect(mock.prompts.some((text) => text.includes('"firstQuestion"'))).toBe(true)
    )
    store.put('conversation', {
      ...store.get<Conversation>('conversation', 'chat')!,
      title: 'My chosen name',
      titleOrigin: 'manual',
      titleGeneration: undefined
    })
    release()
    await vi.waitFor(() =>
      expect((pi as unknown as { titleJobs: Map<string, unknown> }).titleJobs.size).toBe(0)
    )
    expect(store.get<Conversation>('conversation', 'chat')?.title).toBe('My chosen name')
    freshChat(store)
    let finish: () => void = () => {}
    const nextGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    mock.titleWait = () => nextGate
    // A new independent tab has no earlier user turns.
    for (const message of store.all<Message>('message')) store.remove('message', message.id)
    await pi.send('chat', 'Another first question', [])
    await vi.waitFor(() =>
      expect(mock.prompts.some((text) => text.includes('Another first question'))).toBe(true)
    )
    // Wait until the actual naming prompt started before releasing it.
    await vi.waitFor(() =>
      expect(mock.prompts.filter((text) => text.startsWith('{"firstQuestion":'))).toHaveLength(2)
    )
    store.remove('conversation', 'chat')
    finish()
    await vi.waitFor(() =>
      expect((pi as unknown as { titleJobs: Map<string, unknown> }).titleJobs.size).toBe(0)
    )
    expect(store.get('conversation', 'chat')).toBeNull()
    await pi.shutdown()
  })
  it('keeps an unavailable naming choice and the question title without provider fallback', async () => {
    const { store, pi } = await fixture()
    freshChat(store)
    store.settings = { ...store.settings, roleModels: { chatTitle: 'missing/namer' } }
    await pi.send('chat', 'Explain a queue', [])
    await vi.waitFor(() =>
      expect(store.get<Conversation>('conversation', 'chat')).toMatchObject({
        title: 'Explain a queue',
        titleOrigin: 'question',
        titleGeneration: { status: 'failed', modelKey: 'missing/namer' }
      })
    )
    expect(mock.sessions).toHaveLength(1)
    expect(store.settings.roleModels?.chatTitle).toBe('missing/namer')
    expect(store.all<Message>('message')).toHaveLength(2)
    await pi.shutdown()
  })
  it('aborts and settles background naming before shutdown', async () => {
    const { store, pi } = await fixture()
    freshChat(store)
    mock.titleWait = () => new Promise<void>(() => {})
    await pi.send('chat', 'Explain a queue', [])
    await vi.waitFor(() =>
      expect(mock.prompts.some((text) => text.includes('"firstQuestion"'))).toBe(true)
    )
    await pi.shutdown()
    expect(store.get<Conversation>('conversation', 'chat')?.titleGeneration?.status).toBe('failed')
    expect((pi as unknown as { titleJobs: Map<string, unknown> }).titleJobs.size).toBe(0)
  })
})
