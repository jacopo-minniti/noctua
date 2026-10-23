import { useRef, useState } from 'react'
import { Bold, Code2, Eye, List, Pencil, Sigma } from 'lucide-react'
import { Markdown } from './Markdown'

export interface AnswerAnnotation {
  quote: string
  start?: number
  end?: number
  comment: string
  kind: 'strength' | 'gap' | 'question'
  criterion?: string
}

/** Resolve only exact, unambiguous excerpts. Never highlight a guessed location. */
export function locateAnswerAnnotations(answer: string, annotations: AnswerAnnotation[]) {
  return annotations.flatMap((annotation, index) => {
    const { quote, start, end } = annotation
    if (!quote.trim()) return []
    if (
      start !== undefined &&
      end !== undefined &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      end > start &&
      end <= answer.length &&
      answer.slice(start, end) === quote
    )
      return [{ ...annotation, start, end, index }]
    const found = answer.indexOf(quote)
    if (found < 0 || answer.indexOf(quote, found + 1) >= 0) return []
    return [{ ...annotation, start: found, end: found + quote.length, index }]
  })
}

export function AnswerCanvas({
  value,
  onChange,
  onBlur,
  saved,
  disabled = false
}: {
  value: string
  onChange: (text: string) => void
  onBlur: () => void
  saved: 'saving' | 'saved' | 'error'
  disabled?: boolean
}) {
  const [preview, setPreview] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const insert = (before: string, after = '') => {
    const element = input.current
    if (!element) return
    const { selectionStart, selectionEnd } = element
    onChange(
      value.slice(0, selectionStart) +
        before +
        value.slice(selectionStart, selectionEnd) +
        after +
        value.slice(selectionEnd)
    )
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(selectionStart + before.length, selectionEnd + before.length)
    })
  }
  return (
    <div className="answer-canvas">
      <div className="answer-canvas-heading">
        <span>Your reasoning</span>
        <div className="answer-view-buttons" role="group" aria-label="Answer view">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
            title="Write your reasoning"
          >
            <Pencil size={12} /> Write
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => {
              onBlur()
              setPreview(true)
            }}
            title="Read formatted reasoning"
          >
            <Eye size={12} /> Read
          </button>
        </div>
      </div>
      {!preview && (
        <div className="answer-formatting" role="toolbar" aria-label="Format your answer">
          <button disabled={disabled} type="button" title="Bold" onClick={() => insert('**', '**')}>
            <Bold size={13} />
          </button>
          <button
            disabled={disabled}
            type="button"
            title="Equation"
            onClick={() => insert('$', '$')}
          >
            <Sigma size={14} />
          </button>
          <button
            disabled={disabled}
            type="button"
            title="Code block"
            onClick={() => insert('\n```\n', '\n```\n')}
          >
            <Code2 size={14} />
          </button>
          <button disabled={disabled} type="button" title="List" onClick={() => insert('\n- ')}>
            <List size={14} />
          </button>
          <span>Markdown &amp; equations</span>
        </div>
      )}
      {preview ? (
        <div className="answer-preview">
          {value.trim() ? <Markdown text={value} /> : <p>Your reasoning will appear here.</p>}
        </div>
      ) : (
        <textarea
          ref={input}
          placeholder="Start with what you know. Show your assumptions, approach, and steps…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-label="Your exercise answer"
          disabled={disabled}
          rows={8}
          spellCheck
        />
      )}
      <div className="answer-canvas-footer" role="status">
        <span>{value.trim() ? `${value.trim().split(/\s+/).length} words` : 'Room to think'}</span>
        <span>
          {saved === 'saving'
            ? 'Saving draft…'
            : saved === 'error'
              ? 'Draft could not be saved · retry by continuing'
              : 'Draft saved'}
        </span>
      </div>
    </div>
  )
}

export function AnnotatedAnswer({
  answer,
  annotations
}: {
  answer: string
  annotations: AnswerAnnotation[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const located = locateAnswerAnnotations(answer, annotations)
  // Split at all boundaries so overlapping annotations retain their correct excerpts.
  const boundaries = Array.from(
    new Set([
      0,
      answer.length,
      ...located.flatMap((annotation) => [annotation.start, annotation.end])
    ])
  ).sort((a, b) => a - b)
  return (
    <div className="annotated-answer">
      <div className="annotated-answer-text">
        {boundaries.slice(0, -1).map((start, index) => {
          const end = boundaries[index + 1]
          const active = located.filter(
            (annotation) => annotation.start <= start && annotation.end >= end
          )
          if (!active.length) return <span key={start}>{answer.slice(start, end)}</span>
          const annotation = active.find((item) => item.index === selected) || active[0]
          return (
            <button
              key={start}
              className={`answer-highlight ${annotation.kind} ${selected === annotation.index ? 'selected' : ''}`}
              title={active.map((item) => item.comment).join('\n')}
              aria-label={`${annotation.kind}: ${annotation.comment}`}
              onClick={() => setSelected(annotation.index)}
            >
              {answer.slice(start, end)}
            </button>
          )
        })}
      </div>
      <div className="answer-annotations">
        {annotations.map((annotation, index) => (
          <button
            key={index}
            className={`answer-annotation ${annotation.kind} ${selected === index ? 'selected' : ''}`}
            onClick={() => setSelected(selected === index ? null : index)}
            aria-pressed={selected === index}
          >
            <span className="annotation-type">
              {annotation.kind === 'strength'
                ? 'Sound reasoning'
                : annotation.kind === 'gap'
                  ? 'Revisit'
                  : 'Consider'}
              {annotation.criterion ? ` · ${annotation.criterion}` : ''}
            </span>
            <q>{annotation.quote}</q>
            <span>{annotation.comment}</span>
            {!located.some((item) => item.index === index) && (
              <small>Excerpt could not be located uniquely in this answer.</small>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
