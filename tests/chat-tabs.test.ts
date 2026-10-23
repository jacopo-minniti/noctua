import { afterEach, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Application, type Host } from '../src/main/application'
import { resolveChatReferences } from '../src/main/chat-context'
import type { ChatReference, Conversation, Source } from '../src/shared/types'
const directories: string[] = []
const host: Host = {
  chooseDirectory: async () => null,
  chooseFiles: async () => [],
  chooseExport: async () => null,
  openFile: async () => {},
  openLink: async () => {}
}
const codec = { encrypt: () => null, decrypt: (text: string) => text }
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})
it('preserves sibling tabs and explicit source snapshots across cache replacement and restart; rejects unrelated context', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-tabs-'))
  directories.push(directory)
  let app = new Application(directory, host, () => {}, codec)
  try {
    const root = (await app.request({ action: 'newChat' })) as Conversation
    const tab = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    const sibling = (await app.request({ action: 'newChat', parentId: tab.id })) as Conversation
    const other = (await app.request({ action: 'newChat' })) as Conversation
    expect(sibling.parentId).toBe(root.id)
    const source: Source = {
      id: 'source',
      scope: `attachments:${root.id}`,
      path: 'book.pdf',
      title: 'Book',
      kind: 'pdf',
      revision: 'original',
      heading: '',
      page: 2,
      text: 'A preserved passage.'
    }
    app.store.replaceDocument(
      source.scope,
      source.path,
      source.revision,
      source.title,
      source.kind,
      [source]
    )
    const selected: ChatReference = {
      id: 'quote',
      sourceId: source.id,
      label: 'forged title',
      text: 'preserved passage',
      page: 2,
      revision: 'original'
    }
    await expect(
      app.request({ action: 'addChatReference', conversationId: other.id, reference: selected })
    ).rejects.toThrow('unavailable')
    const quote = (await app.request({
      action: 'addChatReference',
      conversationId: tab.id,
      reference: selected
    })) as ChatReference
    expect(quote.label).toBe('Book · page 2')
    expect(quote.source?.revision).toBe('original')
    app.store.replaceDocument(source.scope, source.path, 'edited', source.title, source.kind, [])
    await app.request({
      action: 'updateTab',
      conversationId: tab.id,
      closed: true,
      title: 'Derivation'
    })
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(app.snapshot().conversations.find((chat) => chat.id === tab.id)).toMatchObject({
      parentId: root.id,
      closed: true,
      title: 'Derivation'
    })
    expect(app.store.resolveSource(source.id)).toMatchObject({
      revision: 'original',
      historical: true
    })
    expect(
      resolveChatReferences(app.store, tab, app.vault.scope, [
        { ...selected, text: 'forged replacement' }
      ])[0].text
    ).toBe('preserved passage')
    expect(() => resolveChatReferences(app.store, sibling, app.vault.scope, [selected])).toThrow(
      'another tab'
    )
    await app.request({ action: 'updateTab', conversationId: tab.id, closed: false })
    app.store.put('message', {
      id: 'tab-message',
      conversationId: tab.id,
      text: 'Private tab context'
    })
    expect(await app.request({ action: 'messages', conversationId: root.id })).toEqual([])
    expect(await app.request({ action: 'messages', conversationId: tab.id })).toHaveLength(1)
    await app.request({ action: 'deleteChat', conversationId: root.id })
    expect(app.snapshot().conversations.map((chat) => chat.id)).toEqual([])
    expect(await app.request({ action: 'messages', conversationId: tab.id })).toEqual([])
  } finally {
    await app.close()
  }
})

