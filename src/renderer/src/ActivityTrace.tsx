import { useEffect, useState } from 'react'
import {
  Brain,
  Check,
  ChevronRight,
  FilePenLine,
  FilePlus2,
  FileText,
  Globe,
  Layers,
  LoaderCircle,
  Search,
  Target,
  Wrench
} from 'lucide-react'
import type { ResponseWork } from '../../shared/types'
import { Markdown } from './Markdown'
function elapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
function icon(name?: string) {
  if (name === 'create_note') return FilePlus2
  if (name?.includes('read')) return FileText
  if (name?.includes('note')) return FilePenLine
  if (name?.includes('search')) return name === 'web_search' ? Globe : Search
  if (name?.includes('flashcard')) return Layers
  if (name?.includes('exercise') || name?.includes('practice')) return Target
  return Wrench
}
export function ActivityTrace({ work }: { work: ResponseWork }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (work.completedAt) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [work.id, work.completedAt])
  const duration = new Date(work.completedAt || now).getTime() - new Date(work.startedAt).getTime()
  return (
    <section className="response-work" aria-label="Response activity">
      <div className="response-work-heading">
        {work.completedAt ? 'Worked' : 'Working'} for {elapsed(duration)}
      </div>
      {work.items.map((item) => {
        const Icon = item.kind === 'thinking' ? Brain : icon(item.name)
        return (
          <details key={item.id} className={`work-item ${item.status}`}>
            <summary>
              <Icon size={15} />
              <span>{item.label}</span>
              {item.status === 'running' ? (
                <LoaderCircle size={13} className="spin" />
              ) : item.status === 'complete' ? (
                <Check size={12} className="work-complete" />
              ) : (
                <span className="work-status">{item.status}</span>
              )}
              <ChevronRight size={13} className="work-chevron" />
            </summary>
            <div className="work-details">
              {item.kind === 'thinking' ? (
                <Markdown text={item.output || 'Waiting for the model’s reasoning…'} />
              ) : (
                <>
                  {item.input && (
                    <>
                      <span className="work-detail-label">Input</span>
                      <pre>{item.input}</pre>
                    </>
                  )}
                  {item.output && (
                    <>
                      <span className="work-detail-label">Result</span>
                      <pre>{item.output}</pre>
                    </>
                  )}
                </>
              )}
            </div>
          </details>
        )
      })}
    </section>
  )
}
