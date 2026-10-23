import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ReasoningEffort } from '../../shared/types'

const label = (effort: ReasoningEffort) =>
  effort === 'off' ? 'No reasoning' : effort[0].toUpperCase() + effort.slice(1)

export function ReasoningPicker({
  levels,
  labels,
  value,
  disabled,
  onChange
}: {
  labels?: Partial<Record<ReasoningEffort, string>>
  levels: ReasoningEffort[]
  value: ReasoningEffort
  disabled: boolean
  onChange: (effort: ReasoningEffort) => void
}) {
  const effortLabel = (effort: ReasoningEffort) => labels?.[effort] || label(effort)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(Math.max(0, levels.indexOf(value)))
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setPosition(Math.max(0, levels.indexOf(value))), [value, levels.join(',')])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])
  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (!disabled) setOpen(true)
  }
  const commit = () => {
    const effort = levels[position]
    if (effort && effort !== value) onChange(effort)
  }
  return (
    <div
      className="reasoning-picker-wrap"
      onMouseEnter={show}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 180)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          commit()
          setOpen(false)
        }
      }}
    >
      <button
        className="reasoning-picker"
        aria-label="Reasoning effort"
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={show}
      >
        {effortLabel(value)}
        <ChevronDown size={12} />
      </button>
      {open && !disabled && (
        <div className="reasoning-popover">
          <div className="reasoning-current">{effortLabel(levels[position] || value)}</div>
          <input
            type="range"
            aria-label="Reasoning effort slider"
            min={0}
            max={levels.length - 1}
            step={1}
            value={position}
            aria-valuetext={effortLabel(levels[position] || value)}
            onChange={(event) => setPosition(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
          />
          <div className="reasoning-levels">
            {levels.map((effort, index) => (
              <button
                key={effort}
                className={index === position ? 'active' : ''}
                aria-pressed={index === position}
                onClick={() => {
                  setPosition(index)
                  onChange(effort)
                }}
              >
                {effort === 'off' ? 'Off' : effortLabel(effort)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