it('keeps surrounding source text separate from the quote and respects displayed revision/page and repeated passages', async () => {
  const { enrichReferenceContext, contextWindow } = await import('../src/main/chat-context')
  const source: Source = {
    id: 'source',
    scope: 'vault',
    title: 'Mechanics',
    path: 'note.md',
    kind: 'markdown',
    heading: 'Old heading',
    revision: 'old',
    text: 'Old saved explanation.',
    startLine: 1
  }
  const document = {
    revision: 'new',
    text: '# Mechanics\n\nA prerequisite definition.\n\nThe highlighted **relation** is useful.\n\nA following limitation.'
  }
  const reference: ChatReference = {
    id: 'quote',
    label: 'Mechanics',
    sourceId: source.id,
    source,
    revision: 'new',
    view: 'document',
    text: 'The highlighted relation is useful.',
    sourceLine: 5
  }
  const enriched = enrichReferenceContext(reference, document)
  expect(enriched.text).toBe(reference.text)
  expect(enriched.context).toMatchObject({
    revision: 'new',
    kind: 'surrounding',
    heading: 'Mechanics',
    matched: true
  })
  expect(enriched.context?.text).toContain('prerequisite definition')
  expect(enriched.context?.text).toContain('following limitation')
  expect(enriched.context?.note).toContain('older indexed')
  const changed = enrichReferenceContext(reference, { ...document, revision: 'changed-again' })
  expect(changed.context).toMatchObject({
    revision: 'old',
    kind: 'saved-passage',
    text: 'Old saved explanation.'
  })
  const pdf = enrichReferenceContext(
    { ...reference, source: { ...source, kind: 'pdf' }, page: 2 },
    { revision: 'new', text: '', pages: ['Wrong page.', 'Before. Selected phrase. After.'] }
  )
  expect(pdf.context).toMatchObject({ page: 2, text: 'Before. Selected phrase. After.' })
  const repeated = `# First\nRepeated quote.\n${'First context. '.repeat(200)}\n# Second\nSecond context. Repeated quote. Specific nearby detail.`
  const window = contextWindow(repeated, 'Repeated quote.', 5)
  expect(window.heading).toBe('Second')
  expect(window.text).toContain('Specific nearby detail')
  expect(window.text.length).toBeLessThanOrEqual(3200)
})

