import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Attempt, Concept, Exercise, Flashcard, Review, Source } from '../src/shared/types'
import { Store } from '../src/main/store'
import {
  cardVersion,
  learningConcepts,
  newSchedule,
  recallSummary,
  reviewCard
} from '../src/main/learning'
import {
  conceptsFromMarkdown,
  containedFile,
  hash,
  markdownChunks,
  normalizeVector,
  tagPatch,
  Vault,
  vaultScope,
  writeTag
} from '../src/main/vault'
import { parseMarkdownCards } from '../src/main/legacy-cards'
import { Keys, studyTools } from '../src/main/pi'
import { Application, type Host } from '../src/main/application'

const stores: Store[] = [],
  directories: string[] = []
function store(): Store {
  const value = new Store(':memory:')
  stores.push(value)
  return value
}
async function temporary(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-test-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  vi.unstubAllGlobals()
  stores.splice(0).forEach((store) => {
    try {
      store.close()
    } catch {
      /* Already closed for persistence checks. */
    }
  })
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})
function card(id: string, conceptId = 'concept'): Flashcard {
  return {
    id,
    scope: 'scope',
    conversationId: 'chat',
    conceptId,
    front: `Question ${id}`,
    back: `Answer ${id}`,
    sources: [],
    scheduler: newSchedule(new Date('2026-10-01T12:00:00Z')),
    origin: 'learner',
    createdAt: '2026-10-01T12:00:00Z',
    suspended: false,
    contentVersion: cardVersion(`Question ${id}`, `Answer ${id}`)
  }
}
function concept(): Concept {
  return {
    id: 'concept',
    scope: 'scope',
    path: 'Eigenvectors.md',
    title: 'Eigenvectors',
    anchor: '',
    level: null,
    levelOrigin: null,
    updatedAt: '2026-10-01',
    archived: false
  }
}

