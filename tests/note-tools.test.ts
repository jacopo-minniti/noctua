import { afterEach, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseYaml } from 'yaml'
import { Store } from '../src/main/store'
import { Vault } from '../src/main/vault'
import { NoteEditor } from '../src/main/note-writing'
import { studyTools } from '../src/main/pi'
import type { NoteProposal } from '../src/shared/types'
const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-note-tools-'))
  directories.push(directory)
  const root = path.join(directory, 'vault')
  await fs.mkdir(root)
  const store = new Store(':memory:')
  store.settings = {
    ...store.settings,
    vaultPath: root,
    embeddings: { ...store.settings.embeddings, enabled: false }
  }
  store.put('conversation', { id: 'chat', title: 'Note work', createdAt: 'now', updatedAt: 'now' })
  const vault = new Vault(store, () => {})
  const notes = new NoteEditor(store, vault, path.join(directory, 'profile'))
  const tools = studyTools(store, vault, 'chat', new Map(), () => {}, { notes })
  const invoke = async (name: string, args: unknown) => {
    const result = await tools
      .find((tool) => tool.name === name)!
      .execute('call', args as never, undefined, undefined, {} as never)
    return JSON.parse(result.content.find((item) => item.type === 'text')!.text)
  }
  return { root, store, vault, notes, invoke }
}
it('creates and edits notes directly, retains model origin/backups, checks revision and supports undo', async () => {
  const { root, store, notes, invoke } = await fixture()
  try {
    const created = await invoke('create_note', {
      path: 'Topic/Idea.md',
      content: '# Idea\n\nAn assistant contribution.',
      rationale: 'Requested topic explanation.'
    })
    const original = await fs.readFile(path.join(root, 'Topic/Idea.md'), 'utf8')
    expect(original).toContain('noctua-id:')
    expect(store.get<NoteProposal>('noteProposal', created.changeId)?.appliedBy).toBe('model')
    await expect(
      invoke('create_note', { path: 'Topic/Idea.md', content: 'Overwrite', rationale: 'No' })
    ).rejects.toThrow('already exists')
    await expect(
      invoke('edit_note', {
        path: 'Topic/Idea.md',
        expectedRevision: 'guessed',
        operation: 'append',
        after: 'Add',
        rationale: 'No'
      })
    ).rejects.toThrow('Read the current note')
    const read = await invoke('read_note', { path: 'Topic/Idea.md' })
    const edited = await invoke('edit_note', {
      path: read.path,
      expectedRevision: read.revision,
      operation: 'replace',
      before: 'An assistant contribution.',
      after: 'A clearer assistant contribution.',
      rationale: 'Requested refinement.'
    })
    expect(await fs.readFile(path.join(root, read.path), 'utf8')).toContain('clearer assistant')
    await notes.undo(edited.changeId)
    expect(await fs.readFile(path.join(root, read.path), 'utf8')).toBe(original)
    const reread = await invoke('read_note', { path: read.path })
    await fs.writeFile(path.join(root, read.path), original + 'An external edit.\n')
    await expect(
      invoke('edit_note', {
        path: read.path,
        expectedRevision: reread.revision,
        operation: 'append',
        after: 'A conflicting addition.',
        rationale: 'Conflict.'
      })
    ).rejects.toThrow('changed after')
    expect(await fs.readFile(path.join(root, read.path), 'utf8')).toContain('An external edit.')
  } finally {
    store.close()
  }
})
it('rejects traversal, symlink folders and automatic assessment or identity changes', async () => {
  const { root, store, invoke } = await fixture()
  try {
    await expect(
      invoke('create_note', { path: '../outside.md', content: 'No', rationale: 'No' })
    ).rejects.toThrow('inside the vault')
    await fs.symlink(path.dirname(root), path.join(root, 'shortcut'))
    await expect(
      invoke('create_note', { path: 'shortcut/outside.md', content: 'No', rationale: 'No' })
    ).rejects.toThrow('ordinary directories')
    await expect(
      invoke('create_note', { path: 'Rank.md', content: '#transfer', rationale: 'No' })
    ).rejects.toThrow('only the learner')
    expect(store.all<NoteProposal>('noteProposal').at(-1)?.status).toBe('rejected')
    await fs.writeFile(
      path.join(root, 'Learner.md'),
      '---\nnoctua-id: stable\n---\n\n# Learner #knowledge\n\nMy explanation.\n'
    )
    const read = await invoke('read_note', { path: 'Learner.md' })
    await expect(
      invoke('edit_note', {
        path: read.path,
        expectedRevision: read.revision,
        operation: 'replace',
        before: '#knowledge',
        after: '#transfer',
        rationale: 'No'
      })
    ).rejects.toThrow('only the learner')
    expect(await fs.readFile(path.join(root, 'Learner.md'), 'utf8')).toContain('#knowledge')
    await fs.writeFile(
      path.join(root, 'Metadata.md'),
      '---\n"noctua-id": stable\ntags: [knowledge, topic]\n---\n\nMy explanation.\n'
    )
    const metadata = await invoke('read_note', { path: 'Metadata.md' })
    for (const [before, after] of [
      ['knowledge', 'transfer'],
      ['stable', 'another-id']
    ]) {
      await expect(
        invoke('edit_note', {
          path: metadata.path,
          expectedRevision: metadata.revision,
          operation: 'replace',
          before,
          after,
          rationale: 'No'
        })
      ).rejects.toThrow('only the learner')
    }
  } finally {
    store.close()
  }
})

it('creates one valid frontmatter block while preserving custom note metadata', async () => {
  const { root, store, notes, invoke } = await fixture()
  try {
    const created = await invoke('create_note', {
      path: 'Metadata.md',
      content: '---\ntitle: An idea\ntags: [topic]\n---\n\n# An idea\n\nAn explanation.',
      rationale: 'Requested new note.'
    })
    const text = await fs.readFile(path.join(root, 'Metadata.md'), 'utf8')
    const metadata = parseYaml(text.match(/^---\n([\s\S]*?)\n---/)![1])
    expect(metadata).toMatchObject({ title: 'An idea', tags: ['topic'] })
    expect(metadata['noctua-id']).toBeTruthy()
    expect(text.match(/^---$/gm)).toHaveLength(2)
    await notes.undo(created.changeId)
    await expect(fs.stat(path.join(root, 'Metadata.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    store.close()
  }
})