it('includes visible activity context without leaking hidden answers or hints, and restricts on-demand expansion to transferred documents', async () => {
  const { Store } = await import('../src/main/store')
  const { Vault } = await import('../src/main/vault')
  const { studyTools } = await import('../src/main/pi')
  const store = new Store(':memory:')
  try {
    const chat: Conversation = {
      id: 'tab',
      parentId: 'root',
      title: 'Chat',
      createdAt: 'date',
      updatedAt: 'date'
    }
    store.put('conversation', chat)
    store.put('conversation', { ...chat, id: 'root', parentId: undefined })
    store.put('card', {
      id: 'card',
      scope: 'vault',
      conversationId: 'root',
      front: 'What does this equation represent?',
      back: 'SECRET ANSWER',
      contentVersion: 'version',
      sources: []
    })
    store.put('exercise', {
      id: 'exercise',
      scope: 'vault',
      conversationId: 'root',
      title: 'Explain',
      prompt: 'Explain the equation.',
      hints: ['SECRET HINT'],
      solution: 'SECRET SOLUTION',
      createdAt: 'date',
      sources: []
    })
    const front = resolveChatReferences(store, chat, 'vault', [
      { id: 'front', cardId: 'card', side: 'front', text: 'equation', label: '' }
    ])[0]
    expect(front.context?.text).toContain('What does this equation')
    expect(front.context?.text).not.toContain('SECRET ANSWER')
    const back = resolveChatReferences(store, chat, 'vault', [
      { id: 'back', cardId: 'card', side: 'back', text: 'SECRET ANSWER', label: '' }
    ])[0]
    expect(back.context?.text).toContain('What does this equation')
    expect(back.context?.text).toContain('SECRET ANSWER')
    const exercise = resolveChatReferences(store, chat, 'vault', [
      { id: 'ex', exerciseId: 'exercise', text: 'equation', label: '' }
    ])[0]
    expect(exercise.context?.text).not.toContain('SECRET')
    const source: Source = {
      id: 'middle',
      scope: 'attachments:root',
      path: 'book.pdf',
      kind: 'pdf',
      title: 'Book',
      revision: 'version',
      page: 2,
      heading: '',
      text: 'Selected page.'
    }
    const previous = { ...source, id: 'previous', page: 1, text: 'Prior definition.' }
    const next = { ...source, id: 'next', page: 3, text: 'Following context.' }
    store.replaceDocument(source.scope, source.path, source.revision, source.title, 'pdf', [
      previous,
      source,
      next
    ])
    store.replaceDocument(source.scope, 'private.pdf', source.revision, 'Private', 'pdf', [
      { ...source, id: 'unrelated', path: 'private.pdf' }
    ])
    const used = new Map([[source.id, source]])
    const tool = studyTools(store, new Vault(store, () => {}), chat.id, used, () => {}).find(
      (tool) => tool.name === 'read_source'
    )!
    const result = await tool.execute(
      'call',
      { sourceId: source.id, surrounding: true },
      undefined,
      undefined,
      {} as never
    )
    expect(JSON.stringify(result)).toContain('Prior definition.')
    expect(JSON.stringify(result)).toContain('Following context.')
    expect(used.has('next')).toBe(true)
    await expect(
      tool.execute(
        'call',
        { sourceId: 'unrelated', surrounding: true },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('not available')
  } finally {
    store.close()
  }
})

it('discards untouched chats across restart but preserves drafts, attachments and real work', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-empty-chat-'))
  directories.push(directory)
  let app = new Application(directory, host, () => {}, codec)
  try {
    const unused = (await app.request({ action: 'newChat' })) as Conversation
    const repeated = (await app.request({ action: 'newChat' })) as Conversation
    expect(repeated.id).toBe(unused.id)
    await app.request({ action: 'updateTab', conversationId: unused.id, closed: true })
    expect(app.snapshot().conversations).toEqual([])
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(app.snapshot().conversations).toEqual([])
    const draft = (await app.request({ action: 'newChat' })) as Conversation
    await app.request({ action: 'updateTab', conversationId: draft.id, hasDraft: true })
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(app.snapshot().conversations).toHaveLength(1)
    await app.request({ action: 'updateTab', conversationId: draft.id, hasDraft: false })
    expect(app.snapshot().conversations[0].temporary).toBe(true)
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(app.snapshot().conversations).toEqual([])
  } finally {
    await app.close()
  }
})

it('releases old empty placeholders and interrupted naming while preserving messages, attachments and used parents', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-placeholder-'))
  directories.push(directory)
  let app = new Application(directory, host, () => {}, codec)
  try {
    const chat = { title: 'New conversation', createdAt: 'now', updatedAt: 'now' }
    app.store.put('conversation', { ...chat, id: 'unused' })
    app.store.put('conversation', { ...chat, id: 'closed-unused', closed: true })
    app.store.put('conversation', {
      ...chat,
      id: 'closed-renamed',
      title: 'Just a name',
      closed: true
    })
    app.store.put('conversation', { ...chat, id: 'parent' })
    app.store.put('conversation', {
      ...chat,
      id: 'used',
      parentId: 'parent',
      titleGeneration: { status: 'pending', modelKey: 'provider/namer', requestedAt: 'now' }
    })
    app.store.put('message', {
      id: 'actual-work',
      conversationId: 'used',
      text: 'A learner question'
    })
    app.store.put('conversation', { ...chat, id: 'resource' })
    app.store.replaceDocument('attachments:resource', 'book.pdf', 'original', 'Book', 'pdf', [])
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(app.store.get<Conversation>('conversation', 'unused')?.temporary).toBe(true)
    expect(app.store.get('conversation', 'closed-unused')).toBeNull()
    expect(app.store.get('conversation', 'closed-renamed')).toBeNull()
    expect(
      app.store.db
        .prepare("SELECT id FROM records WHERE kind='conversation' ORDER BY id")
        .all()
        .map((row) => row.id)
    ).toEqual(['parent', 'resource', 'used'])
    expect(await app.request({ action: 'messages', conversationId: 'used' })).toHaveLength(1)
    expect(app.store.get<Conversation>('conversation', 'used')?.titleGeneration).toEqual({
      status: 'failed',
      modelKey: 'provider/namer',
      requestedAt: 'now'
    })
  } finally {
    await app.close()
  }
})

it('discards closed empty tabs immediately, including renamed tabs and empty roots, while retaining work', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-close-tab-'))
  directories.push(directory)
  let app = new Application(directory, host, () => {}, codec)
  try {
    const root = (await app.request({ action: 'newChat' })) as Conversation
    const blank = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    const draft = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    const used = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    const attached = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    app.store.put('message', {
      id: 'saved-work',
      conversationId: used.id,
      text: 'A saved learner question'
    })
    app.store.replaceDocument(`attachments:${attached.id}`, 'book.pdf', 'v1', 'Book', 'pdf', [])
    await app.request({ action: 'updateTab', conversationId: blank.id, title: 'Named but empty' })
    expect(
      await app.request({ action: 'updateTab', conversationId: blank.id, closed: true })
    ).toBeNull()
    await app.request({
      action: 'updateTab',
      conversationId: draft.id,
      closed: true,
      hasDraft: true
    })
    await app.request({ action: 'updateTab', conversationId: used.id, closed: true })
    await app.request({ action: 'updateTab', conversationId: attached.id, closed: true })
    expect(
      app
        .snapshot()
        .conversations.filter((tab) => tab.closed)
        .map((tab) => tab.id)
    ).toEqual([used.id, attached.id, draft.id])
    // The empty first tab can disappear without losing its siblings' group or histories.
    await app.request({ action: 'updateTab', conversationId: root.id, closed: true })
    expect(app.store.get('conversation', root.id)).toBeNull()
    expect(app.store.get<Conversation>('conversation', used.id)?.parentId).toBeUndefined()
    expect(app.store.get<Conversation>('conversation', draft.id)?.parentId).toBe(used.id)
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(
      app
        .snapshot()
        .conversations.map((tab) => tab.id)
        .sort()
    ).toEqual([draft.id, used.id, attached.id].sort())
    expect(await app.request({ action: 'messages', conversationId: used.id })).toHaveLength(1)
    // Clearing the last work in an already closed tab also discards it.
    await app.request({ action: 'updateTab', conversationId: draft.id, hasDraft: false })
    expect(app.store.get('conversation', draft.id)).toBeNull()
  } finally {
    await app.close()
  }
})

