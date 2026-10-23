import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Exercise, StudyHandoff } from '../src/shared/types'
import { Store } from '../src/main/store'
import { Vault } from '../src/main/vault'
import { StudyService } from '../src/main/study'
import { studyTools, validateCriterionFeedback } from '../src/main/pi'
import { tutorStudyContext } from '../src/main/study-tools'
import { evaluatorPrompt, organizerPrompt, tutorPrompt } from '../src/main/study-prompts'
import { normalizeWebResources, searchWeb, webSearchTools } from '../src/main/web-search'

const stores: Store[] = []
const directories: string[] = []
function fixture() {
  const store = new Store(':memory:')
  stores.push(store)
  store.settings = {
    ...store.settings,
    embeddings: { ...store.settings.embeddings, enabled: false }
  }
  for (const id of ['chat', 'other'])
    store.put('conversation', { id, title: id, createdAt: '2026-10-04', updatedAt: '2026-10-04' })
  const vault = new Vault(store, () => {})
  return { store, vault, study: new StudyService(store) }
}
afterEach(async () => {
  vi.unstubAllGlobals()
  stores.splice(0).forEach((store) => store.close())
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})
const exercise: Exercise = {
  id: 'task',
  scope: 'vault',
  conversationId: 'chat',
  conceptId: null,
  title: 'Explain',
  prompt: 'Explain your choice.',
  kind: 'comprehension',
  hints: ['PRIVATE_HINT'],
  solution: 'PRIVATE_SOLUTION',
  criteria: ['Justify the choice', 'Explain the limitation'],
  rubric: [
    { id: 'choice', title: 'Justify the choice', level: 'comprehension' },
    { id: 'limit', title: 'Explain the limitation', level: 'comprehension' }
  ],
  sources: [],
  createdAt: '2026-10-04',
  origin: 'learner'
}
function invoke(tools: ReturnType<typeof studyTools>, name: string, input: unknown) {
  return tools
    .find((tool) => tool.name === name)!
    .execute('test', input as never, undefined, undefined, {} as never)
}

describe('precise provisional exercise feedback', () => {
  it('anchors exact UTF-16 answer spans and retains unobserved criteria', () => {
    const answer = '🦉 My choice is a queue because it bounds concurrency.'
    const evidence = 'bounds concurrency'
    const feedback = validateCriterionFeedback(exercise, answer, [
      { criterionId: 'choice', outcome: 'met', feedback: 'A clear mechanism.', evidence }
    ])
    expect(feedback[0].start).toBe(answer.indexOf(evidence))
    expect(answer.slice(feedback[0].start, feedback[0].end)).toBe(evidence)
    expect(feedback[1].outcome).toBe('unobserved')
  })
  it('rejects invented criteria and mismatched answer highlights', () => {
    expect(() =>
      validateCriterionFeedback(exercise, 'abcdef', [
        { criterionId: 'invented', outcome: 'met', feedback: 'Invented evidence.' }
      ])
    ).toThrow('unknown criterion')
    expect(() =>
      validateCriterionFeedback(exercise, 'abcdef', [
        {
          criterionId: 'choice',
          outcome: 'partial',
          feedback: 'Mismatch.',
          evidence: 'wrong',
          start: 1,
          end: 4
        }
      ])
    ).toThrow('does not match')
    expect(() =>
      validateCriterionFeedback(exercise, 'abcdef', [
        { criterionId: 'choice', outcome: 'partial', feedback: 'Outside.', start: 2, end: 40 }
      ])
    ).toThrow('outside')
    expect(() =>
      validateCriterionFeedback(exercise, 'abcdef', [
        { criterionId: 'choice', outcome: 'met', feedback: 'One.' },
        { criterionId: 'choice', outcome: 'met', feedback: 'Two.' }
      ])
    ).toThrow('repeats')
  })
})

