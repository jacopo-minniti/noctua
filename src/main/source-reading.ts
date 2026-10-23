import { promises as fs } from 'node:fs'
import type { Source, SourceDocument } from '../shared/types'
import { hash } from './vault'
import { pdfTextEngine } from './pdf-text'

// The file has already passed Application.fileForSource's scope/containment checks.
export async function readSourceDocument(source: Source, file: string): Promise<SourceDocument> {
  const size = (await fs.stat(file)).size
  const limit =
    source.kind === 'pdf' || source.kind === 'image' ? 40 * 1024 * 1024 : 2 * 1024 * 1024
  if (size > limit)
    throw new Error('This source is too large for the in-app reader. Open its original instead.')
  const bytes = await fs.readFile(file)
  if (bytes.length > limit) throw new Error('This source is too large for the in-app reader.')
  const revision = hash(bytes)
  if (source.kind === 'image') return { revision, text: '[Image attachment; no extracted text.]' }
  if (source.kind === 'pdf') {
    const { extractText, getDocumentProxy } = await pdfTextEngine()
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    try {
      const { text } = await extractText(pdf, { mergePages: false })
      return { revision, text: '', pages: text }
    } finally {
      await pdf.cleanup()
    }
  }
  return { revision, text: bytes.toString('utf8') }
}

// Obsidian's open URI resolves the containing vault from an absolute path.
// Encoding the entire target preserves spaces, #, &, Unicode and heading syntax.
// https://obsidian.md/help/uri
export function obsidianSourceUri(file: string, source: Source): string {
  const location =
    source.kind === 'pdf' && source.page
      ? `#page=${source.page}`
      : source.heading
        ? `#${source.heading}`
        : ''
  return `obsidian://open?path=${encodeURIComponent(file + location)}`
}
