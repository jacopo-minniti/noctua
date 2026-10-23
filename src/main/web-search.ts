import { callExaMcp } from 'pi-web-access/exa'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Type } from '@earendil-works/pi-ai'
import { z } from 'zod'

/** The existing Pi extension owns search transport; Noctua only bounds and labels its results. */
export interface WebResource {
  title: string
  url: string
  excerpt: string
  publishedAt?: string
  format: 'pdf' | 'web'
  provider: 'exa'
  inspected: 'search-excerpt'
}
export type ExaSearchTransport = typeof callExaMcp

function publicResultUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      ['localhost', '[::1]', '0.0.0.0'].includes(hostname) ||
      hostname.startsWith('127.') ||
      hostname.endsWith('.local')
    )
      return null
    return url.href
  } catch {
    return null
  }
}

/** Exa's basic MCP search returns Title/URL/Text blocks; some versions return JSON. */
export function normalizeWebResources(payload: string, limit = 6): WebResource[] {
  const bounded = payload.slice(0, 180000)
  let raw: Record<string, unknown>[] = []
  try {
    const parsed = JSON.parse(bounded) as { results?: unknown }
    if (Array.isArray(parsed.results))
      raw = parsed.results.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === 'object'
      )
  } catch {
    // The existing extension's keyless tool usually returns human-readable blocks.
  }
  if (!raw.length)
    raw = bounded
      .split(/(?=^Title: )/m)
      .filter((block) => block.trim())
      .slice(0, 40)
      .map((block) => ({
        title: block.match(/^Title:\s*(.+)/m)?.[1],
        url: block.match(/^URL:\s*(.+)/m)?.[1],
        publishedDate: block.match(/^(?:Published Date|Published):\s*(.+)/m)?.[1],
        text:
          block
            .match(/\n(?:Text|Highlights|Content):\s*([\s\S]*)/)?.[1]
            ?.replace(/\n---\s*$/, '') || ''
      }))
  const result: WebResource[] = []
  const seen = new Set<string>()
  for (const entry of raw.slice(0, 40)) {
    const url = publicResultUrl(entry.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const excerpt =
      typeof entry.text === 'string'
        ? entry.text
        : Array.isArray(entry.highlights)
          ? entry.highlights.filter((value) => typeof value === 'string').join('\n')
          : ''
    result.push({
      url,
      title: (typeof entry.title === 'string' ? entry.title : new URL(url).hostname).slice(0, 400),
      excerpt: excerpt.slice(0, 2200),
      publishedAt:
        typeof entry.publishedDate === 'string' ? entry.publishedDate.slice(0, 100) : undefined,
      format: /\.pdf(?:$|[?#])/i.test(url) ? 'pdf' : 'web',
      provider: 'exa',
      inspected: 'search-excerpt'
    })
    if (result.length >= Math.max(1, Math.min(limit, 8))) break
  }
  return result
}

export async function searchWeb(
  query: string,
  options: { limit?: number; domains?: string[]; pdfOnly?: boolean; signal?: AbortSignal } = {},
  transport: ExaSearchTransport = callExaMcp
): Promise<WebResource[]> {
  const validated = z
    .object({
      query: z.string().trim().min(1).max(1000),
      limit: z.number().int().min(1).max(8).default(6),
      domains: z
        .array(z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i))
        .max(4)
        .default([]),
      pdfOnly: z.boolean().default(false)
    })
    .parse({ query, ...options })
  options.signal?.throwIfAborted()
  const queryText = [
    validated.query,
    ...(validated.domains.length
      ? [`(${validated.domains.map((domain) => `site:${domain}`).join(' OR ')})`]
      : []),
    ...(validated.pdfOnly ? ['filetype:pdf'] : [])
  ].join(' ')
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(25000)])
    : AbortSignal.timeout(25000)
  const payload = await transport(
    'web_search_exa',
    { query: queryText, numResults: validated.limit },
    signal
  )
  signal.throwIfAborted()
  return normalizeWebResources(payload, validated.limit)
}

export function webSearchTools(enabled: boolean): ToolDefinition[] {
  if (!enabled) return []
  return [
    defineTool({
      name: 'web_search',
      label: 'Finding web resources',
      description:
        'Discover public papers, textbooks, and official documentation through the existing Pi web-access Exa integration. Sends a concise topic query to Exa; never send private vault text or learner answers. Returns URLs and search excerpts, not proof of a full source review. No downloads, local files, browser, or model-provider fallback.',
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 1000 }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
        domains: Type.Optional(Type.Array(Type.String(), { maxItems: 4 })),
        pdfOnly: Type.Optional(Type.Boolean())
      }),
      async execute(_id, params, signal) {
        const resources = await searchWeb(params.query, { ...params, signal })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                resources,
                note: 'Untrusted search excerpts. Verify the actual resource before asserting its findings. Importing a PDF is a separate learner action.',
                provider: 'exa',
                fetchedAt: new Date().toISOString()
              })
            }
          ],
          details: { resources }
        }
      }
    })
  ]
}
