import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cardRows, parseCardCsv } from '../src/shared/card-csv'
import { Application, type Host } from '../src/main/application'
import type { Conversation, Flashcard, Review } from '../src/shared/types'
import { importMarkdownCards } from '../src/main/legacy-cards'
const host: Host = {
  chooseDirectory: async () => null,
  chooseFiles: async () => [],
  chooseExport: async () => null,
  openFile: async () => {},
  openLink: async () => {}
}
const codec = { encrypt: () => null, decrypt: (text: string) => text }
const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})
const options = { separator: ';', header: true, frontColumn: 1, backColumn: 0 }
describe('CSV flashcards', () => {
  it('preserves quoted separators, escaped quotes, multiline Markdown/math and BOM/CRLF', () => {
    expect(
      cardRows(
        '\uFEFFAnswer;Question;Ignored\r\n"**Yes**; \\alpha\nsecond line";"Say ""why""?";x\r\n\r\n',
        options
      )
    ).toEqual([{ front: 'Say "why"?', back: '**Yes**; \\alpha\nsecond line', row: 2 }])
    expect(parseCardCsv('Q\tA\rQ2\tA2', '\t')).toEqual([
      ['Q', 'A'],
      ['Q2', 'A2']
    ])
    expect(parseCardCsv('Q,A,', ',')).toEqual([['Q', 'A', '']])
  })
  it('rejects malformed quoting, invalid mappings, missing answers and oversized cards before saving', () => {
    for (const text of ['"unclosed;Q', '"A"oops;Q', 'A;Q\n;Missing'])
      expect(() => cardRows(text, { ...options, header: false })).toThrow()
    expect(() => cardRows('A;Q', { ...options, header: false, backColumn: 1 })).toThrow('different')
    expect(() => parseCardCsv('Q,A', '"')).toThrow('separator')
    expect(() => cardRows(`A;${'x'.repeat(6001)}`, { ...options, header: false })).toThrow('limit')
  })
  it('imports atomically, skips duplicates, persists schedules/provenance and retains history through batch deletion/undo', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-csv-'))
    directories.push(dir)
    let app = new Application(dir, host, () => {}, codec)
    try {
      const chat = (await app.request({ action: 'newChat' })) as Conversation
      const request = {
        action: 'importCards' as const,
        conversationId: chat.id,
        text: 'Answer;Question\nA;Q\nB;Q2\nA;Q',
        options,
        fileName: 'cards.csv',
        conceptId: null,
        skipDuplicates: true
      }
      expect(await app.request(request)).toEqual({ imported: 2, skipped: 1 })
      expect(await app.request(request)).toEqual({ imported: 0, skipped: 3 })
      expect(await app.request({ ...request, skipDuplicates: false })).toEqual({
        imported: 3,
        skipped: 0
      })
      const cards = app.snapshot().cards
      expect(cards).toHaveLength(5)
      expect(cards[0]).toMatchObject({
        origin: 'learner',
        importInfo: { fileName: 'cards.csv', row: 2 },
        scheduler: { reps: 0 }
      })
      await expect(
        app.request({ ...request, text: 'Answer;Question\nA;Good\n;Bad' })
      ).rejects.toThrow('both')
      expect(app.snapshot().cards).toHaveLength(5)
      const first = cards[0]
      await app.request({ action: 'review', cardId: first.id, rating: 3, expectedReps: 0 })
      const reviewed = app.store.get<Flashcard>('card', first.id)!
      await expect(
        app.request({ action: 'archiveCards', cardIds: [first.id, 'missing'], suspended: true })
      ).rejects.toThrow()
      expect(app.snapshot().cards).toHaveLength(5)
      const ids = cards.map((card) => card.id)
      await app.request({ action: 'archiveCards', cardIds: ids, suspended: true })
      expect(app.snapshot().cards).toHaveLength(0)
      await expect(
        app.request({ action: 'review', cardId: first.id, rating: 3, expectedReps: 1 })
      ).rejects.toThrow('available')
      expect(app.store.all<Review>('review')).toHaveLength(1)
      await app.close()
      app = new Application(dir, host, () => {}, codec)
      expect(app.snapshot().cards).toHaveLength(0)
      await app.request({ action: 'archiveCards', cardIds: ids, suspended: false })
      expect(app.store.get<Flashcard>('card', first.id)?.scheduler).toEqual(reviewed.scheduler)
      expect(app.snapshot().cards[0].importInfo).toEqual(first.importInfo)
      app.store.put('concept', { id: 'foreign', scope: 'other', archived: false })
      await expect(app.request({ ...request, conceptId: 'foreign' })).rejects.toThrow(
        'current vault'
      )
    } finally {
      await app.close()
    }
  })
  it('keeps deleted legacy vault cards inactive on reindexing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-legacy-cleanup-'))
    directories.push(dir)
    const app = new Application(dir, host, () => {}, codec)
    try {
      importMarkdownCards(
        app.store,
        app.vault.scope,
        'cards.md',
        'Question : Answer #flashcard',
        []
      )
      const id = app.snapshot().cards[0].id
      await app.request({ action: 'archiveCards', cardIds: [id], suspended: true })
      importMarkdownCards(
        app.store,
        app.vault.scope,
        'cards.md',
        'Question : Revised answer #flashcard',
        []
      )
      expect(app.snapshot().cards).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})
