import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, Plus, RefreshCw } from 'lucide-react'
import type { Request, Source, SourceDetail, SourceHighlight } from '../../shared/types'
import { SelectionToChat, type SelectionActions } from './SelectionToChat'
import { Markdown } from './Markdown'
import { ImageReader } from './ImageReader'
import { PdfReader } from './PdfReader'

type Call = <T = unknown>(request: Request) => Promise<T | null>
export function SourceReader({
  source,
  call,
  onClose,
  onSelect,
  onSource,
  onAdd,
  chatTargets,
  highlights = [],
  refresh,
  onCapture,
  focusQuote,
  hasCitedPassage = false
}: SelectionActions & {
  source: Source
  call: Call
  onClose: () => void
  onSelect: () => void
  onSource: (source: Source) => void
  highlights?: SourceHighlight[]
  refresh?: () => Promise<void>
  focusQuote?: string
  hasCitedPassage?: boolean
}) {
  const [detail, setDetail] = useState<SourceDetail | null>(null)
  const [passage, setPassage] = useState(false)
  const [reload, setReload] = useState(0)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    setDetail(null)
    void call<SourceDetail>({ action: 'sourceDocument', source }).then((result) => {
      if (cancelled) return
      setDetail(
        result || {
          source,
          stale: false,
          missing: false,
          document: null,
          error: 'Could not read the current document.'
        }
      )
      setPassage(!result?.document || result.stale)
    })
    return () => {
      cancelled = true
    }
  }, [source.id, reload, call])
  useEffect(() => {
    const container = content.current
    if (!container || !detail || passage) return
    const headings = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line]'))
    const line = source.startLine || 1
    const target = source.page
      ? container.querySelector<HTMLElement>(`[data-page="${source.page}"]`)
      : headings.filter((element) => Number(element.dataset.sourceLine) <= line).at(-1)
    container.scrollTop = target
      ? target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      : 0
  }, [detail, passage, source.id])
  useEffect(() => {
    const container = content.current
    if (!container) return
    container
      .querySelectorAll('.focus-source-passage')
      .forEach((element) => element.classList.remove('focus-source-passage'))
    if (!focusQuote || source.kind === 'pdf') return
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
    const elements = Array.from(container.querySelectorAll<HTMLElement>('p,li,pre,blockquote'))
    const target = elements.find((element) =>
      normalize(element.textContent || '').includes(normalize(focusQuote))
    )
    if (target) {
      target.classList.add('focus-source-passage')
      container.scrollTop = target.offsetTop - container.offsetTop - 24
    }
  }, [detail, passage, focusQuote, source.id])
  return (
    <section
      className={`source-reader ${source.kind === 'pdf' || source.kind === 'image' ? 'visual-source-reader' : ''}`}
      title={`${source.title} · Revision ${detail?.document?.revision || source.revision}`}
    >
      <div className="reader-toolbar">
        <div className="reader-heading">
          <button
            className="icon-button"
            title="Back to study desk"
            aria-label="Back to study desk"
            onClick={onClose}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3>{source.title}</h3>
            <small>{source.path}</small>
          </div>
          <button
            className="icon-button"
            title="Reload source"
            aria-label="Reload source"
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="reader-actions">
          <button
            className="text-button"
            title={source.scope.startsWith('vault:') ? 'Open source in Obsidian' : 'Open original'}
            disabled={!detail || detail.missing}
            onClick={() => {
              void call({ action: 'openOriginal', source })
            }}
          >
            <ExternalLink size={14} />
            {source.scope.startsWith('vault:') ? 'Open source in Obsidian' : 'Open original'}
          </button>
          <button
            className="text-button"
            title={hasCitedPassage ? 'Use cited passage' : 'Use source in chat'}
            onClick={onSelect}
          >
            <Plus size={14} />
            {hasCitedPassage ? 'Use cited passage' : 'Use source in chat'}
          </button>
        </div>
        <div className="reader-tabs">
          <button
            disabled={!detail?.document}
            className={!passage ? 'active' : ''}
            onClick={() => setPassage(false)}
          >
            Full source
          </button>
          {hasCitedPassage && (
            <button className={passage ? 'active' : ''} onClick={() => setPassage(true)}>
              Cited passage
            </button>
          )}
        </div>
      </div>
      {detail?.stale && (
        <p className="source-warning">
          The original has changed. The cited passage preserves the earlier revision; Full source
          shows the current document.
        </p>
      )}
      {detail?.missing && (
        <p className="source-warning">
          The original is missing. The saved passage is still available.
        </p>
      )}
      {detail?.error && <p className="source-warning">{detail.error}</p>}
      <div className="reader-location">
        {passage
          ? `Saved revision ${source.revision.slice(0, 10)}`
          : detail?.document
            ? `Current revision ${detail.document.revision.slice(0, 10)}`
            : 'Loading…'}
        {source.heading && (passage || source.kind !== 'pdf') && ` · ${source.heading}`}
      </div>
      <div className="source-reader-document" ref={content}>
        <SelectionToChat
          origin={{
            sourceId: source.id,
            view: passage ? 'passage' : 'document',
            label: source.title,
            revision: passage ? source.revision : detail?.document?.revision,
            page: passage ? source.page : undefined
          }}
          onAdd={onAdd}
          chatTargets={chatTargets}
          onCapture={onCapture}
          onHighlight={
            !passage && detail?.document
              ? async (reference, rects) => {
                  const result = await call({
                    action: 'highlight',
                    sourceId: source.id,
                    revision: detail.document!.revision,
                    quote: reference.text,
                    page: reference.page,
                    rects
                  })
                  if (result) {
                    await refresh?.()
                    return true
                  }
                  return false
                }
              : undefined
          }
        >
          {!detail ? (
            <span className="muted">Loading source…</span>
          ) : passage || !detail.document ? (
            <Markdown text={source.text} />
          ) : source.kind === 'image' ? (
            <ImageReader source={source} revision={detail.document.revision} call={call} />
          ) : detail.document.pages ? (
            <PdfReader
              source={source}
              revision={detail.document.revision}
              call={call}
              highlights={highlights}
              focusQuote={focusQuote}
            />
          ) : (
            <Markdown text={detail.document.text} documentSource={source} onSource={onSource} />
          )}
        </SelectionToChat>
        {highlights.filter((h) =>
          h.documentId
            ? h.documentId === source.documentId
            : h.path === source.path && h.scope === source.scope
        ).length > 0 && (
          <div className="source-highlights">
            <small>Saved highlights</small>
            {highlights
              .filter((h) =>
                h.documentId
                  ? h.documentId === source.documentId
                  : h.path === source.path && h.scope === source.scope
              )
              .map((h) => (
                <blockquote key={h.id}>
                  {h.quote}
                  <small>
                    {h.page ? ` · page ${h.page}` : ''}
                    {h.revision !== detail?.document?.revision ? ' · earlier revision' : ''}
                  </small>
                  <div>
                    <button
                      className="text-button"
                      onClick={() => {
                        void onAdd(
                          {
                            id: crypto.randomUUID(),
                            sourceId: h.sourceId,
                            text: h.quote,
                            label: source.title,
                            page: h.page,
                            revision: h.revision,
                            view: 'passage'
                          },
                          chatTargets[0]?.id || null
                        )
                      }}
                    >
                      Add to chat
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        void call({ action: 'deleteHighlight', highlightId: h.id }).then(() =>
                          refresh?.()
                        )
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </blockquote>
              ))}
          </div>
        )}
      </div>
    </section>
  )
}