describe('durable learning state', () => {
  it('persists independent records and rolls back an incomplete transaction', async () => {
    const directory = await temporary(),
      file = path.join(directory, 'state.sqlite')
    const first = new Store(file)
    stores.push(first)
    first.put('card', card('one'))
    expect(() =>
      first.transaction(() => {
        first.put('card', card('two'))
        throw new Error('interrupted')
      })
    ).toThrow('interrupted')
    first.close()
    const second = new Store(file)
    stores.push(second)
    expect(second.all<Flashcard>('card').map((card) => card.id)).toEqual(['one'])
  })
  it('schedules real FSRS transitions, logs reviews, and rejects a duplicate rating', () => {
    const data = store()
    data.put('card', card('one'))
    const event = reviewCard(data, 'one', 3, 0, new Date('2026-10-01T12:00:00Z'))
    expect(event.after.reps).toBe(1)
    expect(event.after.stability).toBeGreaterThan(0)
    expect(new Date(event.after.due).getTime()).toBeGreaterThanOrEqual(new Date(event.at).getTime())
    expect(event.schedulerVersion).toContain('ts-fsrs@5.4.2')
    expect(data.all<Review>('review')).toHaveLength(1)
    expect(() => reviewCard(data, 'one', 3, 0)).toThrow('already recorded')
    const again = reviewCard(data, 'one', 1, 1, new Date('2026-10-02T12:00:00Z'))
    expect(again.after.reps).toBe(2)
    expect(again.after.stability).toBeLessThan(event.after.stability)
  })
  it('keeps untested distinct from unknown and never promotes a concept from flashcards alone', () => {
    const data = store()
    data.put('concept', concept())
    expect(learningConcepts(data, 'scope')[0].level).toBeNull()
    for (const id of ['one', 'two', 'three']) {
      data.put('card', card(id))
      reviewCard(data, id, 3, 0, new Date('2026-10-01T12:00:00Z'))
      reviewCard(data, id, 3, 1, new Date('2026-10-03T12:00:00Z'))
    }
    const summary = learningConcepts(data, 'scope', new Date('2026-10-03T12:01:00Z'))[0]
    expect(summary.recall.suggestedLevel).toBe('knowledge')
    expect(summary.suggestedLevel).toBeNull()
    expect(summary.level).toBeNull()
    data.put('concept', { ...concept(), level: 'unknown', levelOrigin: 'learner' })
    expect(learningConcepts(data, 'scope')[0].level).toBe('unknown')
  })
  it('excludes help and repeated variants from independent task coverage', () => {
    const data = store()
    data.put('concept', concept())
    for (const id of ['one', 'two', 'three']) {
      data.put('card', card(id))
      reviewCard(data, id, 3, 0, new Date('2026-10-01T12:00:00Z'))
      reviewCard(data, id, 3, 1, new Date('2026-10-03T12:00:00Z'))
    }
    const exercise = (id: string): Exercise => ({
      id,
      scope: 'scope',
      conversationId: 'chat',
      conceptId: 'concept',
      title: id,
      prompt: id,
      kind: 'comprehension',
      hints: ['hint'],
      solution: 'solution',
      criteria: ['explanation'],
      sources: [],
      createdAt: '2026-10-03',
      origin: 'model'
    })
    const attempt = (id: string, exerciseId: string, assistance: number): Attempt => ({
      id,
      exerciseId,
      answer: 'my reasoning',
      assistance,
      solutionSeen: false,
      at: '2026-10-03',
      feedback: 'correct',
      outcome: 'correct',
      assessedBy: 'model'
    })
    data.put('exercise', exercise('a'))
    data.put('exercise', exercise('b'))
    data.put('attempt', attempt('1', 'a', 0))
    data.put('attempt', attempt('2', 'a', 0))
    data.put('attempt', attempt('3', 'b', 1))
    const summary = learningConcepts(data, 'scope', new Date('2026-10-03T12:01:00Z'))[0]
    expect(summary.independentSuccesses).toBe(1)
    expect(summary.suggestedLevel).toBeNull()
    data.put('attempt', attempt('4', 'b', 0))
    expect(
      learningConcepts(data, 'scope', new Date('2026-10-03T12:01:00Z'))[0].suggestedLevel
    ).toBeNull()
  })
  it('does not reuse old review evidence after the answer changes', () => {
    const data = store()
    data.put('card', card('one'))
    reviewCard(data, 'one', 3, 0, new Date('2026-10-01T12:00:00Z'))
    const current = {
      ...card('one'),
      back: 'A corrected answer',
      contentVersion: cardVersion('Question one', 'A corrected answer')
    }
    expect(recallSummary([current], data.all('review')).reviews).toBe(0)
    expect(data.all('review')).toHaveLength(1)
  })
})

