import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Side = 'left' | 'right'
type Layout = { left: number; right: number; showLeft: boolean; showRight: boolean }
const storageKey = 'noctua-workspace-layout'
const minimum = { left: 160, right: 240 }
// The study desk can use the remaining viewport; only navigation has a fixed cap.
const maximum = { left: 360, right: Number.POSITIVE_INFINITY }
const chatMinimum = 300
const handleWidth = 6
const railWidth = 64
const frameGutter = 8

function initialLayout(): Layout {
  const compact = window.innerWidth <= 1000
  const medium = window.innerWidth <= 1200
  const defaults = {
    left: compact ? 160 : medium ? 200 : 236,
    right: compact ? 280 : medium ? 330 : 376,
    showLeft: true,
    showRight: true
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (!saved) return defaults
    for (const side of ['left', 'right'] as const) {
      if (typeof saved[side] === 'number' && Number.isFinite(saved[side]))
        defaults[side] = Math.max(minimum[side], Math.min(maximum[side], saved[side]))
    }
    if (typeof saved.showLeft === 'boolean') defaults.showLeft = saved.showLeft
    if (typeof saved.showRight === 'boolean') defaults.showRight = saved.showRight
  } catch {
    // A missing or invalid local preference should never block the workspace.
  }
  return defaults
}

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(initialLayout)
  const [viewport, setViewport] = useState(window.innerWidth)
  const [resizing, setResizing] = useState(false)
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      // Resizing still works when local preference storage is unavailable.
    }
  }, [layout])
  let left = layout.showLeft ? layout.left : railWidth
  let right = layout.showRight ? layout.right : 0
  const handles = (Number(layout.showLeft) + Number(layout.showRight)) * handleWidth
  const available = Math.max(0, viewport - frameGutter - chatMinimum - handles)
  const leftSlack = layout.showLeft ? left - minimum.left : 0
  const rightSlack = layout.showRight ? right - minimum.right : 0
  const excess = Math.max(0, left + right - available)
  const slack = leftSlack + rightSlack
  if (slack > 0 && excess > 0) {
    const reduction = Math.min(excess, slack)
    left -= (reduction * leftSlack) / slack
    right -= (reduction * rightSlack) / slack
  }
  const widths = { left, right }
  const limits = {
    left: Math.max(minimum.left, Math.min(maximum.left, available - right)),
    right: Math.max(minimum.right, Math.min(maximum.right, available - left))
  }
  const style: CSSProperties = {
    gridTemplateColumns: `${left}px ${layout.showLeft ? handleWidth : 0}px minmax(0, 1fr) ${layout.showRight ? handleWidth : 0}px ${right}px`
  }
  const setVisible = (side: Side, visible: boolean) =>
    setLayout((previous) => ({
      ...previous,
      [side === 'left' ? 'showLeft' : 'showRight']: visible
    }))
  const resize = (side: Side, width: number) =>
    setLayout((previous) => ({
      ...previous,
      [side]: Math.max(minimum[side], Math.min(limits[side], width))
    }))
  return { layout, widths, limits, style, resizing, setResizing, setVisible, resize }
}

export function ResizeHandle({
  side,
  width,
  max,
  onResize,
  onDragging
}: {
  side: Side
  width: number
  max: number
  onResize: (width: number) => void
  onDragging: (dragging: boolean) => void
}) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const direction = side === 'left' ? 1 : -1
  return (
    <div
      className={`resize-handle resize-${side}`}
      role="separator"
      aria-label={side === 'left' ? 'Resize navigation' : 'Resize study desk'}
      aria-orientation="vertical"
      aria-valuemin={minimum[side]}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        drag.current = { x: event.clientX, width }
        event.currentTarget.setPointerCapture(event.pointerId)
        onDragging(true)
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onResize(drag.current.width + direction * (event.clientX - drag.current.x))
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onLostPointerCapture={() => {
        drag.current = null
        onDragging(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onResize(width + (event.key === 'ArrowRight' ? 1 : -1) * direction * 16)
      }}
    />
  )
}
