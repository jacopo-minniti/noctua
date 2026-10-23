import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Request, Source, SourceHighlight } from '../../shared/types'
import './pdf-reader.css'

GlobalWorkerOptions.workerSrc = pdfWorker
type Call = <T = unknown>(request: Request) => Promise<T | null>
export function PdfReader({
  source,
  revision,
  call,
  highlights,
  focusQuote
}: {
  source: Source
  revision: string
  call: Call
  highlights: SourceHighlight[]
  focusQuote?: string
}) {
  const [documentState, setDocumentState] = useState<{
    pdf: PDFDocumentProxy
    sourceId: string
    revision: string
  } | null>(null)
  const pdf =
    documentState?.sourceId === source.id && documentState.revision === revision
      ? documentState.pdf
      : null
  const [page, setPage] = useState(source.page || 1)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(420)
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width))
    )
    if (wrap.current) observer.observe(wrap.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof getDocument> | undefined
    setError('')
    setDocumentState(null)
    setPage(source.page || 1)
    void call<{ bytes: Uint8Array; revision: string }>({ action: 'sourceBytes', source }).then(
      async (data) => {
        if (cancelled || !data) return
        if (data.revision !== revision) {
          setError('This PDF changed. Reload its source before reading.')
          return
        }
        task = getDocument({ data: new Uint8Array(data.bytes), useSystemFonts: true })
        try {
          const document = await task.promise
          if (cancelled) {
            await task.destroy()
            return
          }
          setDocumentState({ pdf: document, sourceId: source.id, revision })
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render this PDF.')
        }
      }
    )
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [source.id, revision, call])
  useEffect(() => {
    const element = wrap.current
    if (!element) return
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((value) => Math.max(0.6, Math.min(2, value * Math.exp(-event.deltaY * 0.01))))
    }
    element.addEventListener('wheel', pinch, { passive: false })
    return () => element.removeEventListener('wheel', pinch)
  }, [])
  const goTo = (number: number) => {
    setPage(number)
    const target = wrap.current?.querySelector<HTMLElement>(`[data-page-number="${number}"]`)
    const scroller = wrap.current?.closest<HTMLElement>('.source-reader-document')
    if (target && scroller)
      scroller.scrollTop +=
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 38
  }
  useEffect(() => {
    if (!pdf) return
    const timer = window.setTimeout(() => goTo(source.page || 1), 100)
    const scroller = wrap.current?.closest<HTMLElement>('.source-reader-document')
    const track = () => {
      const top = (scroller?.getBoundingClientRect().top || 0) + 45
      const pages = Array.from(
        wrap.current?.querySelectorAll<HTMLElement>('[data-page-number]') || []
      )
      const current = pages.find((node) => node.getBoundingClientRect().bottom > top)
      if (current) setPage(Number(current.dataset.pageNumber))
    }
    scroller?.addEventListener('scroll', track, { passive: true })
    return () => {
      clearTimeout(timer)
      scroller?.removeEventListener('scroll', track)
    }
  }, [pdf])
  return (
    <div className="pdf-reader" ref={wrap}>
      <div className="pdf-controls" onMouseDown={(e) => e.preventDefault()}>
        <button
          aria-label="Previous PDF page"
          disabled={!pdf || page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <label>
          Page{' '}
          <input
            aria-label="PDF page"
            type="number"
            min={1}
            max={pdf?.numPages || 1}
            value={page}
            onChange={(e) =>
              goTo(Math.max(1, Math.min(pdf?.numPages || 1, Number(e.target.value) || 1)))
            }
          />{' '}
          / {pdf?.numPages || '…'}
        </label>
        <button
          aria-label="Next PDF page"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => goTo(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          aria-label="Zoom out PDF"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
        >
          <ZoomOut size={16} />
        </button>
        <button
          aria-label="Zoom in PDF"
          disabled={zoom >= 2}
          onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
        >
          <ZoomIn size={16} />
        </button>
      </div>
      {error && <p className="source-warning">{error}</p>}
      <div className="pdf-page-scroll">
        {pdf &&
          Array.from({ length: pdf.numPages }, (_, index) => (
            <PdfPage
              key={`${source.id}:${revision}:${index}`}
              pdf={pdf}
              source={source}
              revision={revision}
              page={index + 1}
              zoom={zoom}
              width={width}
              highlights={highlights}
              focusQuote={focusQuote}
            />
          ))}
      </div>
    </div>
  )
}
function PdfPage({
  pdf,
  source,
  revision,
  page,
  zoom,
  width,
  highlights,
  focusQuote
}: {
  pdf: PDFDocumentProxy
  source: Source
  revision: string
  page: number
  zoom: number
  width: number
  highlights: SourceHighlight[]
  focusQuote?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    layer = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLElement>(null),
    holder = useRef<HTMLDivElement>(null)
  const [nearby, setNearby] = useState(false)
  const [renderedKey, setRenderedKey] = useState('')
  const [error, setError] = useState('')
  const [ratio, setRatio] = useState(1.414)
  const [rasterWidth, setRasterWidth] = useState(width * zoom)
  const [renderWidth, setRenderWidth] = useState(width * zoom)
  useEffect(() => {
    const timer = window.setTimeout(() => setRenderWidth(width * zoom), 120)
    return () => clearTimeout(timer)
  }, [width, zoom])
  const renderKey = `${source.id}:${revision}:${page}:${renderWidth}`
  const loaded = nearby && !!renderedKey
  useEffect(() => {
    let cancelled = false
    void pdf
      .getPage(page)
      .then((document) => {
        if (!cancelled) {
          const viewport = document.getViewport({ scale: 1 })
          setRatio(viewport.height / viewport.width)
        }
      })
      .catch(() => {})
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), {
      root: holder.current?.closest('.source-reader-document'),
      rootMargin: '700px'
    })
    if (holder.current) observer.observe(holder.current)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [pdf, page])
  useEffect(() => {
    if (!nearby) {
      setRenderedKey('')
      return
    }
    if (!pdf || !canvas.current || !layer.current || !surface.current) return
    let cancelled = false,
      render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined,
      text: TextLayer | undefined
    if (!renderedKey) setRasterWidth(renderWidth)
    void pdf
      .getPage(Math.min(page, pdf.numPages))
      .then(async (document) => {
        if (cancelled || !canvas.current || !layer.current || !surface.current) return
        const original = document.getViewport({ scale: 1 }),
          scale = renderWidth / original.width,
          viewport = document.getViewport({ scale })
        const nextCanvas = window.document.createElement('canvas')
        const nextLayer = window.document.createElement('div')
        nextLayer.style.setProperty('--total-scale-factor', String(scale))
        const ratio = Math.min(2, window.devicePixelRatio || 1)
        nextCanvas.width = Math.ceil(viewport.width * ratio)
        nextCanvas.height = Math.ceil(viewport.height * ratio)
        render = document.render({
          canvas: nextCanvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
        })
        text = new TextLayer({
          textContentSource: document.streamTextContent(),
          container: nextLayer,
          viewport
        })
        await Promise.all([render.promise, text.render()])
        if (!cancelled && canvas.current && layer.current && surface.current) {
          canvas.current.width = nextCanvas.width
          canvas.current.height = nextCanvas.height
          canvas.current.style.width = `${viewport.width}px`
          canvas.current.style.height = `${viewport.height}px`
          canvas.current.getContext('2d')?.drawImage(nextCanvas, 0, 0)
          layer.current.replaceChildren(...Array.from(nextLayer.childNodes))
          surface.current.style.width = `${viewport.width}px`
          surface.current.style.height = `${viewport.height}px`
          surface.current.style.setProperty('--total-scale-factor', String(scale))
          setRasterWidth(renderWidth)
          setRenderedKey(renderKey)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not display this page.')
      })
    return () => {
      cancelled = true
      render?.cancel()
      text?.cancel()
    }
  }, [pdf, renderKey, nearby])
  useEffect(() => {
    const container = layer.current
    if (!container) return
    container
      .querySelectorAll('.focus-source-passage')
      .forEach((element) => element.classList.remove('focus-source-passage'))
    if (!loaded || !focusQuote) return
    const spans = Array.from(container.querySelectorAll<HTMLElement>('span:not(.markedContent)'))
    let joined = ''
    const offsets = spans.map((span) => {
      const start = joined.length
      joined += span.textContent || ''
      return { span, start, end: joined.length }
    })
    const at = joined.indexOf(focusQuote)
    if (at >= 0 && joined.indexOf(focusQuote, at + 1) < 0)
      offsets
        .filter((item) => item.end > at && item.start < at + focusQuote.length)
        .forEach((item) => item.span.classList.add('focus-source-passage'))
  }, [loaded, renderedKey, focusQuote, page])
  const saved = highlights.filter(
    (h) =>
      h.revision === revision &&
      h.page === page &&
      (h.documentId
        ? h.documentId === source.documentId
        : h.path === source.path && h.scope === source.scope)
  )
  return (
    <div
      ref={holder}
      data-page-number={page}
      style={{ width: width * zoom, height: width * zoom * ratio, overflow: 'hidden' }}
    >
      {error && <p className="source-warning">{error}</p>}
      {nearby && (
        <>
          <section
            className="pdf-page-surface"
            ref={surface}
            style={{
              transform: `scale(${(width * zoom) / rasterWidth})`,
              transformOrigin: 'top left'
            }}
            data-page={loaded ? page : undefined}
            data-ready={loaded}
            aria-busy={!loaded}
            aria-label={`PDF page ${page}`}
          >
            <canvas ref={canvas} />
            <div className="textLayer" ref={layer} />
            <div className="pdf-highlights" aria-hidden="true">
              {saved.flatMap((h) =>
                h.rects.map((rect, i) => (
                  <span
                    key={`${h.id}-${i}`}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`
                    }}
                  />
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