it('transfers chat quotations with trusted role, message context and citations, scoped to sibling tabs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-message-quote-'))
  directories.push(directory)
  let app = new Application(directory, host, () => {}, codec)
  try {
    const root = (await app.request({ action: 'newChat' })) as Conversation
    const tab = (await app.request({ action: 'newChat', parentId: root.id })) as Conversation
    const other = (await app.request({ action: 'newChat' })) as Conversation
    const source: Source = {
      id: 'citation',
      scope: `attachments:${root.id}`,
      path: 'book.pdf',
      title: 'Book',
      kind: 'pdf',
      revision: 'v1',
      page: 1,
      heading: '',
      text: 'The original source.'
    }
    app.store.put('message', {
      id: 'assistant-reply',
      conversationId: root.id,
      role: 'assistant',
      text: 'A prerequisite.\n\nThe **selected relation** is useful.\n\nA limitation.',
      sources: [source],
      createdAt: '2026-10-04T12:00:00Z',
      status: 'complete'
    })
    app.store.put('message', {
      id: 'learner-message',
      conversationId: root.id,
      role: 'user',
      text: 'My earlier attempt.',
      sources: [],
      createdAt: '2026-10-04T11:59:00Z',
      status: 'complete'
    })
    const selected: ChatReference = {
      id: 'message-quote',
      messageId: 'assistant-reply',
      text: 'selected relation',
      sourceLine: 3,
      label: 'forged label',
      messageRole: 'user',
      originConversationId: other.id
    }
    await expect(
      app.request({ action: 'addChatReference', conversationId: other.id, reference: selected })
    ).rejects.toThrow('unavailable')
    await expect(
      app.request({
        action: 'addChatReference',
        conversationId: tab.id,
        reference: { ...selected, sourceId: 'citation' }
      })
    ).rejects.toThrow('Choose a source')
    const quote = (await app.request({
      action: 'addChatReference',
      conversationId: tab.id,
      reference: selected
    })) as ChatReference
    expect(quote).toMatchObject({
      messageId: 'assistant-reply',
      messageRole: 'assistant',
      originConversationId: root.id,
      label: 'Noctua · New conversation',
      revision: '2026-10-04T12:00:00Z',
      context: { kind: 'message' },
      relatedSources: [source]
    })
    expect(quote.context?.text).toContain('A prerequisite.')
    expect(quote.context?.text).toContain('A limitation.')
    expect(quote.context?.note).toContain('not an authoritative source')
    const learner = (await app.request({
      action: 'addChatReference',
      conversationId: tab.id,
      reference: { id: 'learner-quote', messageId: 'learner-message', label: '', text: 'attempt' }
    })) as ChatReference
    expect(learner.messageRole).toBe('user')
    expect(learner.context?.note).toContain('not a new independent answer')
    await app.request({ action: 'updateTab', conversationId: tab.id, closed: true })
    expect(app.store.get<Conversation>('conversation', tab.id)?.closed).toBe(true)
    await app.close()
    app = new Application(directory, host, () => {}, codec)
    expect(
      resolveChatReferences(app.store, tab, app.vault.scope, [
        { ...selected, text: 'forged replacement' }
      ])[0]
    ).toEqual(quote)
    expect(app.store.resolveSource('citation')).toMatchObject({ revision: 'v1' })
    expect(() => resolveChatReferences(app.store, root, app.vault.scope, [selected])).toThrow(
      'another tab'
    )
  } finally {
    await app.close()
  }
})
