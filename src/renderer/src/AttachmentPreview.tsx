import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFPageProxy } from 'pdfjs-dist'
import { useSourceImage } from './ImageReader'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Request, Source } from '../../shared/types'

GlobalWorkerOptions.workerSrc = pdfWorker

export function AttachmentPreview({
  source,
  call,
  onOpen
}: {
  source: Source
  call: <T = unknown>(request: Request) => Promise<T | null>
  onOpen: (source: Source) => void
}) {
  const imageUrl = useSourceImage(source, call)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState('Loading preview…')
  useEffect(() => {
    if (source.kind !== 'pdf') return
    let cancelled = false
    let task: ReturnType<typeof getDocument> | undefined
    let render: ReturnType<PDFPageProxy['render']> | undefined
    setState('Loading preview…')
    void (async () => {
      try {
        const data = await call<{ bytes: Uint8Array; revision: string }>({
          action: 'sourceBytes',
          source
        })
        if (cancelled) return
        if (!data || data.revision !== source.revision) throw new Error('Preview unavailable')
        task = getDocument({ data: new Uint8Array(data.bytes), useSystemFonts: true })
        const pdf = await task.promise
        const page = await pdf.getPage(1)
        if (cancelled || !canvas.current) return
        const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width })
        canvas.current.width = viewport.width
        canvas.current.height = viewport.height
        render = page.render({ canvas: canvas.current, viewport })
        await render.promise
        if (!cancelled) setState('')
      } catch {
        if (!cancelled) setState('Preview unavailable')
      } finally {
        void task?.destroy()
      }
    })()
    return () => {
      cancelled = true
      render?.cancel()
      void task?.destroy()
    }
  }, [source.id, source.revision, source.kind, call])
  return (
    <button
      className="attachment-preview"
      onClick={() => onOpen(source)}
      aria-label={`Open ${source.title} in ${source.kind === 'image' ? 'tab' : 'sidebar'}`}
    >
      <div className="attachment-image">
        {source.kind === 'image' && imageUrl ? (
          <img src={imageUrl} alt={source.title} />
        ) : source.kind === 'pdf' ? (
          <>
            <canvas ref={canvas} hidden={!!state} />
            {state && (
              <span>
                <FileText size={24} />
                {state}
              </span>
            )}
          </>
        ) : (
          <FileText size={32} />
        )}
      </div>
      <strong>{source.title}</strong>
      <small>{source.kind === 'pdf' ? 'PDF · Open in sidebar' : 'Image · Open in tab'}</small>
    </button>
  )
}
