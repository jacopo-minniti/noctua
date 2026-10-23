import { createHash, randomUUID } from 'node:crypto'
import { promises as fs, watch as watchDirectory, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml'
import type { Concept, IndexStatus, Level, Source } from '../shared/types'
import { levels } from '../shared/types'
import { Store } from './store'
import { importMarkdownCards } from './legacy-cards'
import { pdfTextEngine } from './pdf-text'

export const hash = (text: string | Uint8Array): string =>
  createHash('sha256').update(text).digest('hex')
export const vaultScope = (root: string | null): string =>
  root ? `vault:${hash(root).slice(0, 24)}` : 'unconnected'
const rankPattern = new RegExp(`#(${levels.join('|')})(?![\\w/-])\\b`, 'g')
const markerPattern =
  /<!-- noctua:concept ([a-zA-Z0-9:_-]+) -->\s*#(unknown|knowledge|comprehension|application|transfer)/

export async function containedFile(root: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..'))
    throw new Error('Source path is outside the vault.')
  const resolvedRoot = await fs.realpath(root)
  const candidate = path.resolve(resolvedRoot, relative)
  const real = await fs.realpath(candidate)
  if (!real.startsWith(resolvedRoot + path.sep) || !(await fs.stat(real)).isFile())
    throw new Error('Source path is outside the vault.')
  // Replacing a symlink can break the vault's structure. Reads outside the root are already rejected.
  if ((await fs.lstat(candidate)).isSymbolicLink())
    throw new Error('Symbolic link sources are not supported.')
  return real
}

interface Section {
  heading: string
  anchor: string
  start: number
  end: number
  title: string
}
export function markdownSections(text: string, title: string): Section[] {
  const lines = text.split('\n')
  const headings: { line: number; heading: string; anchor: string }[] = []
  const occurrences = new Map<string, number>()
  let fence = ''
  let frontmatter = lines[0]?.trim() === '---'
  for (let i = 0; i < lines.length; i++) {
    if (frontmatter) {
      if (i > 0 && /^---\s*$/.test(lines[i])) frontmatter = false
      continue
    }
    const fenced = lines[i].match(/^\s*(`{3,}|~{3,})/)
    if (fenced) {
      if (!fence) fence = fenced[1][0]
      else if (fence === fenced[1][0]) fence = ''
      continue
    }
    if (fence) continue
    const match = lines[i].match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
    if (match) {
      const heading = match[1].replace(rankPattern, '').trim()
      const count = occurrences.get(heading) || 0
      occurrences.set(heading, count + 1)
      headings.push({ line: i, heading, anchor: `${heading}${count ? `::${count + 1}` : ''}` })
    }
  }
  if (!headings.length) return [{ heading: '', anchor: '', title, start: 0, end: lines.length }]
  const result: Section[] = []
  if (headings[0].line > 0 && lines.slice(0, headings[0].line).join('\n').trim())
    result.push({ heading: '', anchor: '', title, start: 0, end: headings[0].line })
  headings.forEach((entry, i) =>
    result.push({
      ...entry,
      title: entry.heading,
      start: entry.line,
      end: headings[i + 1]?.line ?? lines.length
    })
  )
  return result
}

export function markdownChunks(
  scope: string,
  relative: string,
  text: string,
  kind: Source['kind'] = 'markdown'
): Source[] {
  const revision = hash(text)
  const title = path.basename(relative, path.extname(relative))
  const lines = text.split('\n')
  const result: Source[] = []
  for (const section of markdownSections(text, title)) {
    let start = section.start
    while (start < section.end) {
      let end = start,
        length = 0
      while (end < section.end && (length < 1800 || end === start)) {
        length += lines[end].length + 1
        end++
      }
      const body = lines.slice(start, end).join('\n').trim()
      if (body)
        result.push({
          id: hash(`${scope}\0${relative}\0${revision}\0${start}`).slice(0, 32),
          scope,
          path: relative,
          title,
          kind,
          revision,
          heading: section.heading,
          anchor: section.anchor,
          startLine: start + 1,
          endLine: end,
          text: body
        })
      start = end
    }
  }
  return result
}

function importedLevel(text: string): Level | null {
  const marker = text.match(markerPattern)
  if (marker) return marker[2] as Level
  const plain = text.match(
    /(?:^|\n)\s*#(unknown|knowledge|comprehension|application|transfer)\s*(?:\n|$)/
  )
  if (plain) return plain[1] as Level
  const heading = text.split('\n').find((line) => /^#{1,6}\s/.test(line))
  const fromHeading = heading?.match(new RegExp(`#(${levels.join('|')})\\b`))
  return fromHeading ? (fromHeading[1] as Level) : null
}
export function conceptsFromMarkdown(scope: string, relative: string, text: string): Concept[] {
  const title = path.basename(relative, path.extname(relative))
  const parts = markdownSections(text, title)
  const lines = text.split('\n')
  // Short notes are one unit. Long notes or explicitly tagged sections expose finer units.
  const granular =
    text.length > 3500 ||
    parts.some(
      (part) =>
        part.heading &&
        !/^#\s/.test(lines[part.start]) &&
        importedLevel(lines.slice(part.start, part.end).join('\n'))
    )
  const selected = granular
    ? parts.filter((part) => part.heading && !/^#\s/.test(lines[part.start]))
    : []
  const targets: Section[] = [
    {
      title,
      heading: '',
      anchor: '',
      start: 0,
      end: selected.length
        ? (parts.find((part) => part.heading)?.start ?? lines.length)
        : lines.length
    },
    ...selected
  ]
  let frontmatterLevel: Level | null = null
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (fm) {
    try {
      const tags = parseYaml(fm[1])?.tags
      const values = Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
          ? tags.split(/[,\s]+/)
          : []
      frontmatterLevel =
        (values
          .map((tag: unknown) => String(tag).replace(/^#/, ''))
          .find((tag: string) => levels.includes(tag as Level)) as Level) || null
    } catch {
      /* Invalid YAML remains untouched; Markdown is still readable. */
    }
  }
  return targets.map((part) => {
    const body = lines.slice(part.start, part.end).join('\n')
    const marker = body.match(markerPattern)
    return {
      // A pasted marker must not alias a concept in another note or vault.
      id: hash(`${scope}\0${relative}\0concept\0${part.anchor}`).slice(0, 32),
      scope,
      path: relative,
      anchor: part.anchor,
      title: part.title,
      level: importedLevel(body) || (!part.anchor ? frontmatterLevel : null),
      levelOrigin: importedLevel(body) || (!part.anchor && frontmatterLevel) ? 'vault' : null,
      updatedAt: new Date().toISOString(),
      archived: false
    }
  })
}

export function tagPatch(content: string, concept: Concept, level: Level): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  let normalized = content.replace(/\r\n/g, '\n')
  if (!concept.anchor) {
    const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
    if (frontmatter) {
      const document = parseDocument(frontmatter[1])
      if (document.errors.length)
        throw new Error('Fix the note’s YAML before changing its concept tag.')
      const tags = document.get('tags', true)
      let changed = false
      if (isSeq(tags)) {
        const retained = tags.items.filter(
          (item) =>
            !isScalar(item) || !levels.includes(String(item.value).replace(/^#/, '') as Level)
        )
        changed = retained.length !== tags.items.length
        tags.items = retained
      } else if (isScalar(tags) && typeof tags.value === 'string') {
        const original = tags.value.split(/[,\s]+/).filter(Boolean)
        const retained = original.filter((tag) => !levels.includes(tag.replace(/^#/, '') as Level))
        changed = retained.length !== original.length
        if (changed) tags.value = retained.join(', ')
      }
      if (changed)
        normalized = normalized.replace(
          frontmatter[0],
          `---\n${document.toString({ lineWidth: 0 }).trimEnd()}\n---\n`
        )
    }
  }
  const lines = normalized.split('\n')
  const candidates = markdownSections(normalized, concept.title)
  const section = concept.anchor
    ? candidates.find((part) => part.anchor === concept.anchor)
    : { start: 0, end: candidates.find((part) => part.heading)?.start ?? lines.length }
  if (!section) throw new Error('This section moved or changed. Reindex before saving its tag.')
  const marker = `<!-- noctua:concept ${concept.id} --> #${level}`
  const existing = lines.findIndex(
    (line, i) => i >= section.start && i < section.end && markerPattern.test(line)
  )
  if (existing >= 0) lines[existing] = marker
  else {
    let insert = concept.anchor ? section.start + 1 : 0
    if (!concept.anchor && lines[0] === '---') {
      const end = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line))
      if (end >= 0) insert = end + 1
    }
    const standalone = lines.findIndex(
      (line, i) =>
        i >= insert && i < section.end && new RegExp(`^\\s*#(${levels.join('|')})\\s*$`).test(line)
    )
    if (standalone >= 0) lines[standalone] = marker
    else lines.splice(insert, 0, marker, '')
  }
  // Replace only a rank on this unit's heading; keep other tags and prose.
  const headingLine = lines.findIndex(
    (line, index) => index >= section.start && /^#{1,6}\s/.test(line)
  )
  if (headingLine >= 0 && (concept.anchor || /^#\s/.test(lines[headingLine])))
    lines[headingLine] = lines[headingLine].replace(rankPattern, '').trimEnd()
  return lines.join(newline)
}

export async function writeTag(
  root: string,
  concept: Concept,
  expectedRevision: string,
  backupDir: string
): Promise<void> {
  if (!concept.level) throw new Error('Choose a level before writing a tag.')
  const file = await containedFile(root, concept.path)
  if (path.extname(file).toLowerCase() !== '.md')
    throw new Error('Tags can only be written to Markdown notes.')
  const original = await fs.readFile(file, 'utf8')
  if (hash(original) !== expectedRevision)
    throw new Error('The note changed outside Noctua. Preview the current version before saving.')
  const updated = tagPatch(original, concept, concept.level)
  if (updated === original) return
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(
    path.join(
      backupDir,
      `${Date.now()}-${hash(concept.path).slice(0, 12)}-${randomUUID().slice(0, 8)}.md`
    ),
    original,
    { mode: 0o600, flag: 'wx' }
  )
  const temporary = `${file}.noctua-${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, updated, { flag: 'wx', mode: (await fs.stat(file)).mode })
    if (
      hash(await fs.readFile(await containedFile(root, concept.path), 'utf8')) !== expectedRevision
    )
      throw new Error('The note changed during saving. Your edit was not applied.')
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

export function normalizeVector(vector: number[]): Float32Array {
  if (!vector.length || vector.some((value) => !Number.isFinite(value)))
    throw new Error('Embedding model returned an invalid vector.')
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) throw new Error('Embedding model returned an empty vector.')
  return Float32Array.from(vector, (value) => value / norm)
}
export class Embeddings {
  constructor(
    readonly baseUrl: string,
    readonly model: string
  ) {}
  get key(): string {
    return hash(`${this.baseUrl.replace(/\/$/, '')}\0${this.model}`)
  }
  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts, truncate: false }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000)
    })
    if (!response.ok)
      throw new Error(
        `Embeddings unavailable (${response.status}). Check Ollama and the embedding model.`
      )
    const data = (await response.json()) as { embeddings?: number[][] }
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length)
      throw new Error('Embedding response did not match the requested passages.')
    const vectors = data.embeddings.map(normalizeVector)
    if (vectors.some((vector) => vector.length !== vectors[0].length))
      throw new Error('Embedding dimensions are inconsistent.')
    return vectors
  }
}
interface NoteIdentity {
  id: string
  scope: string
  path: string
  revision: string
  fingerprint: string
  portableId: string | null
  concepts: { id: string; anchor: string; fingerprint: string }[]
  updatedAt: string
}

export class Vault {
  private watcher: FSWatcher | null = null
  private watchTimer: ReturnType<typeof setTimeout> | null = null
  private watchPending = false
  private closed = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollSignature: string | null = null
  private polling = false
  private idleWaiters: (() => void)[] = []
  whenIdle(): Promise<void> {
    return this.status.indexing
      ? new Promise((resolve) => this.idleWaiters.push(resolve))
      : Promise.resolve()
  }
  status: IndexStatus = {
    documents: 0,
    chunks: 0,
    vectors: 0,
    mode: 'lexical',
    indexing: false,
    message: 'Connect a vault to get started.',
    lastIndexedAt: null
  }
  constructor(
    readonly store: Store,
    readonly notify: (status: IndexStatus) => void
  ) {
    this.refreshStatus()
  }
  get scope(): string {
    return vaultScope(this.store.settings.vaultPath)
  }
  pathForSource(source: Source): string {
    if (!source.documentId) return source.path
    const identity = this.store.get<{ scope: string; path: string }>(
      'noteIdentity',
      source.documentId
    )
    return identity?.scope === source.scope ? identity.path : source.path
  }
  watch(): void {
    this.stopWatching()
    const root = this.store.settings.vaultPath
    if (!root || this.store.meta(`cache-cleared:${this.scope}`, false)) return
    this.closed = false
    try {
      this.watcher = watchDirectory(root, { recursive: true }, (_event, filename) => {
        const relative = filename?.toString() || ''
        if (
          relative &&
          (relative
            .split(/[\\/]/)
            .some((part) => part.startsWith('.') || ['node_modules', 'backups'].includes(part)) ||
            !/\.(?:md|txt|pdf)$/i.test(relative))
        )
          return
        this.queueReindex()
      })
      this.watcher.on('error', () => this.startPolling())
    } catch {
      this.startPolling()
    }
  }
  private startPolling(): void {
    if (this.pollTimer || this.closed) return
    this.watcher?.close()
    this.watcher = null
    this.refreshStatus('Watching note changes with periodic file checks.')
    this.pollTimer = setInterval(() => {
      void this.pollFiles()
    }, 1500)
    this.pollTimer.unref()
    void this.pollFiles()
  }
  private async pollFiles(): Promise<void> {
    const root = this.store.settings.vaultPath
    if (!root || this.closed || this.polling) return
    this.polling = true
    try {
      const current: string[] = [],
        expected: string[] = []
      const visit = async (folder: string): Promise<void> => {
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
          if (
            entry.isSymbolicLink() ||
            entry.name.startsWith('.') ||
            ['node_modules', 'backups'].includes(entry.name)
          )
            continue
          const file = path.join(folder, entry.name)
          if (entry.isDirectory()) await visit(file)
          else if (entry.isFile() && /\.(md|txt|pdf)$/i.test(entry.name)) {
            const relative = path.relative(root, file).split(path.sep).join('/'),
              stat = await fs.stat(file)
            current.push(`${relative}:${stat.size}:${stat.mtimeMs}`)
          }
        }
      }
      await visit(root)
      if (this.closed) return
      for (const row of this.store.db
        .prepare('SELECT path FROM documents WHERE scope=?')
        .all(this.scope)) {
        const stat = this.store.meta<{ size: number; mtimeMs: number } | null>(
          `file-stat:${this.scope}:${row.path}`,
          null
        )
        expected.push(`${row.path}:${stat?.size}:${stat?.mtimeMs}`)
      }
      const signature = hash(current.sort().join('\n'))
      const previous = this.pollSignature ?? hash(expected.sort().join('\n'))
      this.pollSignature = signature
      if (signature !== previous) this.queueReindex()
    } catch {
      /* Retry the lightweight scan later; do not disturb the existing cache. */
    } finally {
      this.polling = false
    }
  }
  queueReindex(): void {
    if (this.closed) return
    this.watchPending = true
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null
      void this.refreshWatched()
    }, 700)
  }
  private async refreshWatched(): Promise<void> {
    if (this.closed || !this.watchPending) return
    if (this.status.indexing) {
      this.watchTimer = setTimeout(() => {
        this.watchTimer = null
        void this.refreshWatched()
      }, 500)
      return
    }
    this.watchPending = false
    try {
      await this.index()
    } catch (error) {
      if (!this.closed)
        this.refreshStatus(
          error instanceof Error ? error.message : 'Could not refresh changed notes.'
        )
    }
  }
  stopWatching(): void {
    this.closed = true
    this.watcher?.close()
    this.watcher = null
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = null
    this.watchPending = false
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.pollSignature = null
  }
  clearCache(): void {
    if (!this.store.settings.vaultPath) throw new Error('Connect a vault first.')
    if (this.status.indexing) throw new Error('Wait for indexing to finish.')
    const scope = this.scope
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM chunks WHERE scope=?').run(scope)
      this.store.db.prepare('DELETE FROM documents WHERE scope=?').run(scope)
      const keys = this.store.db.prepare('SELECT key FROM metadata').all()
      for (const row of keys) {
        const key = row.key as string
        if (key === `index-at:${scope}` || key.startsWith(`file-stat:${scope}:`))
          this.store.db.prepare('DELETE FROM metadata WHERE key=?').run(key)
      }
      this.store.setMeta(`cache-cleared:${scope}`, true)
    })
    this.stopWatching()
    this.refreshStatus('Vault cache deleted. Choose Chunk & cache notes to rebuild it.')
  }
  async embedMissing(scope: string): Promise<string> {
    const embedding = this.embedding
    if (!embedding) return ''
    const missing = this.store.db
      .prepare(
        'SELECT id,data FROM chunks WHERE scope=? AND (vector IS NULL OR embedding_key IS NULL OR embedding_key<>?)'
      )
      .all(scope, embedding.key)
    for (let i = 0; i < missing.length; i += 8) {
      this.refreshStatus(
        `Caching passages ${i + 1}–${Math.min(i + 8, missing.length)} of ${missing.length}…`
      )
      try {
        const batch = missing.slice(i, i + 8),
          vectors = await embedding.embed(
            batch.map((row) => (JSON.parse(row.data as string) as Source).text)
          )
        this.store.transaction(() =>
          batch.forEach((row, n) =>
            this.store.db
              .prepare('UPDATE chunks SET vector=?,embedding_key=? WHERE id=?')
              .run(new Uint8Array(vectors[n].buffer), embedding.key, row.id as string)
          )
        )
      } catch (error) {
        return error instanceof Error ? error.message : 'Embedding model unavailable.'
      }
    }
    return ''
  }
  get embedding(): Embeddings | null {
    const config = this.store.settings.embeddings
    return config.enabled ? new Embeddings(config.baseUrl, config.model) : null
  }
  refreshStatus(message?: string): void {
    const scope = this.scope
    const documents = Number(
      this.store.db.prepare('SELECT COUNT(*) AS n FROM documents WHERE scope=?').get(scope)?.n || 0
    )
    const chunks = Number(
      this.store.db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE scope=?').get(scope)?.n || 0
    )
    const vectors = this.embedding
      ? Number(
          this.store.db
            .prepare(
              'SELECT COUNT(*) AS n FROM chunks WHERE scope=? AND embedding_key=? AND vector IS NOT NULL'
            )
            .get(scope, this.embedding.key)?.n || 0
        )
      : 0
    this.status = {
      ...this.status,
      documents,
      chunks,
      vectors,
      mode: vectors && vectors === chunks ? 'semantic' : vectors ? 'partial' : 'lexical',
      message: message ?? this.status.message,
      lastIndexedAt: this.store.meta(`index-at:${scope}`, null)
    }
    this.notify(this.status)
  }
  async index(): Promise<void> {
    if (this.status.indexing) throw new Error('The vault is already being indexed.')
    const root = this.store.settings.vaultPath
    if (!root) throw new Error('Connect a Markdown vault first.')
    const scope = this.scope
    this.store.setMeta(`cache-cleared:${scope}`, false)
    this.status.indexing = true
    this.refreshStatus('Reading your vault…')
    const seen = new Set<string>()
    let skipped = 0
    const visit = async (folder: string): Promise<void> => {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (
          entry.name.startsWith('.') ||
          ['node_modules', 'backups'].includes(entry.name) ||
          entry.isSymbolicLink()
        )
          continue
        const file = path.join(folder, entry.name)
        if (entry.isDirectory()) {
          await visit(file)
          continue
        }
        const ext = path.extname(entry.name).toLowerCase()
        if (!entry.isFile() || !['.md', '.txt', '.pdf'].includes(ext)) continue
        const relative = path.relative(root, file).split(path.sep).join('/')
        seen.add(relative)
        try {
          await this.indexFile(scope, relative, file)
          this.refreshStatus(`Reading ${relative}`)
        } catch {
          skipped++
          this.refreshStatus(`Could not read ${relative}; continuing.`)
        }
      }
    }
    try {
      await visit(root)
      this.store.transaction(() => {
        const documents = this.store.db
          .prepare('SELECT path FROM documents WHERE scope=?')
          .all(scope)
        for (const doc of documents)
          if (!seen.has(doc.path as string)) {
            this.store.db
              .prepare('DELETE FROM chunks WHERE scope=? AND path=?')
              .run(scope, doc.path)
            this.store.db
              .prepare('DELETE FROM documents WHERE scope=? AND path=?')
              .run(scope, doc.path)
          }
        for (const concept of this.store
          .all<Concept>('concept')
          .filter((concept) => concept.scope === scope && concept.path && !seen.has(concept.path)))
          this.store.put('concept', { ...concept, archived: true })
      })
      const error = await this.embedMissing(scope)
      this.store.setMeta(`index-at:${scope}`, new Date().toISOString())
      this.refreshStatus(
        error
          ? `${error} Text search is available.`
          : `Vault ready.${skipped ? ` ${skipped} files could not be read.` : ''}`
      )
    } finally {
      this.status.indexing = false
      this.refreshStatus()
      this.idleWaiters.splice(0).forEach((resolve) => resolve())
    }
  }
  async indexFile(
    scope: string,
    relative: string,
    file: string,
    displayTitle?: string
  ): Promise<Source[]> {
    const stat = await fs.stat(file)
    if (stat.size > 40 * 1024 * 1024)
      throw new Error('Source exceeds the experimental 40 MB limit.')
    const bytes = await fs.readFile(file)
    this.store.setMeta(`file-stat:${scope}:${relative}`, { size: stat.size, mtimeMs: stat.mtimeMs })
    const revision = hash(bytes)
    const previous = this.store.db
      .prepare('SELECT revision FROM documents WHERE scope=? AND path=?')
      .get(scope, relative)
    if (
      previous?.revision === revision &&
      this.store.documentChunks(scope, relative)[0]?.documentId
    )
      return this.store.documentChunks(scope, relative)
    let chunks: Source[]
    const kind: Source['kind'] = /\.(png|jpe?g|gif|webp)$/i.test(relative)
      ? 'image'
      : relative.toLowerCase().endsWith('.pdf')
        ? 'pdf'
        : relative.toLowerCase().endsWith('.md')
          ? 'markdown'
          : 'text'
    const title = displayTitle || path.basename(relative, path.extname(relative))
    const identity = await this.identify(scope, relative, bytes, kind, revision, file)
    if (kind === 'image') {
      chunks = markdownChunks(
        scope,
        relative,
        `[Image attachment: ${title}. Image content has not been extracted or assessed.]`,
        'image'
      ).map((chunk) => ({ ...chunk, title, revision }))
    } else if (kind === 'pdf') {
      const { extractText, getDocumentProxy } = await pdfTextEngine()
      const pdf = await getDocumentProxy(new Uint8Array(bytes))
      try {
        const { text: pages } = await extractText(pdf, { mergePages: false })
        chunks = pages.flatMap((text, index) =>
          markdownChunks(
            scope,
            relative,
            text || '[No searchable text on this page. Read the original page image.]',
            'pdf'
          ).map((chunk) => ({
            ...chunk,
            title,
            revision,
            page: index + 1,
            heading: `Page ${index + 1}`,
            startLine: undefined,
            endLine: undefined,
            id: hash(`${scope}\0${relative}\0${revision}\0${index}\0${chunk.id}`).slice(0, 32)
          }))
        )
      } finally {
        await pdf.cleanup()
      }
      const conceptId =
        identity.concepts.find((c) => !c.anchor)?.id ||
        hash(`${scope}\0${identity.id}\0concept`).slice(0, 32)
      const old = this.store.get<Concept>('concept', conceptId)
      this.store.put<Concept>('concept', {
        ...old,
        id: conceptId,
        scope,
        path: relative,
        anchor: '',
        title,
        level: old?.level ?? null,
        levelOrigin: old?.levelOrigin ?? null,
        updatedAt: new Date().toISOString(),
        archived: false
      })
    } else {
      const text = bytes.toString('utf8')
      chunks = markdownChunks(scope, relative, text, kind).map((chunk) => ({
        ...chunk,
        title,
        revision
      }))
      if (kind === 'markdown') {
        const concepts = conceptsFromMarkdown(scope, relative, text).map((concept) => {
          const fingerprint = this.conceptFingerprint(text, concept.anchor)
          const duplicate =
            concept.anchor.includes('::') ||
            identity.concepts.some((c) => c.anchor.startsWith(`${concept.anchor}::`))
          const same = !duplicate
            ? identity.concepts.find((c) => c.anchor === concept.anchor)
            : undefined
          const matches = identity.concepts.filter((c) => c.fingerprint === fingerprint)
          const legacy = !duplicate
            ? this.store
                .all<Concept>('concept')
                .find(
                  (c) =>
                    c.scope === scope && c.path === identity.path && c.anchor === concept.anchor
                )
            : undefined
          return {
            ...concept,
            id:
              same?.id ||
              (matches.length === 1 ? matches[0].id : undefined) ||
              legacy?.id ||
              hash(`${scope}\0${identity.id}\0concept\0${concept.anchor}`).slice(0, 32)
          }
        })
        const retained = new Set(concepts.map((concept) => concept.id))
        for (const concept of concepts) {
          const old = this.store.get<Concept>('concept', concept.id)
          this.store.put('concept', {
            ...old,
            ...concept,
            level: concept.levelOrigin === 'vault' ? concept.level : (old?.level ?? null),
            levelOrigin: concept.levelOrigin === 'vault' ? 'vault' : (old?.levelOrigin ?? null)
          })
        }
        for (const old of this.store
          .all<Concept>('concept')
          .filter(
            (concept) =>
              concept.scope === scope && concept.path === relative && !retained.has(concept.id)
          ))
          this.store.put('concept', { ...old, archived: true })
        importMarkdownCards(this.store, scope, relative, text, chunks)
        identity.concepts = concepts.map((c) => ({
          id: c.id,
          anchor: c.anchor,
          fingerprint: this.conceptFingerprint(text, c.anchor)
        }))
      }
    }
    if (kind === 'text') {
      const conceptId =
        identity.concepts.find((c) => !c.anchor)?.id ||
        hash(`${scope}\0${identity.id}\0concept`).slice(0, 32)
      const old = this.store.get<Concept>('concept', conceptId)
      this.store.put<Concept>('concept', {
        ...old,
        id: conceptId,
        scope,
        path: relative,
        anchor: '',
        title,
        level: old?.level ?? null,
        levelOrigin: old?.levelOrigin ?? null,
        updatedAt: new Date().toISOString(),
        archived: false
      })
    }
    chunks = chunks.map((chunk) => ({ ...chunk, documentId: identity.id }))
    if (kind !== 'markdown')
      identity.concepts = this.store
        .all<Concept>('concept')
        .filter((c) => c.scope === scope && c.path === relative && !c.archived)
        .map((c) => ({ id: c.id, anchor: c.anchor, fingerprint: revision }))
    identity.path = relative
    this.store.put('noteIdentity', identity)
    this.store.replaceDocument(scope, relative, revision, title, kind, chunks)
    return chunks
  }
  private conceptFingerprint(text: string, anchor: string): string {
    const lines = text.split('\n'),
      part = markdownSections(text, '').find((p) => p.anchor === anchor)
    const body = anchor && part ? lines.slice(part.start, part.end).join('\n') : text
    return hash(
      body
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
        .replace(/^#{1,6}\s.*$/gm, '')
        .replace(/<!-- noctua:concept .*? -->\s*#\w+/g, '')
        .trim()
    )
  }
  private async identify(
    scope: string,
    relative: string,
    bytes: Buffer,
    kind: Source['kind'],
    revision: string,
    file: string
  ): Promise<NoteIdentity> {
    const text = bytes.toString('utf8')
    let portableId: string | null = null
    if (kind === 'markdown') {
      try {
        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        const value = fm && parseYaml(fm[1])?.['noctua-id']
        if (typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(value)) portableId = value
      } catch {
        /* Preserve malformed YAML. */
      }
    }
    const fingerprint = kind === 'markdown' ? this.conceptFingerprint(text, '') : revision
    const identities = this.store.all<NoteIdentity>('noteIdentity').filter((n) => n.scope === scope)
    let identity = identities.find((n) => n.path === relative)
    if (identity && portableId && identity.portableId && identity.portableId !== portableId) {
      for (const concept of this.store
        .all<Concept>('concept')
        .filter((c) => c.scope === scope && c.path === relative))
        this.store.put('concept', { ...concept, path: '', archived: true })
      this.store.put('noteIdentity', { ...identity, path: `[replaced:${identity.id}]` })
      identity = undefined
    }
    if (!identity) {
      const candidates = identities.filter((n) =>
        portableId ? n.portableId === portableId : n.fingerprint === fingerprint
      )
      const missing: NoteIdentity[] = []
      for (const candidate of candidates) {
        const previousFile = path.join(
          path.dirname(file),
          path.relative(path.dirname(relative), candidate.path)
        )
        if (!(await fs.stat(previousFile).catch(() => null))) missing.push(candidate)
      }
      if (missing.length === 1 && candidates.length === 1) identity = missing[0]
    }
    if (!identity)
      identity = {
        id: randomUUID(),
        scope,
        path: relative,
        revision,
        fingerprint,
        portableId,
        concepts: [],
        updatedAt: new Date().toISOString()
      }
    if (identity.path !== relative) {
      const oldPath = identity.path
      // Move cache rows before replacement so unchanged chunks can retain their vectors.
      this.store.transaction(() => {
        this.store.db
          .prepare('UPDATE documents SET path=? WHERE scope=? AND path=?')
          .run(relative, scope, oldPath)
        this.store.db
          .prepare('UPDATE chunks SET path=? WHERE scope=? AND path=?')
          .run(relative, scope, oldPath)
        for (const concept of this.store
          .all<Concept>('concept')
          .filter((c) => c.scope === scope && c.path === oldPath))
          this.store.put('concept', { ...concept, path: relative })
      })
    }
    return { ...identity, revision, fingerprint, portableId, updatedAt: new Date().toISOString() }
  }
  async search(
    query: string,
    conversationId: string,
    limit = 6,
    signal?: AbortSignal
  ): Promise<Source[]> {
    const chunks = this.store.chunks([this.scope, `attachments:${conversationId}`])
    const terms = tokenize(query)
    const termFrequency = new Map<string, number>()
    const tokens = chunks.map((chunk) => tokenize(`${chunk.title} ${chunk.heading} ${chunk.text}`))
    for (const words of tokens)
      for (const word of new Set(words)) termFrequency.set(word, (termFrequency.get(word) || 0) + 1)
    const averageLength =
      tokens.reduce((total, words) => total + words.length, 0) / Math.max(1, chunks.length)
    const lexical = chunks
      .map((chunk, i) => {
        let score = 0
        for (const term of terms) {
          const n = tokens[i].filter((word) => word === term).length
          const idf = Math.log(
            1 +
              (chunks.length - (termFrequency.get(term) || 0) + 0.5) /
                ((termFrequency.get(term) || 0) + 0.5)
          )
          score +=
            (idf * n * 2.2) /
            (n + 1.2 * (0.25 + (0.75 * tokens[i].length) / Math.max(1, averageLength)))
        }
        return { chunk, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
    const scores = new Map<string, number>()
    lexical.forEach((item, i) => scores.set(item.chunk.id, 1 / (50 + i)))
    const embedding = this.embedding
    const vectors = embedding
      ? this.store.db
          .prepare(
            'SELECT id,vector FROM chunks WHERE (scope=? OR scope=?) AND embedding_key=? AND vector IS NOT NULL'
          )
          .all(this.scope, `attachments:${conversationId}`, embedding.key)
      : []
    if (embedding && vectors.length) {
      try {
        const [vector] = await embedding.embed([query], signal)
        const semantic = vectors
          .map((row) => {
            const bytes = row.vector as Uint8Array
            const cached = new Float32Array(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            )
            return {
              id: row.id as string,
              score:
                cached.length === vector.length
                  ? cached.reduce((sum, value, i) => sum + value * vector[i], 0)
                  : -1
            }
          })
          .filter((item) => item.score > 0.1)
          .sort((a, b) => b.score - a.score)
        semantic.forEach((item, i) =>
          scores.set(item.id, (scores.get(item.id) || 0) + 1 / (50 + i))
        )
      } catch {
        if (signal?.aborted) throw new Error('Search stopped.')
        this.refreshStatus('Semantic search is unavailable right now. Using text search.')
      }
    }
    return chunks
      .filter((chunk) => scores.has(chunk.id))
      .sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
      .slice(0, limit)
      .map((chunk) => ({ ...chunk, score: scores.get(chunk.id) }))
  }
}
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []
}