describe('vault and retrieval integrity', () => {
  it('keeps duplicate basenames, duplicate headings, and revisions distinct', () => {
    const text =
      '# Linear algebra\n\n## Eigenvectors\nAv = λv\n\n## Eigenvectors\nA second context.\n'
    const a = markdownChunks('scope', 'a/intro.md', text),
      b = markdownChunks('scope', 'b/intro.md', text)
    expect(new Set([...a, ...b].map((chunk) => chunk.id)).size).toBe(a.length + b.length)
    expect(
      a.filter((chunk) => chunk.heading === 'Eigenvectors').map((chunk) => chunk.anchor)
    ).toEqual(['Eigenvectors', 'Eigenvectors::2'])
    expect(a[0].startLine).toBe(1)
    expect(markdownChunks('scope', 'a/intro.md', `${text}Changed.`)[0].revision).not.toBe(
      a[0].revision
    )
  })
  it('imports concept tags and supports sections without inventing mastery', () => {
    expect(conceptsFromMarkdown('scope', 'note.md', '# Idea\nAn idea.')[0].level).toBeNull()
    expect(
      conceptsFromMarkdown(
        'scope',
        'note.md',
        '---\ntags: [knowledge, linear-algebra]\n---\n# Idea'
      )[0].level
    ).toBe('knowledge')
    const units = conceptsFromMarkdown(
      'scope',
      'note.md',
      '# Idea\n\n## Applications\n#application\nAn example.'
    )
    expect(units.find((unit) => unit.anchor === 'Applications')?.level).toBe('application')
  })
  it('rejects traversal and escaping symbolic links', async () => {
    const root = await temporary(),
      outside = await temporary()
    await fs.writeFile(path.join(root, 'note.md'), 'safe')
    await fs.writeFile(path.join(outside, 'secret.md'), 'outside fixture')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    await expect(containedFile(root, '../secret.md')).rejects.toThrow('outside')
    await expect(containedFile(root, 'link.md')).rejects.toThrow('outside')
    expect(await containedFile(root, 'note.md')).toBe(await fs.realpath(path.join(root, 'note.md')))
  })
  it('does not alias copied concept markers or leave competing rank tags', () => {
    const original =
      '---\ntags: [knowledge, STEM]\ncustom: keep-me\n---\n# Eigenvectors #knowledge\n\n## Meaning\nA direction.\n'
    const target = conceptsFromMarkdown('scope', 'note.md', original)[0]
    const updated = tagPatch(original, target, 'comprehension')
    expect(updated).not.toContain('#knowledge')
    expect(updated).toContain('STEM')
    expect(updated).toContain('custom: keep-me')
    expect(updated).toContain('#comprehension')
    expect(conceptsFromMarkdown('scope', 'note.md', updated)).toHaveLength(1)
    const copy = conceptsFromMarkdown('scope', 'copy.md', updated)[0]
    expect(copy.id).not.toBe(target.id)
    expect(copy.level).toBe('comprehension')
  })
  it('previews narrow tags, preserves CRLF/math/frontmatter, and refuses conflicting writes', async () => {
    const root = await temporary(),
      backups = await temporary()
    const original =
      '---\r\ntitle: My note\r\ncustom: keep-me\r\n---\r\n# Eigenvectors\r\n\r\n$$Av = \\lambda v$$\r\n'
    const target = { ...concept(), scope: vaultScope(root) }
    await fs.writeFile(path.join(root, target.path), original)
    const patch = tagPatch(original, target, 'knowledge')
    expect(patch).toContain('custom: keep-me\r\n')
    expect(patch).toContain('$$Av = \\lambda v$$\r\n')
    expect(patch).toContain('<!-- noctua:concept concept --> #knowledge')
    await fs.writeFile(path.join(root, target.path), `${original}An external edit.`)
    await expect(
      writeTag(root, { ...target, level: 'knowledge' }, hash(original), backups)
    ).rejects.toThrow('changed outside')
    expect(await fs.readFile(path.join(root, target.path), 'utf8')).toContain('An external edit.')
    const current = await fs.readFile(path.join(root, target.path), 'utf8')
    await writeTag(root, { ...target, level: 'knowledge' }, hash(current), backups)
    expect(await fs.readFile(path.join(root, target.path), 'utf8')).toContain('#knowledge')
    expect(await fs.readdir(backups)).toHaveLength(1)
  })
  it('invalidates changed/deleted cache entries while retaining learning history', async () => {
    const root = await temporary(),
      data = store()
    data.settings = {
      ...data.settings,
      vaultPath: root,
      embeddings: { ...data.settings.embeddings, enabled: false }
    }
    await fs.writeFile(
      path.join(root, 'note.md'),
      '# Eigenvectors\nAn eigenvector keeps its direction.\nQuestion : Answer #flashcard {}'
    )
    const vault = new Vault(data, () => {})
    await vault.index()
    const old = data.chunks([vault.scope])[0]
    data.put('message', {
      id: 'historical-evidence',
      conversationId: 'study-chat',
      role: 'assistant',
      text: 'A source-grounded explanation.',
      sources: [old],
      createdAt: new Date().toISOString(),
      status: 'complete'
    })
    const imported = data.all<Flashcard>('card')[0]
    reviewCard(data, imported.id, 3, 0)
    await fs.writeFile(
      path.join(root, 'note.md'),
      '# Eigenvectors\nA corrected definition.\nQuestion : Answer #flashcard {}'
    )
    await vault.index()
    expect(data.source(old.id)).toBeNull()
    expect(data.resolveSource(old.id)).toMatchObject({ ...old, historical: true })
    expect(data.all<Flashcard>('card')[0].scheduler.reps).toBe(1)
    await fs.rm(path.join(root, 'note.md'))
    await vault.index()
    expect(vault.status.documents).toBe(0)
    expect(data.all<Review>('review')).toHaveLength(1)
    expect(data.all<Concept>('concept')[0].archived).toBe(true)
    expect(data.resolveSource(old.id)?.text).toBe(old.text)
  })
  it('caches real vectors, reuses them, and scopes source searches to the active vault/chat', async () => {
    const root = await temporary(),
      data = store()
    data.settings = { ...data.settings, vaultPath: root }
    await fs.writeFile(
      path.join(root, 'algebra.md'),
      '# Eigenvectors\nAn eigenvector keeps its direction under a linear map.'
    )
    const embeddingRequests: string[][] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as { input: string[] }
        embeddingRequests.push(request.input)
        return new Response(
          JSON.stringify({ embeddings: request.input.map(() => [1, 0.5, 0.1]) }),
          { status: 200 }
        )
      })
    )
    const vault = new Vault(data, () => {})
    await vault.index()
    await vault.index()
    expect(vault.status.vectors).toBe(vault.status.chunks)
    expect(vault.status.mode).toBe('semantic')
    expect(embeddingRequests).toHaveLength(1)
    const foreign = markdownChunks(
      'attachments:other-chat',
      'private.md',
      'Eigenvectors in another chat'
    )
    data.replaceDocument(
      'attachments:other-chat',
      'private.md',
      foreign[0].revision,
      'Private',
      'markdown',
      foreign
    )
    const matches = await vault.search('a direction preserving transformation', 'current-chat')
    expect(matches[0].path).toBe('algebra.md')
    expect(matches.every((source) => source.scope === vault.scope)).toBe(true)
    expect(() => normalizeVector([0, 0])).toThrow('empty vector')
    expect(() => normalizeVector([Number.NaN])).toThrow('invalid vector')
  })
  it('labels unavailable embeddings as text retrieval rather than a semantic index', async () => {
    const root = await temporary(),
      data = store()
    data.settings = { ...data.settings, vaultPath: root }
    await fs.writeFile(path.join(root, 'note.md'), '# Momentum\nMomentum is mass times velocity.')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Ollama offline')
      })
    )
    const vault = new Vault(data, () => {})
    await vault.index()
    expect(vault.status.mode).toBe('lexical')
    expect(vault.status.vectors).toBe(0)
    expect((await vault.search('momentum', 'chat'))[0].path).toBe('note.md')
  })
  it('parses the useful legacy formats without importing unverified scheduler JSON', () => {
    const cards = parseMarkdownCards(
      'Q : A #flashcard {"stability":9999}\n\n#flashcard {} #physics\nWhy?\n---\nBecause.\n---\n\n```md\nFake : Not a card #flashcard\n```'
    )
    expect(cards.map((card) => [card.front, card.back])).toEqual([
      ['Q', 'A'],
      ['Why?', 'Because.']
    ])
  })
})