describe('connected tutor tool boundaries', () => {
  it('uses stable concepts and proposed edges without giving the model tag or write authority', async () => {
    const { store, vault } = fixture()
    const tools = studyTools(store, vault, 'chat', new Map(), () => {})
    await invoke(tools, 'save_concept', { title: 'Queues', description: 'Control waiting work.' })
    await invoke(tools, 'save_concept', { title: 'Concurrency', description: 'Work in progress.' })
    const concepts = store.all<{ id: string; level: null }>('concept')
    expect(concepts.every((concept) => concept.level === null)).toBe(true)
    await invoke(tools, 'connect_concepts', {
      fromId: concepts[0].id,
      toId: concepts[1].id,
      relation: 'applies-to',
      rationale: 'Queues can bound concurrent work.'
    })
    expect(store.all<{ status: string }>('edge')[0].status).toBe('proposed')
    const attachment = new StudyService(store).saveConcept('attachments:chat', {
      title: 'Imported paper'
    })
    await invoke(tools, 'connect_concepts', {
      fromId: attachment.id,
      toId: concepts[0].id,
      relation: 'explains',
      rationale: 'The selected paper explains queueing.'
    })
    await invoke(tools, 'connect_concepts', {
      fromId: attachment.id,
      toId: concepts[0].id,
      relation: 'explains',
      rationale: 'Same connection.'
    })
    expect(store.all('edge')).toHaveLength(2)
    const sibling = new StudyService(store).saveConcept('attachments:other', {
      title: 'Private paper'
    })
    await expect(
      invoke(tools, 'connect_concepts', {
        fromId: sibling.id,
        toId: concepts[0].id,
        relation: 'explains',
        rationale: 'Unshared paper.'
      })
    ).rejects.toThrow('outside')
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('propose_note_change')
    expect(names).toContain('focus_study')
    for (const forbidden of ['bash', 'read', 'write', 'edit', 'accept_notes', 'set_level', 'shell'])
      expect(names).not.toContain(forbidden)
  })
  it('retains current-note revision and exact proposal text without applying a write', async () => {
    const { store, vault } = fixture()
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-tutor-'))
    directories.push(root)
    const original = '# Queues\n\nMy explanation of waiting work.\n'
    await fs.writeFile(path.join(root, 'Queues.md'), original)
    store.settings = { ...store.settings, vaultPath: root }
    await vault.index()
    const source = store.chunks([vault.scope])[0]
    const tools = studyTools(store, vault, 'chat', new Map([[source.id, source]]), () => {})
    await expect(
      invoke(tools, 'propose_note_change', {
        path: source.path,
        expectedRevision: source.revision,
        operation: 'append',
        after: 'A correction.',
        rationale: 'From learner work.'
      })
    ).rejects.toThrow('Read the existing note')
    await invoke(tools, 'read_note', { sourceId: source.id })
    await invoke(tools, 'propose_note_change', {
      path: source.path,
      expectedRevision: source.revision,
      operation: 'append',
      after: 'A correction.',
      rationale: 'From learner work.'
    })
    expect(store.all<{ status: string }>('noteProposal')[0].status).toBe('pending')
    expect(await fs.readFile(path.join(root, 'Queues.md'), 'utf8')).toBe(original)
    await expect(invoke(tools, 'read_note', { sourceId: 'invented' })).rejects.toThrow(
      'actually retrieved'
    )
  })
  it('builds a first note from actual learner bits and rejects invented learner authorship', async () => {
    const { store, vault, study } = fixture()
    store.put('message', {
      id: 'learner-text',
      conversationId: 'chat',
      role: 'user',
      text: 'A queue separates incoming work from processing.',
      sources: [],
      createdAt: '2026-10-04',
      status: 'complete'
    })
    const tools = studyTools(store, vault, 'chat', new Map(), () => {})
    await expect(
      invoke(tools, 'capture_bit', { origin: 'learner', text: 'An invented complete explanation.' })
    ).rejects.toThrow('actual learner words')
    await invoke(tools, 'capture_bit', {
      origin: 'learner',
      text: 'A queue separates incoming work from processing.'
    })
    const bit = store.all<{ id: string; text: string }>('bit')[0]
    await invoke(tools, 'propose_note_change', {
      path: 'Queues.md',
      expectedRevision: '',
      operation: 'append',
      after: `# Queues\n\n${bit.text}`,
      rationale: 'Keep the learner’s explanation.',
      bitIds: [bit.id]
    })
    expect(
      store.all<{ before: string; expectedRevision: string; status: string }>('noteProposal')[0]
    ).toMatchObject({ expectedRevision: '', status: 'pending' })
    for (let index = 0; index < 30; index++)
      study.saveConcept(vault.scope, {
        title: `Detailed concept ${index}`,
        facets: Array.from({ length: 20 }, (_, facet) => ({
          id: `facet-${facet}`,
          title: `Facet ${facet}`,
          description: 'A detailed target. '.repeat(80)
        }))
      })
    const context = tutorStudyContext(store, vault, study, 'chat')
    expect(JSON.stringify(context).length).toBeLessThan(18400)
    expect(context.conceptCoverage.complete).toBe(false)
  })
  it('creates closed practice through the shared service and hides solutions from reuse/context', async () => {
    const { store, vault, study } = fixture()
    const concept = study.saveConcept(vault.scope, { title: 'Queues' })
    const tools = studyTools(store, vault, 'chat', new Map(), () => {})
    await invoke(tools, 'create_exercises', {
      exercises: [
        {
          title: 'Queue role',
          prompt: 'Which description matches a queue?',
          kind: 'knowledge',
          conceptId: concept.id,
          format: 'multiple-choice',
          choices: ['Waiting work', 'PRIVATE_WRONG_CHOICE'],
          answerKey: 'Waiting work',
          solution: 'PRIVATE_SOLUTION',
          hints: ['PRIVATE_HINT'],
          criteria: ['Identify the role'],
          taskFamily: 'queue-role',
          context: 'Basic definition',
          rubric: [
            { id: 'role', title: 'Identify the role', level: 'knowledge', conceptId: concept.id }
          ]
        }
      ]
    })
    const task = store.all<Exercise>('exercise')[0]
    expect(task.contentVersion).toBeTruthy()
    expect(task.origin).toBe('model')
    const practice = await invoke(tools, 'find_practice', { conceptId: concept.id })
    const context = tutorStudyContext(store, vault, study, 'chat', 'Queues')
    expect(JSON.stringify(practice)).not.toContain('PRIVATE_SOLUTION')
    expect(JSON.stringify(practice)).not.toContain('PRIVATE_HINT')
    expect(JSON.stringify(context)).not.toContain('PRIVATE_SOLUTION')
    expect(JSON.stringify(context)).not.toContain('PRIVATE_HINT')
  })
  it('validates activity scope and blocks another handoff during completion', async () => {
    const { store, vault, study } = fixture()
    const task = study.saveExercise(vault.scope, 'chat', {
      title: 'Explain',
      prompt: 'Explain.',
      kind: 'knowledge'
    })
    store.put('exercise', {
      ...exercise,
      id: 'private-task',
      scope: 'attachments:other',
      conversationId: 'other'
    })
    const focused: StudyHandoff[] = []
    const tools = studyTools(store, vault, 'chat', new Map(), () => {}, {
      focus: (handoff) => focused.push(handoff)
    })
    await expect(
      invoke(tools, 'focus_study', {
        kind: 'exercise',
        itemIds: ['private-task'],
        reason: 'Try this.'
      })
    ).rejects.toThrow('outside')
    await invoke(tools, 'focus_study', {
      kind: 'exercise',
      itemIds: [task.id],
      reason: 'Check the distinction.'
    })
    expect(focused).toHaveLength(1)
    expect(store.all<StudyHandoff>('handoff')[0].status).toBe('active')
    await expect(
      invoke(tools, 'focus_study', { kind: 'exercise', itemIds: [task.id], reason: 'Again.' })
    ).rejects.toThrow('already active')
    expect(
      studyTools(store, vault, 'chat', new Map(), () => {}, { allowHandoff: false }).map(
        (tool) => tool.name
      )
    ).not.toContain('focus_study')
  })
})

