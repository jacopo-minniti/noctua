import type { Flashcard, Source } from '../shared/types'
import { Store } from './store'
import { cardVersion, newSchedule } from './learning'
import { hash } from './vault'

export function parseMarkdownCards(text: string): { front: string; back: string; line: number }[] {
  const lines = text.split(/\r?\n/)
  const cards: { front: string; back: string; line: number }[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const inline = lines[i].match(/^\s*(.+?)\s+:\s+(.+?)\s+#flashcard\b/)
    if (inline) {
      cards.push({ front: inline[1].trim(), back: inline[2].trim(), line: i + 1 })
      continue
    }
    if (!/^\s*#flashcard\b/.test(lines[i])) continue
    const line = i + 1
    const front: string[] = [],
      back: string[] = []
    i++
    while (i < lines.length && !/^---\s*$/.test(lines[i]) && !/^#flashcard\b/.test(lines[i]))
      front.push(lines[i++])
    if (!/^---\s*$/.test(lines[i] || '')) {
      i--
      continue
    }
    i++
    while (i < lines.length && !/^---\s*$/.test(lines[i]) && !/^#flashcard\b/.test(lines[i]))
      back.push(lines[i++])
    if (front.join('\n').trim() && back.join('\n').trim())
      cards.push({ front: front.join('\n').trim(), back: back.join('\n').trim(), line })
  }
  return cards
}

export function importMarkdownCards(
  store: Store,
  scope: string,
  relative: string,
  text: string,
  chunks: Source[]
): void {
  const present = new Set<string>()
  for (const parsed of parseMarkdownCards(text)) {
    const source =
      chunks.find((chunk) => chunk.startLine! <= parsed.line && chunk.endLine! >= parsed.line) ||
      chunks[0]
    const concepts = store
      .all<{ id: string; path: string; scope: string; anchor: string }>('concept')
      .filter((concept) => concept.scope === scope && concept.path === relative)
    const conceptId =
      concepts.find((concept) => concept.anchor === (source?.anchor ?? source?.heading))?.id ||
      concepts.find((concept) => !concept.anchor)?.id ||
      null
    const id = hash(`${scope}\0${relative}\0flashcard\0${parsed.front.toLowerCase()}`).slice(0, 32)
    present.add(id)
    const old = store.get<Flashcard>('card', id)
    if (old && old.back !== parsed.back) {
      // Keep the old definition and reviews; changed material starts a fresh recall schedule.
      store.put('cardRevision', { id: `${id}:${Date.now()}`, before: old })
    }
    store.put<Flashcard>('card', {
      id,
      scope,
      conversationId: '',
      conceptId,
      front: parsed.front,
      back: parsed.back,
      sources: source ? [source] : [],
      scheduler: old?.back === parsed.back ? old.scheduler : newSchedule(),
      createdAt: old?.createdAt || new Date().toISOString(),
      origin: 'vault',
      suspended: old?.suspended || false,
      contentVersion: cardVersion(parsed.front, parsed.back)
    })
  }
  for (const card of store.all<Flashcard>('card')) {
    if (
      card.origin === 'vault' &&
      card.scope === scope &&
      card.sources.some((source) => source.path === relative) &&
      !present.has(card.id)
    ) {
      store.put('card', { ...card, suspended: true })
    }
  }
}
