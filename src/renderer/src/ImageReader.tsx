import { useEffect, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import type { Request, Source } from '../../shared/types'

type Call = <T = unknown>(request: Request) => Promise<T | null>
export function useSourceImage(source: Source, call: Call, revision = source.revision) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (source.kind !== 'image') return
    let cancelled = false,
      objectUrl = ''
    setUrl('')
    void call<{ bytes: Uint8Array; revision: string }>({ action: 'sourceBytes', source }).then(
      (data) => {
        if (cancelled || !data || data.revision !== revision) return
        const ext = source.path.split('.').at(-1)?.toLowerCase()
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(data.bytes)], { type: mime }))
        setUrl(objectUrl)
      }
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source.id, source.kind, revision, call])
  return url
}
export function ImageReader({
  source,
  call,
  revision
}: {
  source: Source
  call: Call
  revision: string
}) {
  const url = useSourceImage(source, call, revision)
  const [zoom, setZoom] = useState(1)
  useEffect(() => setZoom(1), [source.id])
  return (
    <div className="image-reader">
      <div className="image-controls">
        <button
          aria-label="Zoom out image"
          onClick={() => setZoom((n) => Math.max(0.25, n - 0.25))}
        >
          <ZoomOut size={16} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in image" onClick={() => setZoom((n) => Math.min(4, n + 0.25))}>
          <ZoomIn size={16} />
        </button>
        <button aria-label="Reset image zoom" onClick={() => setZoom(1)}>
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="image-reader-scroll">
        {url ? (
          <img src={url} alt={source.title} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
        ) : (
          <p>Image unavailable or loading…</p>
        )}
      </div>
    </div>
  )
}