describe('reuse of the Pi Exa search backend', () => {
  it('normalizes bounded search evidence and filters unusable URLs', () => {
    const resources = normalizeWebResources(
      JSON.stringify({
        results: [
          { title: 'A paper', url: 'https://papers.example/paper.pdf', text: 'x'.repeat(5000) },
          { title: 'Duplicate', url: 'https://papers.example/paper.pdf', text: 'duplicate' },
          { title: 'Unsafe', url: 'file:///private/example' },
          { title: 'Private', url: 'http://127.0.0.1/' },
          { title: 'Docs', url: 'https://docs.example/reference', highlights: ['Official snippet'] }
        ]
      })
    )
    expect(resources).toHaveLength(2)
    expect(resources[0].format).toBe('pdf')
    expect(resources[0].excerpt).toHaveLength(2200)
    expect(resources[1].inspected).toBe('search-excerpt')
    expect(webSearchTools(false)).toEqual([])
  })
  it('calls the existing extension transport on a fixed endpoint without provider fallback or credentials', async () => {
    const body = JSON.stringify({
      result: {
        content: [
          {
            type: 'text',
            text: 'Title: A paper\nURL: https://papers.example/paper.pdf\nText: Search excerpt.'
          }
        ]
      }
    })
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const resources = await searchWeb('LLM orchestration', {
      pdfOnly: true,
      domains: ['arxiv.org']
    })
    expect(resources[0].url).toBe('https://papers.example/paper.pdf')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mcp.exa.ai/mcp?tools=web_search_exa')
    const payload = JSON.parse(init.body as string)
    expect(payload.params.name).toBe('web_search_exa')
    expect(payload.params.arguments.query).toContain('filetype:pdf')
    expect(payload.params.arguments.query).toContain('site:arxiv.org')
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|api-key/i)
  })
  it('cancels before dispatch and does not accept unbounded queries', async () => {
    const transport = vi.fn(async () => '')
    await expect(
      searchWeb('topic', { signal: AbortSignal.abort() }, transport)
    ).rejects.toBeTruthy()
    expect(transport).not.toHaveBeenCalled()
    await expect(searchWeb('x'.repeat(1001), {}, transport)).rejects.toBeTruthy()
  })
})

describe('study policy prompts', () => {
  it('keeps broad tag semantics, learner-selected depth, prerequisites, and authorship explicit', () => {
    expect(tutorPrompt).toContain('not a validated mastery measurement or a curriculum ladder')
    expect(tutorPrompt).toContain('Two correct answers')
    expect(tutorPrompt).toContain('prerequisite readiness')
    expect(tutorPrompt).toContain(
      'Generated prose is your contribution, never evidence that the learner understood or authored it'
    )
    expect(tutorPrompt).toContain('Do not immediately create another handoff')
    expect(evaluatorPrompt).toContain('unobserved')
    expect(organizerPrompt).toContain('null when none fits')
  })
})
