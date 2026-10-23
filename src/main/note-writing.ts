import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isMap, parseDocument } from 'yaml'
import type { Concept, NoteProposal, Source, StudyBit } from '../shared/types'
import type { Store } from './store'
import { containedFile, hash, markdownSections, Vault } from './vault'

interface NoteBackup {
  id: string
  path: string
  backup: string
  before: string
  afterRevision: string
  existed: boolean
  at: string
  sources?: Source[]
  conceptLinks?: { conceptId: string; sourceIds: string[] }[]
}

function frontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  const document = parseDocument(match[1])
  if (document.errors.length || (document.contents && !isMap(document.contents)))
    throw new Error('Keep note frontmatter as valid YAML metadata.')
  return { match, metadata: document.toJS() as Record<string, unknown> | null }
}

function protectedMarkers(text: string) {
  const metadata = frontmatter(text)?.metadata
  const tags = metadata?.tags
  const values = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(/[,\s]+/) : []
  return JSON.stringify({
    identity: metadata?.['noctua-id'] ?? null,
    tags: values
      .map((tag) => String(tag).replace(/^#/, ''))
      .filter((tag) => /^(unknown|knowledge|comprehension|application|transfer)$/.test(tag))
      .sort(),
    markers: (
      text.match(/#(?:unknown|knowledge|comprehension|application|transfer)\b/g) || []
    ).sort()
  })
}

function withNoteIdentity(text: string) {
  const existing = frontmatter(text)
  if (existing?.metadata?.['noctua-id']) return text
  const identity = `noctua-id: ${randomUUID()}`
  return existing
    ? text.replace(/^(---\r?\n)/, `$1${identity}\n`)
    : `---\n${identity}\n---\n\n${text}`
}

/** Shared revision-checked write/backup path for reviewed and authorized model changes. */
export class NoteEditor {
  constructor(
    readonly store: Store,
    readonly vault: Vault,
    readonly dataDir: string
  ) {}
  async target(relative: string): Promise<{ file: string; text: string; exists: boolean }> {
    const selectedRoot = this.store.settings.vaultPath
    if (!selectedRoot) throw new Error('Connect a vault before placing bits in notes.')
    const root = await fs.realpath(selectedRoot)
    if (
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((part) => part === '..' || part.startsWith('.')) ||
      !relative.endsWith('.md')
    )
      throw new Error('Choose a Markdown note inside the vault.')
    const file = path.resolve(await fs.realpath(root), relative)
    try {
      return {
        file: await containedFile(root, relative),
        text: await fs.readFile(await containedFile(root, relative), 'utf8'),
        exists: true
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = await fs.realpath(path.dirname(file))
      if (parent !== root && !parent.startsWith(root + path.sep))
        throw new Error('Note folder is outside the vault.')
      return { file, text: '', exists: false }
    }
  }
  async applyModel(
    proposal: NoteProposal,
    signal?: AbortSignal
  ): Promise<{ saved: string[]; warning?: string }> {
    signal?.throwIfAborted()
    try {
      const current = await this.target(proposal.path)
      const after = this.patch(current.text, proposal)
      if (protectedMarkers(current.text) !== protectedMarkers(after))
        throw new Error(
          'Keep existing learning tags and note identity unchanged; only the learner changes assessment tags.'
        )
      signal?.throwIfAborted()
      return await this.accept([proposal.id], 'model')
    } catch (error) {
      const saved = this.store.get<NoteProposal>('noteProposal', proposal.id)
      if (saved?.status === 'accepted')
        return {
          saved: [proposal.path],
          warning: 'The note was saved, but refreshing its index failed. Refresh the vault cache.'
        }
      if (saved)
        this.store.put('noteProposal', {
          ...saved,
          status: 'rejected',
          updatedAt: new Date().toISOString()
        })
      throw error
    }
  }
  async createFolders(relative: string): Promise<void> {
    // Check every existing parent rather than following symlinks into other locations.
    const root = this.store.settings.vaultPath
    if (!root) throw new Error('Connect a vault before writing notes.')
    if (
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).some((part) => part === '..' || part.startsWith('.')) ||
      !relative.endsWith('.md')
    )
      throw new Error('Choose a Markdown note inside the vault.')
    let current = await fs.realpath(root)
    for (const part of relative.split('/').slice(0, -1)) {
      current = path.join(current, part)
      await fs.mkdir(current, { mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error
      })
      const entry = await fs.lstat(current)
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new Error('Note folders must be ordinary directories in the vault.')
    }
  }
  async prepare(input: Partial<NoteProposal> & { path: string; after: string; rationale: string }) {
    const target = await this.target(input.path)
    return {
      ...input,
      operation: input.operation || ('append' as const),
      expectedRevision: input.expectedRevision ?? (target.exists ? hash(target.text) : '')
    }
  }
  patch(original: string, proposal: NoteProposal): string {
    if (proposal.operation === 'replace') {
      if (
        !proposal.before ||
        original.indexOf(proposal.before) < 0 ||
        original.indexOf(proposal.before) !== original.lastIndexOf(proposal.before)
      )
        throw new Error(
          `The replacement in ${proposal.path} is absent or ambiguous. Review it again.`
        )
      return original.replace(proposal.before, proposal.after)
    }
    if (!proposal.anchor)
      return `${original.trimEnd()}${original.trim() ? '\n\n' : ''}${proposal.after.trim()}\n`
    const lines = original.split('\n')
    const matches = markdownSections(original, '').filter((section) => section.anchor)
    const selected = matches.find((section) => section.anchor === proposal.anchor)
    if (!selected)
      throw new Error(`The section in ${proposal.path} has changed. Review the target again.`)
    const depth = (start: number) => /^#{1,6}/.exec(lines[start])![0].length
    const next = matches.find(
      (section) => section.start > selected.start && depth(section.start) <= depth(selected.start)
    )
    const at = next?.start ?? lines.length
    lines.splice(at, 0, '', proposal.after.trim(), '')
    return lines.join('\n')
  }
  async accept(
    ids: string[],
    appliedBy: 'learner' | 'model' = 'learner'
  ): Promise<{ saved: string[] }> {
    if (this.vault.status.indexing)
      throw new Error('Wait for indexing to finish before applying note changes.')
    const proposals = [...new Set(ids)].map((id) =>
      this.store.get<NoteProposal>('noteProposal', id)
    )
    if (
      proposals.some(
        (p) => !p || p.scope !== this.vault.scope || !['pending', 'conflict'].includes(p.status)
      )
    )
      throw new Error('Choose pending changes from the current vault.')
    const plans = new Map<
      string,
      {
        file: string
        before: string
        after: string
        exists: boolean
        ids: string[]
        revision: string
      }
    >()
    for (const p of proposals as NoteProposal[]) {
      let target = plans.get(p.path)
      if (!target) {
        const t = await this.target(p.path)
        target = {
          file: t.file,
          exists: t.exists,
          before: t.text,
          after: t.text,
          ids: [],
          revision: t.exists ? hash(t.text) : ''
        }
      }
      if (target.revision !== p.expectedRevision) {
        this.store.put('noteProposal', {
          ...p,
          status: 'conflict',
          updatedAt: new Date().toISOString()
        })
        throw new Error(`${p.path} changed after this proposal. Refresh and review its changes.`)
      }
      target.after = this.patch(target.after, p)
      target.ids.push(p.id)
      plans.set(p.path, target)
    }
    const backupDir = path.join(this.dataDir, 'note-backups')
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 })
    const written: typeof plans extends Map<string, infer T> ? T[] : never = []
    try {
      for (const [relative, plan] of plans) {
        // Check again immediately before each write; do not overwrite an external editor.
        const current = await this.target(relative)
        if ((current.exists ? hash(current.text) : '') !== plan.revision)
          throw new Error(`${relative} changed while applying the changes.`)
        const backup = path.join(backupDir, `${randomUUID()}.md`)
        await fs.writeFile(backup, plan.before, { mode: 0o600 })
        if (!plan.exists) plan.after = withNoteIdentity(plan.after)
        const temp = path.join(path.dirname(plan.file), `.noctua-${randomUUID()}.tmp`)
        await fs.writeFile(temp, plan.after, {
          mode: plan.exists ? (await fs.stat(plan.file)).mode : 0o600
        })
        try {
          const latest = await this.target(relative)
          if ((latest.exists ? hash(latest.text) : '') !== plan.revision)
            throw new Error(`${relative} changed while applying the changes.`)
          if (plan.exists) await fs.rename(temp, plan.file)
          else {
            await fs.link(temp, plan.file)
          } // No overwrite if another editor created it.
        } finally {
          await fs.rm(temp, { force: true })
        }
        written.push(plan)
        for (const id of plan.ids)
          this.store.put('noteBackup', {
            id,
            path: relative,
            backup,
            before: plan.before,
            afterRevision: hash(plan.after),
            existed: plan.exists,
            at: new Date().toISOString()
          })
      }
    } catch (error) {
      for (const plan of written.reverse()) {
        const current = await fs.readFile(plan.file, 'utf8').catch(() => null)
        if (current === plan.after) {
          if (plan.exists) await fs.writeFile(plan.file, plan.before)
          else await fs.unlink(plan.file)
          for (const id of plan.ids) this.store.remove('noteBackup', id)
        } else {
          for (const id of plan.ids) {
            const proposal = this.store.get<NoteProposal>('noteProposal', id)
            if (proposal)
              this.store.put('noteProposal', {
                ...proposal,
                status: 'conflict',
                updatedAt: new Date().toISOString()
              })
          }
        }
      }
      throw error
    }
    this.store.transaction(() => {
      for (const p of proposals as NoteProposal[]) {
        this.store.put('noteProposal', {
          ...p,
          status: 'accepted',
          appliedBy,
          updatedAt: new Date().toISOString()
        })
        for (const id of p.bitIds) {
          const bit = this.store.get<StudyBit>('bit', id)
          if (bit)
            this.store.put('bit', { ...bit, status: 'placed', updatedAt: new Date().toISOString() })
        }
      }
    })
    await this.vault.whenIdle()
    await this.vault.index()
    // A reviewed placement connects its actual new passage to the selected concepts.
    // This is source provenance, never new evidence of understanding.
    this.store.transaction(() => {
      for (const proposal of proposals as NoteProposal[]) {
        const plan = plans.get(proposal.path)!
        const offset = plan.after.lastIndexOf(proposal.after.trim())
        if (offset < 0) continue
        const startLine = plan.after.slice(0, offset).split('\n').length
        const endLine = startLine + proposal.after.trim().split('\n').length - 1
        const revision = hash(plan.after)
        const sources = this.store
          .documentChunks(this.vault.scope, proposal.path)
          .filter(
            (source) =>
              source.revision === revision &&
              source.startLine !== undefined &&
              source.endLine !== undefined &&
              source.startLine <= endLine &&
              source.endLine >= startLine
          )
        const conceptLinks: NonNullable<NoteBackup['conceptLinks']> = []
        for (const id of proposal.conceptIds) {
          const concept = this.store.get<Concept>('concept', id)
          if (!concept || concept.archived || concept.scope !== this.vault.scope) continue
          const added = sources.filter((source) => !concept.sourceIds?.includes(source.id))
          if (!added.length) continue
          this.store.put('concept', {
            ...concept,
            sourceIds: [...(concept.sourceIds || []), ...added.map((source) => source.id)],
            sources: [...(concept.sources || []), ...added],
            updatedAt: new Date().toISOString()
          })
          conceptLinks.push({ conceptId: id, sourceIds: added.map((source) => source.id) })
        }
        const backup = this.store.get<NoteBackup>('noteBackup', proposal.id)
        if (backup) this.store.put('noteBackup', { ...backup, sources, conceptLinks })
      }
    })
    return { saved: [...plans.keys()] }
  }
  async undo(id: string): Promise<void> {
    const backup = this.store.get<NoteBackup>('noteBackup', id)
    const proposal = this.store.get<NoteProposal>('noteProposal', id)
    if (!backup || !proposal || proposal.scope !== this.vault.scope)
      throw new Error('This accepted change has no available backup.')
    const current = await this.target(backup.path)
    if (hash(current.text) !== backup.afterRevision)
      throw new Error(
        'The note has changed since acceptance. Review its backup instead of overwriting those edits.'
      )
    if (backup.existed) await fs.writeFile(current.file, backup.before)
    else await fs.unlink(current.file)
    // A grouped file is reverted together; keep proposal statuses consistent with it.
    for (const sibling of this.store
      .all<typeof backup>('noteBackup')
      .filter((b) => b.path === backup.path && b.afterRevision === backup.afterRevision)) {
      const p = this.store.get<NoteProposal>('noteProposal', sibling.id)
      if (p)
        this.store.put('noteProposal', {
          ...p,
          status: 'rejected',
          updatedAt: new Date().toISOString()
        })
      for (const bitId of p?.bitIds || []) {
        const bit = this.store.get<StudyBit>('bit', bitId)
        if (bit)
          this.store.put('bit', {
            ...bit,
            status: bit.conceptIds.length ? 'linked' : 'inbox',
            updatedAt: new Date().toISOString()
          })
      }
      for (const link of sibling.conceptLinks || []) {
        const concept = this.store.get<Concept>('concept', link.conceptId)
        if (!concept) continue
        this.store.put('concept', {
          ...concept,
          sourceIds: concept.sourceIds?.filter((sourceId) => !link.sourceIds.includes(sourceId)),
          sources: concept.sources?.filter((source) => !link.sourceIds.includes(source.id)),
          updatedAt: new Date().toISOString()
        })
      }
      this.store.remove('noteBackup', sibling.id)
    }
    await this.vault.whenIdle()
    await this.vault.index()
  }
}
