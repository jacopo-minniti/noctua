import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Source, Settings, Conversation } from '../shared/types'

export const defaultSettings: Settings = {
  vaultPath: null,
  modelKey: '',
  usePiCredentials: false,
  localBaseUrl: 'http://127.0.0.1:11434/v1',
  localModelIds: [],
  embeddings: { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'nomic-embed-text' },
  apiProvider: 'anthropic'
}

/** Durable records and derived source cache have distinct tables and lifecycles. */
export class Store {
  private drafts = new Map<string, Conversation>()
  readonly db: DatabaseSync
  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS documents (scope TEXT NOT NULL, path TEXT NOT NULL, revision TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(scope,path));
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, scope TEXT NOT NULL, path TEXT NOT NULL, data TEXT NOT NULL, vector BLOB, embedding_key TEXT);
      CREATE INDEX IF NOT EXISTS chunks_scope ON chunks(scope,path);
      PRAGMA user_version=1;`)
    // Older versions saved untouched placeholders. Preserve anything with actual work,
    // including the ancestors required to reopen a used sibling tab.
    const chats = this.all<Conversation>('conversation')
    const used = new Set<string>()
    for (const row of this.db
      .prepare("SELECT data FROM records WHERE kind != 'conversation'")
      .all()) {
      const record = JSON.parse(row.data as string)
      if (record.conversationId) used.add(record.conversationId)
      if (typeof record.scope === 'string' && record.scope.startsWith('attachments:'))
        used.add(record.scope.slice(12))
    }
    for (const row of this.db.prepare('SELECT DISTINCT scope FROM documents').all())
      if ((row.scope as string).startsWith('attachments:'))
        used.add((row.scope as string).slice(12))
    for (const chat of chats)
      if (chat.title !== 'New conversation' || chat.sessionFile || chat.hasDraft) used.add(chat.id)
    for (const chat of chats) if (used.has(chat.id) && chat.parentId) used.add(chat.parentId)
    for (const chat of chats)
      if (!used.has(chat.id)) {
        this.remove('conversation', chat.id)
        this.stageConversation(chat)
      }
    for (const chat of chats) {
      if (chat.closed) this.discardEmptyClosedConversation(chat.id)
      const retained = this.get<Conversation>('conversation', chat.id)
      if (retained?.titleGeneration?.status === 'pending')
        this.put('conversation', {
          ...retained,
          titleGeneration: { ...retained.titleGeneration, status: 'failed' }
        })
    }
  }
  get<T>(kind: string, id: string): T | null {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id)
    return row
      ? (JSON.parse(row.data as string) as T)
      : kind === 'conversation'
        ? (this.drafts.get(id) as T) || null
        : null
  }
  all<T>(kind: string): T[] {
    const saved = this.db
      .prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid')
      .all(kind)
      .map((row) => JSON.parse(row.data as string) as T)
    return kind === 'conversation' ? [...saved, ...(this.drafts.values() as Iterable<T>)] : saved
  }
  stageConversation(chat: Conversation): Conversation {
    const draft = { ...chat, temporary: true }
    this.drafts.set(chat.id, draft)
    return draft
  }
  retainConversation(id: string): void {
    const draft = this.drafts.get(id)
    if (draft) this.put('conversation', draft)
  }
  releaseEmptyConversation(id: string): void {
    const chat = this.get<Conversation>('conversation', id)
    if (!chat) return
    if (chat.closed) {
      this.discardEmptyClosedConversation(id)
      return
    }
    if (chat.title !== 'New conversation' || this.hasConversationWork(chat)) return
    if (
      this.all<Conversation>('conversation').some(
        (child) => child.parentId === id && !child.temporary
      )
    )
      return
    this.remove('conversation', id)
    this.stageConversation(chat)
  }
  private hasConversationWork(chat: Conversation): boolean {
    if (chat.sessionFile || chat.hasDraft) return true
    const id = chat.id
    const related = this.db.prepare("SELECT data FROM records WHERE kind != 'conversation'").all()
    if (
      related.some((row) => {
        const record = JSON.parse(row.data as string)
        return record.conversationId === id || record.scope === `attachments:${id}`
      })
    )
      return true
    if (this.db.prepare('SELECT 1 FROM documents WHERE scope=? LIMIT 1').get(`attachments:${id}`))
      return true
    return false
  }
  discardEmptyClosedConversation(id: string): boolean {
    const chat = this.get<Conversation>('conversation', id)
    if (!chat?.closed || this.hasConversationWork(chat)) return false
    this.transaction(() => {
      // An empty first tab may still group used siblings. Keep their identities and
      // histories, moving the group to a remaining tab before removing the placeholder.
      const children = this.all<Conversation>('conversation').filter(
        (child) => child.parentId === id
      )
      const root = children.find((child) => !child.closed) || children[0]
      if (root)
        for (const child of [root, ...children.filter((child) => child.id !== root.id)]) {
          const updated = { ...child, parentId: child.id === root.id ? undefined : root.id }
          if (child.temporary) this.stageConversation(updated)
          else this.put('conversation', updated)
        }
      this.remove('conversation', id)
    })
    if (chat.parentId) this.releaseEmptyConversation(chat.parentId)
    return true
  }
  put<T extends { id: string }>(kind: string, record: T): T {
    if (kind === 'conversation') {
      const chat = record as unknown as Conversation
      if (chat.parentId) this.retainConversation(chat.parentId)
      record = { ...record, temporary: undefined }
      this.drafts.delete(record.id)
    } else {
      const conversationId = (record as { conversationId?: string }).conversationId
      if (conversationId) this.retainConversation(conversationId)
    }
    this.db
      .prepare(
        'INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data'
      )
      .run(kind, record.id, JSON.stringify(record))
    return record
  }
  remove(kind: string, id: string): void {
    if (kind === 'conversation') this.drafts.delete(id)
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id)
  }
  meta<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key)
    return row ? (JSON.parse(row.value as string) as T) : fallback
  }
  setMeta(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      )
      .run(key, JSON.stringify(value))
  }
  transaction<T>(fn: () => T): T {
    const draftsBefore = new Map(this.drafts)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.drafts = draftsBefore
      throw error
    }
  }
  get settings(): Settings {
    return this.meta('settings', defaultSettings)
  }
  set settings(value: Settings) {
    this.setMeta('settings', value)
  }
  chunks(scopes: string[]): Source[] {
    if (!scopes.length) return []
    return this.db
      .prepare(`SELECT data FROM chunks WHERE scope IN (${scopes.map(() => '?').join(',')})`)
      .all(...scopes)
      .map((row) => JSON.parse(row.data as string) as Source)
  }
  source(id: string): Source | null {
    const row = this.db.prepare('SELECT data FROM chunks WHERE id=?').get(id)
    return row ? (JSON.parse(row.data as string) as Source) : null
  }
  documentChunks(scope: string, path: string): Source[] {
    return this.db
      .prepare('SELECT data FROM chunks WHERE scope=? AND path=? ORDER BY rowid')
      .all(scope, path)
      .map((row) => JSON.parse(row.data as string) as Source)
  }
  resolveSource(id: string): Source | null {
    const cached = this.source(id)
    if (cached) return cached
    for (const kind of [
      'message',
      'card',
      'exercise',
      'chatReference',
      'bit',
      'highlight',
      'guide',
      'concept',
      'edge',
      'noteBackup'
    ]) {
      const source = this.all<{
        sources?: Source[]
        source?: Source
        references?: { source?: Source }[]
      }>(kind)
        .flatMap((record) => [
          ...(record.sources || []),
          ...(record.source ? [record.source] : []),
          ...(record.references || []).flatMap((reference) =>
            reference.source ? [reference.source] : []
          )
        ])
        .find((source) => source.id === id)
      if (source) return { ...source, historical: true }
    }
    return null
  }
  replaceDocument(
    scope: string,
    path: string,
    revision: string,
    title: string,
    kind: string,
    chunks: Source[]
  ): void {
    // A revision changes citation IDs, but identical passages keep their expensive vectors.
    const vectors = new Map<string, { vector: Uint8Array; key: string }>()
    for (const row of this.db
      .prepare(
        'SELECT data,vector,embedding_key FROM chunks WHERE scope=? AND path=? AND vector IS NOT NULL'
      )
      .all(scope, path)) {
      const source = JSON.parse(row.data as string) as Source
      vectors.set(source.text, {
        vector: row.vector as Uint8Array,
        key: row.embedding_key as string
      })
    }
    if (scope.startsWith('attachments:')) this.retainConversation(scope.slice(12))
    this.transaction(() => {
      this.db.prepare('DELETE FROM chunks WHERE scope=? AND path=?').run(scope, path)
      this.db
        .prepare(
          'INSERT INTO documents(scope,path,revision,title,kind) VALUES(?,?,?,?,?) ON CONFLICT(scope,path) DO UPDATE SET revision=excluded.revision,title=excluded.title,kind=excluded.kind'
        )
        .run(scope, path, revision, title, kind)
      const insert = this.db.prepare(
        'INSERT INTO chunks(id,scope,path,data,vector,embedding_key) VALUES(?,?,?,?,?,?)'
      )
      for (const chunk of chunks) {
        const previous = vectors.get(chunk.text)
        insert.run(
          chunk.id,
          scope,
          path,
          JSON.stringify(chunk),
          previous?.vector || null,
          previous?.key || null
        )
      }
    })
  }
  close(): void {
    this.db.close()
  }
}
