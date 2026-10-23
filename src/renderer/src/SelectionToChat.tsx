import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ChatReference } from '../../shared/types'
import type { SourceHighlight } from '../../shared/types'

export interface ChatTarget {
  id: string
  label: string
  title: string
  disabled: boolean
}
export interface SelectionActions {
  chatTargets: ChatTarget[]
  onAdd: (reference: ChatReference, targetId: string | null) => Promise<boolean>
  onCapture?: (reference: ChatReference) => Promise<boolean>
  onHighlight?: (reference: ChatReference, rects: SourceHighlight['rects']) => Promise<boolean>
}
/** Keep the selection intact while choosing a destination directly in its floating toolbar. */
export function SelectionToChat({
  children,
  origin,
  chatTargets,
  onAdd,
  onCapture,
  onHighlight
}: SelectionActions & {
  children: ReactNode
  origin: Omit<ChatReference, 'id' | 'text'>
}) {
  const container = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{
    text: string
    page?: number
    sourceLine?: number
    rect: DOMRect
    rects: SourceHighlight['rects']
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  useEffect(() => {
    const capture = () => {
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || !selected.rangeCount) return setSelection(null)
      const range = selected.getRangeAt(0)
      if (
        !container.current?.contains(range.startContainer) ||
        !container.current.contains(range.endContainer)
      )
        return setSelection(null)
      const text = selected.toString().trim().slice(0, 8000)
      const node =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      const page = Number(node?.closest('[data-page]')?.getAttribute('data-page')) || undefined
      const endNode =
        range.endContainer instanceof Element
          ? range.endContainer
          : range.endContainer.parentElement
      const pdfSurface = node?.closest('.pdf-page-surface')
      if (
        pdfSurface &&
        (pdfSurface !== endNode?.closest('.pdf-page-surface') ||
          pdfSurface.getAttribute('data-ready') !== 'true')
      )
        return setSelection(null)
      const sourceLine =
        Number(node?.closest('[data-source-line]')?.getAttribute('data-source-line')) || undefined
      const bounds = container.current.getBoundingClientRect()
      const readerBounds =
        container.current.closest('.source-reader-document')?.getBoundingClientRect() || bounds
      const rect =
        Array.from(range.getClientRects()).find(
          (rect) =>
            rect.bottom > Math.max(0, readerBounds.top) &&
            rect.top < Math.min(window.innerHeight, readerBounds.bottom)
        ) || range.getBoundingClientRect()
      const surface = node?.closest('.pdf-page-surface')?.getBoundingClientRect()
      const rects = surface
        ? Array.from(range.getClientRects())
            .filter((r) => r.width > 0 && r.height > 0)
            .slice(0, 100)
            .map((r) => ({
              x: Math.max(0, Math.min(1, (r.left - surface.left) / surface.width)),
              y: Math.max(0, Math.min(1, (r.top - surface.top) / surface.height)),
              width: Math.min(1, r.width / surface.width),
              height: Math.min(1, r.height / surface.height)
            }))
        : []
      setSelection(text ? { text, page, sourceLine, rect, rects } : null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelection(null)
        window.getSelection()?.removeAllRanges()
      }
    }
    document.addEventListener('selectionchange', capture)
    window.addEventListener('scroll', capture, true)
    window.addEventListener('resize', capture)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('selectionchange', capture)
      window.removeEventListener('scroll', capture, true)
      window.removeEventListener('resize', capture)
      window.removeEventListener('keydown', escape)
    }
  }, [])
  useLayoutEffect(() => {
    if (!selection || !toolbar.current) return
    const { width, height } = toolbar.current.getBoundingClientRect()
    const rect = selection.rect
    setPosition({
      left: Math.max(
        8,
        Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)
      ),
      top: Math.max(
        8,
        Math.min(
          window.innerHeight - height - 8,
          rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8
        )
      )
    })
  }, [selection, chatTargets.length])
  const add = async (targetId: string | null) => {
    if (!selection || busy) return
    setBusy(true)
    try {
      const added = await onAdd(
        {
          ...origin,
          id: crypto.randomUUID(),
          text: selection.text,
          page: selection.page || origin.page,
          sourceLine: selection.sourceLine
        },
        targetId
      )
      if (added) {
        setSelection(null)
        window.getSelection()?.removeAllRanges()
      }
    } finally {
      setBusy(false)
    }
  }
  const save = async (kind: 'capture' | 'highlight') => {
    if (!selection || busy) return
    setBusy(true)
    try {
      const reference = {
        ...origin,
        id: crypto.randomUUID(),
        text: selection.text,
        page: selection.page || origin.page,
        sourceLine: selection.sourceLine
      }
      const done =
        kind === 'capture'
          ? await onCapture?.(reference)
          : await onHighlight?.(reference, selection.rects)
      if (done) {
        setSelection(null)
        window.getSelection()?.removeAllRanges()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div ref={container} className="selectable-passage">
      {children}
      {selection &&
        createPortal(
          <div
            ref={toolbar}
            className="selection-to-chat"
            role="toolbar"
            aria-label="Add selection to chat"
            style={position}
            onMouseDown={(event) => event.preventDefault()}
          >
            {chatTargets.map((target) => (
              <button
                key={target.id}
                disabled={busy || target.disabled}
                title={target.title}
                onClick={() => {
                  void add(target.id)
                }}
              >
                Add to {target.label}
              </button>
            ))}
            <button
              disabled={busy}
              title="Add selection to a new chat tab"
              onClick={() => {
                void add(null)
              }}
            >
              + New chat
            </button>
            {onCapture && (
              <button
                disabled={busy}
                onClick={() => {
                  void save('capture')
                }}
              >
                Save bit
              </button>
            )}
            {onHighlight && (
              <button
                disabled={busy}
                onClick={() => {
                  void save('highlight')
                }}
              >
                Highlight
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