describe('Pi tools and application boundaries', () => {
  it('exposes only study tools and rejects unsupported citations before creating anything', async () => {
    const data = store(),
      vault = new Vault(data, () => {})
    const tools = studyTools(data, vault, 'chat', new Map(), () => {})
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'capture_bit',
      'connect_concepts',
      'create_exercises',
      'create_flashcards',
      'find_practice',
      'focus_study',
      'get_learning_state',
      'propose_note_change',
      'read_note',
      'read_source',
      'remember_study',
      'save_concept',
      'save_study_goal',
      'save_study_guide',
      'search_vault'
    ])
    const tool = tools.find((tool) => tool.name === 'create_flashcards')!
    await expect(
      tool.execute(
        'call',
        {
          cards: [
            { front: 'Good?', back: 'Yes' },
            { front: 'Fake?', back: 'No', sourceIds: ['invented'] }
          ]
        },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('actually retrieved')
    expect(data.all('card')).toHaveLength(0)
    await tool.execute(
      'call',
      {
        cards: [
          { front: 'Good?', back: 'Yes' },
          { front: 'Good?', back: 'Yes again' }
        ]
      },
      undefined,
      undefined,
      {} as never
    )
    expect(data.all('card')).toHaveLength(1)
    await expect(
      tool.execute(
        'call',
        { cards: [{ front: 'Cancel?', back: 'Yes' }] },
        AbortSignal.abort(),
        undefined,
        {} as never
      )
    ).rejects.toThrow('stopped')
  })
  it('does not persist plaintext keys or evaluate key commands', () => {
    const data = store(),
      keys = new Keys(data, {
        encrypt: (value) => `encrypted:${value.split('').reverse().join('')}`,
        decrypt: (value) => value.slice(10).split('').reverse().join('')
      })
    keys.put('provider', 'synthetic-secret')
    expect(JSON.stringify(data.meta('encrypted-keys', {}))).not.toContain('synthetic-secret')
    expect(keys.values().provider).toBe('synthetic-secret')
    expect(() => keys.put('provider', '!run a command')).toThrow('not a shell command')
    keys.remove('provider')
    expect(keys.values()).toEqual({})
  })
  it('retains assistance across restarts and rejects unsafe IPC inputs', async () => {
    const directory = await temporary()
    const host: Host = {
      chooseDirectory: async () => null,
      chooseFiles: async () => [],
      chooseExport: async () => null,
      openFile: async () => {},
      openLink: async () => {}
    }
    const codec = { encrypt: () => null, decrypt: (value: string) => value }
    const first = new Application(directory, host, () => {}, codec)
    const exercise: Exercise = {
      id: 'exercise',
      scope: 'unconnected',
      conversationId: 'chat',
      conceptId: null,
      title: 'Reasoning',
      prompt: 'Explain.',
      kind: 'comprehension',
      hints: ['First hint'],
      solution: 'Solution',
      criteria: ['Explain'],
      sources: [],
      createdAt: '2026-10-03',
      origin: 'model'
    }
    first.store.put('exercise', exercise)
    await first.request({ action: 'exerciseHelp', exerciseId: 'exercise', kind: 'hint' })
    await first.request({ action: 'exerciseHelp', exerciseId: 'exercise', kind: 'solution' })
    await first.close()
    const second = new Application(directory, host, () => {}, codec)
    try {
      await second.request({
        action: 'answer',
        exerciseId: 'exercise',
        answer: 'A new attempt',
        assistance: 0,
        solutionSeen: false,
        gradeWithModel: false
      })
      const attempt = second.store.all<Attempt>('attempt')[0]
      expect(attempt.assistance).toBe(1)
      expect(attempt.solutionSeen).toBe(true)
      await expect(
        second.request({ action: 'openLink', url: 'file:///etc/passwd' })
      ).rejects.toThrow()
      await expect(
        second.request({
          action: 'settings',
          settings: { ...second.store.settings, localBaseUrl: 'https://a-remote-host.example/v1' }
        })
      ).rejects.toThrow()
      await expect(
        second.request({ action: 'source', source: { id: 'invented', path: '/etc/passwd' } })
      ).rejects.toThrow('cannot be resolved')
    } finally {
      await second.close()
    }
  })
})

