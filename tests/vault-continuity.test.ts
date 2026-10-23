import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../src/main/store'
import { hash, Vault } from '../src/main/vault'
import { NoteEditor } from '../src/main/note-writing'
import { StudyService } from '../src/main/study'
import { Application } from '../src/main/application'
import type { Concept, Conversation, NoteProposal, StudyBit } from '../src/shared/types'
const cleanup: { root: string; store: Store; vault: Vault }[] = []
afterEach(async () => {
  for (const item of cleanup.splice(0)) {
    item.vault.stopWatching()
    item.store.close()
    await rm(item.root, { recursive: true, force: true })
  }
})
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'noctua-continuity-'))
  const folder = path.join(root, 'vault')
  await mkdir(folder)
  const store = new Store(':memory:')
  store.settings = {
    ...store.settings,
    vaultPath: folder,
    embeddings: { ...store.settings.embeddings, enabled: false }
  }
  const vault = new Vault(store, () => {})
  cleanup.push({ root, store, vault })
  const chat: Conversation = {
    id: 'chat',
    title: 'Study',
    createdAt: '2026-10-04',
    updatedAt: '2026-10-04'
  }
  store.put('conversation', chat)
  return {
    root,
    folder,
    store,
    vault,
    editor: new NoteEditor(store, vault, root),
    study: new StudyService(store)
  }
}
describe('vault identities, cache and learner-reviewed changes', () => {
  it('preserves concept history and historical citation identity through file and title renames', async () => {
    const { folder, store, vault } = await setup()
    await writeFile(path.join(folder, 'Old.md'), '# Old\n\nEigenvectors preserve a line.\n')
    await vault.index()
    const original = store.all<Concept>('concept')[0],
      source = store.chunks([vault.scope])[0]
    store.put('concept', {
      ...original,
      level: 'comprehension',
      facets: [{ id: 'direction', title: 'Direction' }]
    })
    await rename(path.join(folder, 'Old.md'), path.join(folder, 'New.md'))
    await writeFile(path.join(folder, 'New.md'), '# New\n\nEigenvectors preserve a line.\n')
    await vault.index()
    const updated = store.all<Concept>('concept').find((c) => !c.archived)!
    expect(updated.id).toBe(original.id)
    expect(updated.level).toBe('comprehension')
    expect(updated.facets?.[0].id).toBe('direction')
    expect(vault.pathForSource(source)).toBe('New.md')
    expect(store.chunks([vault.scope])[0].documentId).toBe(source.documentId)
  })
  it('clears only the selected vault cache and preserves history, sources and note identities', async () => {
    const { folder, store, vault } = await setup()
    const file = path.join(folder, 'Notes.md')
    const text = '# Notes\n\nAn explanation.\n'
    await writeFile(file, text)
    await vault.index()
    const source = store.chunks([vault.scope])[0]
    const concepts = store.all<Concept>('concept')
    store.put('message', { id: 'saved', sources: [source] })
    store.replaceDocument('attachments:chat', 'Notes.md', 'v1', 'Attachment', 'text', [
      { ...source, id: 'attachment', scope: 'attachments:chat' }
    ])
    const records = store.db.prepare('SELECT * FROM records').all()
    vault.status.indexing = true
    expect(() => vault.clearCache()).toThrow('Wait for indexing')
    expect(store.source(source.id)).toBeTruthy()
    vault.status.indexing = false
    vault.clearCache()
    expect(vault.status.chunks).toBe(0)
    expect(vault.status.documents).toBe(0)
    expect(vault.status.lastIndexedAt).toBeNull()
    expect(store.source('attachment')).toBeTruthy()
    expect(store.resolveSource(source.id)).toEqual({ ...source, historical: true })
    expect(store.db.prepare('SELECT * FROM records').all()).toEqual(records)
    expect(await readFile(file, 'utf8')).toBe(text)
    vault.watch()
    vault.queueReindex()
    await new Promise((resolve) => setTimeout(resolve, 850))
    expect(store.chunks([vault.scope])).toEqual([])
    await vault.index()
    expect(store.chunks([vault.scope])).toHaveLength(1)
    expect(store.all<Concept>('concept').map((c) => c.id)).toEqual(concepts.map((c) => c.id))
    expect(store.meta(`cache-cleared:${vault.scope}`, true)).toBe(false)
  })
  it('retains vectors only for unchanged text across source revisions', async () => {
    const { folder, store, vault } = await setup()
    const file = path.join(folder, 'Notes.md')
    await writeFile(file, '# Notes\n\nOne explanation.\n\n## Stable\n\nPreserved passage.\n')
    await vault.index()
    const stable = store.chunks([vault.scope]).find((s) => s.heading === 'Stable')!
    store.db
      .prepare('UPDATE chunks SET vector=?,embedding_key=? WHERE id=?')
      .run(new Uint8Array(new Float32Array([1, 0]).buffer), 'test', stable.id)
    await writeFile(file, '# Notes\n\nAn updated explanation.\n\n## Stable\n\nPreserved passage.\n')
    await vault.index()
    const current = store.chunks([vault.scope]).find((s) => s.heading === 'Stable')!
    expect(current.id).not.toBe(stable.id)
    expect(
      store.db.prepare('SELECT vector FROM chunks WHERE id=?').get(current.id)?.vector
    ).toBeTruthy()
    expect(
      store.db
        .prepare('SELECT vector FROM chunks WHERE id=?')
        .get(store.chunks([vault.scope])[0].id)?.vector
    ).toBeNull()
  })
  it('does not merge a copied portable note ID or a replacement into old history', async () => {
    const { folder, store, vault } = await setup()
    const original = '---\nnoctua-id: alpha\n---\n\n# Note\n\nA concept.\n'
    await writeFile(path.join(folder, 'One.md'), original)
    await vault.index()
    const first = store.chunks([vault.scope])[0].documentId
    await writeFile(path.join(folder, 'Two.md'), original)
    await vault.index()
    expect(new Set(store.chunks([vault.scope]).map((s) => s.documentId)).size).toBe(2)
    await writeFile(path.join(folder, 'One.md'), original.replace('alpha', 'beta'))
    await vault.index()
    expect(store.documentChunks(vault.scope, 'One.md')[0].documentId).not.toBe(first)
  })
  it('applies selected proposals together, preserves authored notes, recaches and can undo the group', async () => {
    const { folder, store, vault, editor, study } = await setup()
    const file = path.join(folder, 'Notes.md'),
      original = '# Notes\n\nMy explanation.\n'
    await writeFile(file, original)
    await vault.index()
    const oldSource = store.documentChunks(vault.scope, 'Notes.md')[0]
    const target = study.saveConcept(vault.scope, { title: 'Retries', sourceIds: [oldSource.id] })
    const bit = study.captureBit(vault.scope, 'chat', {
      text: 'A learner-authored addition.',
      conceptIds: [target.id]
    })
    const revision = hash(original)
    const first = study.proposeNote(vault.scope, 'chat', {
      path: 'Notes.md',
      expectedRevision: revision,
      operation: 'append',
      after: bit.text,
      rationale: 'Add my explanation',
      bitIds: [bit.id],
      conceptIds: bit.conceptIds
    })
    const second = study.proposeNote(vault.scope, 'chat', {
      path: 'Notes.md',
      expectedRevision: revision,
      operation: 'append',
      after: 'A second thought.',
      rationale: 'Add related thought'
    })
    expect(await readFile(file, 'utf8')).toBe(original)
    await editor.accept([first.id, second.id])
    const updated = await readFile(file, 'utf8')
    expect(updated).toContain('My explanation.')
    expect(updated).toContain(bit.text)
    expect(store.get<StudyBit>('bit', bit.id)?.status).toBe('placed')
    expect(
      store.documentChunks(vault.scope, 'Notes.md').some((s) => s.text.includes(bit.text))
    ).toBe(true)
    const linked = store.get<Concept>('concept', target.id)!
    expect(linked.sources?.some((source) => source.text.includes(bit.text))).toBe(true)
    expect(linked.sourceIds).toContain(oldSource.id)
    expect(linked.level).toBeNull()
    await editor.undo(first.id)
    expect(await readFile(file, 'utf8')).toBe(original)
    expect(store.get<NoteProposal>('noteProposal', second.id)?.status).toBe('rejected')
    expect(store.get<StudyBit>('bit', bit.id)?.status).toBe('linked')
    expect(store.get<Concept>('concept', target.id)?.sourceIds).toEqual([oldSource.id])
  })
  it('preflights the entire group before writing and refuses changed notes and escaping paths', async () => {
    const { folder, store, vault, editor, study } = await setup()
    const original = '# Notes\n\nOriginal.\n'
    await writeFile(path.join(folder, 'A.md'), original)
    await writeFile(path.join(folder, 'B.md'), original)
    await vault.index()
    const proposals = ['A.md', 'B.md'].map((p) =>
      study.proposeNote(vault.scope, 'chat', {
        path: p,
        expectedRevision: hash(original),
        operation: 'append',
        after: 'Addition.',
        rationale: 'My addition'
      })
    )
    await writeFile(path.join(folder, 'B.md'), original + 'External edit.')
    await expect(editor.accept(proposals.map((p) => p.id))).rejects.toThrow('changed')
    expect(await readFile(path.join(folder, 'A.md'), 'utf8')).toBe(original)
    expect(store.get<NoteProposal>('noteProposal', proposals[1].id)?.status).toBe('conflict')
    await expect(editor.target('../outside.md')).rejects.toThrow('inside')
    await expect(editor.target('.obsidian/config.md')).rejects.toThrow('inside')
  })
  it('places section additions against the same Markdown anchors as retrieval, ignoring fenced examples', async () => {
    const { folder, vault, editor, study } = await setup()
    const original =
      '# Notes\n\n```md\n## API::limits\nAn example heading.\n```\n\n## API::limits #knowledge\nMy scoped explanation.\n\n### Retries\nA related detail.\n\n## Next\nKeep this separate.\n'
    const file = path.join(folder, 'Notes.md')
    await writeFile(file, original)
    await vault.index()
    const proposal = study.proposeNote(vault.scope, 'chat', {
      path: 'Notes.md',
      anchor: 'API::limits',
      expectedRevision: hash(original),
      operation: 'append',
      after: 'A learner-added constraint.',
      rationale: 'Add to the actual section, preserving the code example.'
    })
    await editor.accept([proposal.id])
    const updated = await readFile(file, 'utf8')
    expect(updated).toContain('```md\n## API::limits\nAn example heading.\n```')
    expect(updated.indexOf('A learner-added constraint.')).toBeGreaterThan(
      updated.indexOf('A related detail.')
    )
    expect(updated.indexOf('A learner-added constraint.')).toBeLessThan(updated.indexOf('## Next'))
  })
  it('coalesces watched external edits and leaves durable learning records intact', async () => {
    const { folder, store, vault } = await setup()
    const file = path.join(folder, 'Notes.md')
    await writeFile(file, '# Notes\n\nOriginal.')
    await vault.index()
    const concept = store.all<Concept>('concept')[0]
    vault.watch()
    await writeFile(file, '# Notes\n\nUpdated one.')
    await writeFile(file, '# Notes\n\nUpdated two.')
    await expect
      .poll(() => store.chunks([vault.scope]).some((s) => s.text.includes('Updated two')), {
        timeout: 5000
      })
      .toBe(true)
    expect(store.get<Concept>('concept', concept.id)?.archived).toBe(false)
  })
  it('finishes a learner-approved write and recache before closing durable storage', async () => {
    const { root, folder } = await setup()
    const profile = path.join(root, 'profile')
    await mkdir(profile)
    const app = new Application(
      profile,
      {
        chooseDirectory: async () => folder,
        chooseFiles: async () => [],
        chooseExport: async () => null,
        openFile: async () => {},
        openLink: async () => {}
      },
      () => {},
      { encrypt: () => null, decrypt: (value) => value }
    )
    app.store.settings = {
      ...app.store.settings,
      vaultPath: folder,
      embeddings: { ...app.store.settings.embeddings, enabled: false }
    }
    const file = path.join(folder, 'Notes.md'),
      original = '# Notes\n\nMy original reasoning.\n'
    await writeFile(file, original)
    await app.vault.index()
    const scope = app.vault.scope
    const chat = (await app.request({ action: 'newChat' })) as Conversation
    const proposal = (await app.request({
      action: 'proposeNote',
      conversationId: chat.id,
      proposal: {
        path: 'Notes.md',
        after: 'An accepted addition.',
        rationale: 'My own clarification.'
      }
    })) as NoteProposal
    try {
      const writing = app.request({
        action: 'reviewNotes',
        proposalIds: [proposal.id],
        decision: 'accept'
      })
      await Promise.all([writing, app.close()])
      expect(await readFile(file, 'utf8')).toContain('An accepted addition.')
      const reopened = new Store(path.join(profile, 'noctua.sqlite'))
      try {
        expect(reopened.get<NoteProposal>('noteProposal', proposal.id)?.status).toBe('accepted')
        expect(
          reopened
            .documentChunks(scope, 'Notes.md')
            .some((source) => source.text.includes('An accepted addition.'))
        ).toBe(true)
      } finally {
        reopened.close()
      }
    } finally {
      await app.close()
    }
  })
})
