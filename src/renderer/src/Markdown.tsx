import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { remarkWikiLinks } from './wiki-links'
import { remarkDisplayMath } from './display-math'
import { remarkLatexMath } from './latex-math'
import type { Source } from '../../shared/types'

const locatedBlocks: Components = {
  p: ({ node, children, ...props }) => (
    <p {...props} data-source-line={node?.position?.start.line}>
      {children}
    </p>
  ),
  li: ({ node, children, ...props }) => (
    <li {...props} data-source-line={node?.position?.start.line}>
      {children}
    </li>
  ),
  pre: ({ node, children, ...props }) => (
    <pre {...props} data-source-line={node?.position?.start.line}>
      {children}
    </pre>
  )
}
export function Markdown({
  text,
  sources = [],
  onSource,
  documentSource
}: {
  text: string
  sources?: Source[]
  onSource?: (source: Source) => void
  documentSource?: Source
}) {
  const [linkError, setLinkError] = useState('')
  // A stable component type keeps lazy images mounted during parent refreshes and selection.
  const renderImage = useMemo(
    () =>
      ({ alt, src }: { alt?: string; src?: string }) =>
        documentSource && src ? (
          <SourceImage source={documentSource} reference={src} alt={alt || 'Source image'} />
        ) : (
          <span className="muted">
            [{alt || 'Source image'} — open the original resource to view]
          </span>
        ),
    [documentSource?.id]
  )
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkLatexMath,
          remarkDisplayMath,
          ...(documentSource ? [remarkWikiLinks] : [])
        ]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        urlTransform={(url) =>
          url.startsWith('noctua-source:') || (documentSource && url.startsWith('noctua-note:'))
            ? url
            : documentSource && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)
              ? url
              : defaultUrlTransform(url)
        }
        components={{
          ...locatedBlocks,
          h1: ({ node, children }) => (
            <h1 data-source-line={node?.position?.start.line}>{children}</h1>
          ),
          h2: ({ node, children }) => (
            <h2 data-source-line={node?.position?.start.line}>{children}</h2>
          ),
          h3: ({ node, children }) => (
            <h3 data-source-line={node?.position?.start.line}>{children}</h3>
          ),
          h4: ({ node, children }) => (
            <h4 data-source-line={node?.position?.start.line}>{children}</h4>
          ),
          h5: ({ node, children }) => (
            <h5 data-source-line={node?.position?.start.line}>{children}</h5>
          ),
          h6: ({ node, children }) => (
            <h6 data-source-line={node?.position?.start.line}>{children}</h6>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith('noctua-source:')) {
              const source = sources.find(
                (source) => source.id === href.slice('noctua-source:'.length)
              )
              return source ? (
                <button className="citation-link" onClick={() => onSource?.(source)}>
                  {children}
                </button>
              ) : (
                <span title="This reference could not be verified.">
                  {children} (unresolved reference)
                </span>
              )
            }
            if (
              documentSource &&
              href &&
              (href.startsWith('noctua-note:') || !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href))
            ) {
              const reference = href.startsWith('noctua-note:')
                ? decodeURIComponent(href.slice('noctua-note:'.length))
                : href
              return (
                <button
                  className="citation-link"
                  onClick={() => {
                    void window.noctua
                      .request<Source>({ action: 'sourceLink', source: documentSource, reference })
                      .then((source) => onSource?.(source))
                      .catch((error: unknown) =>
                        setLinkError(
                          error instanceof Error
                            ? error.message.replace(
                                /^Error invoking remote method '[^']+': Error: /,
                                ''
                              )
                            : 'This note link could not be opened.'
                        )
                      )
                  }}
                >
                  {children}
                </button>
              )
            }
            return href && /^https?:/.test(href) ? (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  void window.noctua.request({ action: 'openLink', url: href })
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            )
          },
          img: renderImage
        }}
      >
        {text}
      </ReactMarkdown>
      {linkError && (
        <p className="source-warning" role="alert">
          {linkError}
        </p>
      )}
    </div>
  )
}

function SourceImage({
  source,
  reference,
  alt
}: {
  source: Source
  reference: string
  alt: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError('')
    void window.noctua
      .request<string>({ action: 'sourceAsset', source, reference })
      .then((value) => {
        if (!cancelled) setUrl(value)
      })
      .catch(() => {
        if (!cancelled) setError('Image unavailable — open the original source.')
      })
    return () => {
      cancelled = true
    }
  }, [source.id, reference])
  return url ? (
    <img src={url} alt={alt} loading="lazy" />
  ) : (
    <span className="muted">{error || `Loading ${alt}…`}</span>
  )
}