describe('source reader and Obsidian handoff', () => {
  it('reads full documents, keeps old citations distinct, and rejects forged paths and unsafe assets', async () => {
    const directory = await temporary()
    const vault = path.join(directory, 'Synthetic vault & α')
    await fs.mkdir(path.join(vault, 'notes'), { recursive: true })
    await fs.mkdir(path.join(vault, 'assets'))
    const text =
      '# Example\n\n' +
      Array.from(
        { length: 20 },
        (_, i) => `## Section ${i}\n\n**Explanation** ${i}. $x^2$\n\n`
      ).join('')
    const file = path.join(vault, 'notes', 'Example & α.md')
    await fs.writeFile(file, text)
    await fs.writeFile(path.join(vault, 'Other note.md'), '# Other\n\n## Target\nA linked note.')
    await fs.writeFile(path.join(vault, 'assets', 'plot.png'), Buffer.from([137, 80, 78, 71]))
    await fs.writeFile(path.join(directory, 'outside.png'), 'private fixture')
    await fs.symlink(path.join(directory, 'outside.png'), path.join(vault, 'assets', 'escape.png'))
    const openLink = vi.fn(async (_url: string) => {})
    const app = new Application(
      path.join(directory, 'profile'),
      {
        chooseDirectory: async () => vault,
        chooseFiles: async () => [],
        chooseExport: async () => null,
        openFile: async () => {},
        openLink
      },
      () => {},
      { encrypt: () => null, decrypt: (value) => value }
    )
    try {
      app.store.settings = {
        ...app.store.settings,
        embeddings: { ...app.store.settings.embeddings, enabled: false }
      }
      await app.request({ action: 'chooseVault' })
      const source = app.store
        .documentChunks(app.vault.scope, 'notes/Example & α.md')
        .find((source) => source.heading === 'Section 15')!
      const detail = (await app.request({
        action: 'sourceDocument',
        source: { ...source, path: '../../outside.png' }
      })) as import('../src/shared/types').SourceDetail
      expect(detail.document?.text).toBe(text)
      expect(detail.stale).toBe(false)
      expect(detail.document?.text).toContain('Section 19')
      await app.request({
        action: 'openOriginal',
        source: { ...source, path: '../../outside.png', heading: 'Injected' }
      })
      const uri = new URL(openLink.mock.calls[0][0])
      expect(uri.protocol).toBe('obsidian:')
      expect(uri.hostname).toBe('open')
      expect(uri.searchParams.get('path')).toBe((await fs.realpath(file)) + '#Section 15')
      expect(uri.searchParams.has('append')).toBe(false)
      expect(
        await app.request({ action: 'sourceAsset', source, reference: '../assets/plot.png' })
      ).toBe('data:image/png;base64,iVBORw==')
      for (const reference of [
        '../../outside.png',
        '../assets/escape.png',
        'https://example.com/private.png',
        'data:image/png;base64,x'
      ]) {
        await expect(app.request({ action: 'sourceAsset', source, reference })).rejects.toThrow()
      }
      const linked = (await app.request({
        action: 'sourceLink',
        source,
        reference: '../Other%20note.md#Target'
      })) as Source
      expect(linked.path).toBe('Other note.md')
      expect(linked.heading).toBe('Target')
      await expect(
        app.request({ action: 'sourceDocument', source: { id: 'invented' } })
      ).rejects.toThrow('cannot be resolved')
      await expect(
        app.request({ action: 'openLink', url: 'obsidian://new?content=write' })
      ).rejects.toThrow()
      app.store.put('message', { id: 'saved-citation', sources: [source] })
      await fs.writeFile(file, '# Updated\n\nThe current note changed.')
      await app.vault.index()
      const changed = (await app.request({
        action: 'sourceDocument',
        source
      })) as import('../src/shared/types').SourceDetail
      expect(changed.stale).toBe(true)
      expect(changed.document?.text).toContain('current note changed')
      expect(changed.source.text).toBe(source.text)
      await fs.unlink(file)
      const missing = (await app.request({
        action: 'sourceDocument',
        source
      })) as import('../src/shared/types').SourceDetail
      expect(missing.missing).toBe(true)
      expect(missing.document).toBeNull()
      expect(missing.source.text).toBe(source.text)
      const send = vi.spyOn(app.pi, 'send').mockResolvedValue(undefined)
      const markdown = '    indented code\n\n**Bold** and $x$\n\n$$y^2$$\n'
      await app.request({ action: 'send', conversationId: 'chat', text: markdown, sourceIds: [] })
      expect(send).toHaveBeenCalledWith('chat', markdown, [], undefined, undefined)
    } finally {
      await app.close()
    }
  })
})
