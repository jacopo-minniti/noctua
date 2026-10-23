import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Source } from '../shared/types'
import type { Store } from './store'
import type { Vault } from './vault'

async function publicUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Import a public HTTPS PDF, Markdown, or text resource.')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true })
  if (
    !addresses.length ||
    addresses.some(({ address }) =>
      /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::|f[cd]|fe[89ab]|::ffff:)/i.test(
        address
      )
    )
  )
    throw new Error('Local and private network resources cannot be imported from the web.')
  return url
}

/** Explicit user import only. Search results cannot write files by themselves. */
export async function importWebResource(
  store: Store,
  vault: Vault,
  dataDir: string,
  conversationId: string,
  raw: string,
  title?: string
): Promise<Source[]> {
  let url = await publicUrl(raw)
  let response: Response | undefined
  for (let redirects = 0; redirects < 5; redirects++) {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The resource redirected without a destination.')
      url = await publicUrl(new URL(location, url).href)
      continue
    }
    break
  }
  if (!response?.ok || !response.body)
    throw new Error(`Could not import this resource (${response?.status ?? 'unavailable'}).`)
  const mime = response.headers.get('content-type')?.split(';')[0]
  const ext =
    mime === 'application/pdf'
      ? '.pdf'
      : mime === 'text/markdown'
        ? '.md'
        : mime === 'text/plain'
          ? '.txt'
          : path.extname(url.pathname).toLowerCase()
  if (!['.pdf', '.md', '.txt'].includes(ext) || mime?.includes('html'))
    throw new Error(
      'Import a direct PDF, Markdown, or text link. HTML pages can be read in your browser.'
    )
  if (Number(response.headers.get('content-length')) > 40 * 1024 * 1024)
    throw new Error('Web imports are limited to 40 MB.')
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 40 * 1024 * 1024) throw new Error('Web imports are limited to 40 MB.')
      parts.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = Buffer.concat(parts)
  if (ext === '.pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    throw new Error('The downloaded resource is not a PDF.')
  const display =
    title?.trim() || decodeURIComponent(path.basename(url.pathname, ext)) || 'Web resource'
  const relative = `${randomUUID().slice(0, 8)}-${display.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'resource'}${ext}`
  const directory = path.join(dataDir, 'resources')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, relative),
    scope = `attachments:${conversationId}`
  await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
  try {
    const chunks = (await vault.indexFile(scope, relative, file, display)).map((source) => ({
      ...source,
      url: url.href
    }))
    store.replaceDocument(
      scope,
      relative,
      chunks[0]?.revision || '',
      display,
      ext === '.pdf' ? 'pdf' : ext === '.md' ? 'markdown' : 'text',
      chunks
    )
    store.setMeta(`attachment-file:${scope}:${relative}`, file)
    store.put('resourceImport', {
      id: randomUUID(),
      scope,
      path: relative,
      url: url.href,
      requestedUrl: raw,
      importedAt: new Date().toISOString(),
      revision: chunks[0]?.revision
    })
    await vault.embedMissing(scope)
    return chunks
  } catch (error) {
    await fs.rm(file, { force: true })
    throw error
  }
}
