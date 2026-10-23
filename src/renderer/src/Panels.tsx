import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Cable,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Layers,
  Lightbulb,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import type { Flashcard, Level, Request, Settings, Snapshot, Source } from '../../shared/types'
import { levels } from '../../shared/types'
import { modelsForPicker } from '../../shared/model-picker'
import { SelectionToChat, type SelectionActions } from './SelectionToChat'
import { Markdown } from './Markdown'
import './ecosystem.css'
import { CardImport } from './CardImport'

export type Panel = 'sources' | 'cards' | 'exercises' | 'notes'
type Call = <T = unknown>(request: Request) => Promise<T | null>
type Shared = {
  snapshot: Snapshot
  call: Call
  refresh: () => Promise<void>
  onSource: (source: Source) => void
}
function useActivityState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? fallback : JSON.parse(saved)
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    value === undefined
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}
const levelDescriptions: Record<Level, string> = {
  unknown: 'Currently missing most of the idea',
  knowledge: 'Able to recall relevant information',
  comprehension: 'Understands the important ideas',
  application: 'Solves varied problems using the concept',
  transfer: 'Uses the concept flexibly in very different settings'
}
export function SourceRefs({
  sources,
  onSource
}: {
  sources: Source[]
  onSource: (source: Source) => void
}) {
  if (!sources.length)
    return (
      <div className="artifact-origin">
        Created from your request · check the content before studying
      </div>
    )
  return (
    <div className="artifact-sources">
      {sources.slice(0, 4).map((source) => (
        <button key={source.id} onClick={() => onSource(source)}>
          <FileText size={12} />
          {source.title}
          {source.page ? ` · p. ${source.page}` : ''}
        </button>
      ))}
    </div>
  )
}

export function CardsPanel({
  snapshot,
  chatId,
  call,
  refresh,
  onGenerate,
  onSource,
  busy,
  notify,
  active,
  focusedId,
  onActivityDone,
  initialFront,
  initialBack,
  initialConceptId,
  onDraftOpened,
  onAdd,
  chatTargets
}: Shared &
  SelectionActions & {
    chatId: string
    onGenerate: () => void
    busy: boolean
    notify: (text: string) => void
    active: boolean
    focusedId?: string | null
    onActivityDone?: (itemId: string) => void
    initialFront?: string
    initialBack?: string
    initialConceptId?: string | null
    onDraftOpened?: () => void
  }) {
  const [reviewId, setReviewId] = useActivityState<string | null>(`noctua-review:${chatId}`, null)
  const [revealed, setRevealed] = useActivityState(`noctua-revealed:${chatId}`, false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [deleted, setDeleted] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const archive = async (ids: string[], suspended: boolean) => {
    if (!ids.length || batchBusy) return
    setBatchBusy(true)
    try {
      const result = await call({ action: 'archiveCards', cardIds: ids, suspended })
      if (result) {
        setDeleted(suspended ? ids : [])
        setSelected([])
        if (suspended && reviewId && ids.includes(reviewId)) {
          setReviewId(null)
          setRevealed(false)
        }
        notify(`${ids.length} cards ${suspended ? 'deleted from the library' : 'restored'}.`)
        await refresh()
      }
    } finally {
      setBatchBusy(false)
    }
  }
  const [rating, setRating] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [placementReason, setPlacementReason] = useState('')
  const [editing, setEditing] = useState<Flashcard | 'new' | null>(null)
  const [front, setFront] = useState(''),
    [back, setBack] = useState(''),
    [conceptId, setConceptId] = useState('')
  const due = snapshot.cards
    .filter((card) => new Date(card.scheduler.due).getTime() <= Date.now())
    .sort((a, b) => a.scheduler.due.localeCompare(b.scheduler.due))
  const card = snapshot.cards.find((card) => card.id === reviewId)
  useEffect(() => {
    if (focusedId) {
      setReviewId(focusedId)
      setRevealed(false)
    }
  }, [focusedId])
  useEffect(() => {
    if (!initialFront && !initialBack) return
    setEditing('new')
    setFront(initialFront || '')
    setBack(initialBack || '')
    setConceptId(initialConceptId || '')
    setPlacementReason('')
    onDraftOpened?.()
  }, [initialFront, initialBack, initialConceptId])
  const rate = async (value: 1 | 2 | 3 | 4) => {
    if (!card || rating || !revealed) return
    setRating(true)
    const result = await call<{ after: { due: string } }>({
      action: 'review',
      cardId: card.id,
      rating: value,
      expectedReps: card.scheduler.reps
    })
    if (result) {
      notify(
        `Review saved. Next due ${new Date(result.after.due).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
      )
      setReviewId(due.find((item) => item.id !== card.id)?.id || null)
      setRevealed(false)
      onActivityDone?.(card.id)
    }
    await refresh()
    setRating(false)
  }
  useEffect(() => {
    if (!reviewId || !active || importing || editing) return
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target?.closest('input,textarea,select,[contenteditable="true"],[role="toolbar"]') ||
        window.getSelection()?.toString()
      )
        return
      if (event.code === 'Space' && !target?.closest('button')) {
        event.preventDefault()
        setRevealed(true)
      }
      if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault()
        void rate(Number(event.key) as 1 | 2 | 3 | 4)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  const edit = (item: Flashcard | 'new') => {
    setEditing(item)
    setFront(item === 'new' ? '' : item.front)
    setBack(item === 'new' ? '' : item.back)
    setConceptId(item === 'new' ? '' : item.conceptId || '')
    setPlacementReason('')
  }
  return (
    <div className="cards-panel">
      <div className="panel-title">
        <div>
          <h3>Make recall a habit.</h3>
          <p>Try to retrieve before you reveal.</p>
        </div>
        <button className="icon-button" title="Create a card yourself" onClick={() => edit('new')}>
          <Plus size={18} />
        </button>
      </div>
      <div className="card-batch-toolbar">
        <button className="secondary-button" onClick={() => setImporting(true)}>
          Import CSV / add batch
        </button>
        {!!deleted.length && (
          <button
            className="text-button"
            disabled={batchBusy}
            onClick={() => void archive(deleted, false)}
          >
            Undo deletion ({deleted.length})
          </button>
        )}
      </div>
      {card ? (
        <>
          <button
            className="text-button back-link"
            onClick={() => {
              setReviewId(null)
              setRevealed(false)
            }}
          >
            <ArrowLeft size={13} />
            All flashcards
          </button>
          <div className={`review-card flip-card-scene ${revealed ? 'is-flipped' : ''}`}>
            <div className="review-card-top flip-card-toolbar">
              <span className="eyebrow">{revealed ? 'CHECK YOUR RECALL' : 'RECALL FIRST'}</span>
              <button className="icon-button" title="Edit flashcard" onClick={() => edit(card)}>
                <Edit3 size={15} />
              </button>
            </div>
            {card.conceptId && (
              <span className="card-concept-label">
                {snapshot.concepts.find((concept) => concept.id === card.conceptId)?.title}
              </span>
            )}
            <div className="flip-card-inner">
              <div
                className="flip-card-face flip-card-front"
                aria-hidden={revealed}
                inert={revealed}
              >
                <SelectionToChat
                  origin={{
                    cardId: card.id,
                    label: 'Flashcard passage',
                    side: 'front',
                    revision: card.contentVersion
                  }}
                  onAdd={onAdd}
                  chatTargets={chatTargets}
                >
                  <Markdown text={card.front} sources={card.sources} onSource={onSource} />
                </SelectionToChat>
                <div className="recall-prompt">
                  <p>Take a moment to retrieve it.</p>
                  <button className="primary-button" onClick={() => setRevealed(true)}>
                    <Eye size={15} />
                    Reveal answer<span>Space</span>
                  </button>
                </div>
              </div>
              <div
                className="flip-card-face flip-card-back"
                aria-hidden={!revealed}
                inert={!revealed}
              >
                {revealed && (
                  <>
                    <SelectionToChat
                      origin={{
                        cardId: card.id,
                        label: 'Flashcard answer',
                        side: 'back',
                        revision: card.contentVersion
                      }}
                      onAdd={onAdd}
                      chatTargets={chatTargets}
                    >
                      <Markdown text={card.back} sources={card.sources} onSource={onSource} />
                    </SelectionToChat>
                    <button
                      className="text-button card-turn-back"
                      onClick={() => setRevealed(false)}
                    >
                      <RefreshCw size={12} /> Show question
                    </button>
                  </>
                )}
              </div>
            </div>
            {card.importInfo && (
              <div className="artifact-origin">
                Imported from {card.importInfo.fileName} · record {card.importInfo.row}
              </div>
            )}
            {(!card.importInfo || card.sources.length > 0) && (
              <SourceRefs sources={card.sources} onSource={onSource} />
            )}
          </div>
          {revealed && (
            <>
              <p className="rating-label">How well did you remember it?</p>
              <div className="review-ratings">
                {(
                  [
                    ['Again', 1],
                    ['Hard', 2],
                    ['Good', 3],
                    ['Easy', 4]
                  ] as const
                ).map(([label, value]) => (
                  <button
                    className={`rating rating-${value}`}
                    key={value}
                    disabled={rating}
                    onClick={() => {
                      void rate(value)
                    }}
                  >
                    <strong>{label}</strong>
                    <span>{value}</span>
                  </button>
                ))}
              </div>
              <p className="small-note">
                Again = forgot. Hard = recalled with difficulty.
                <br />
                Recall ratings influence memory, not deeper understanding.
              </p>
            </>
          )}
          <div className="review-progress">
            <span>{due.length} due now</span>
            <span>FSRS · 90% target retention</span>
          </div>
        </>
      ) : (
        <>
          <div className="due-card">
            <span className="due-icon">
              <Layers size={24} strokeWidth={1.5} />
            </span>
            <div>
              <strong>
                {due.length}
                <span> due now</span>
              </strong>
              <p>
                {due.length
                  ? 'A small return to what matters.'
                  : snapshot.cards.length
                    ? 'Your cards will return when they are due.'
                    : 'Start with a few meaningful questions.'}
              </p>
            </div>
            <button
              className="primary-button"
              disabled={!due.length}
              onClick={() => {
                setReviewId(due[0].id)
                setRevealed(false)
              }}
            >
              Start recall
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="generate-button" onClick={onGenerate} disabled={busy}>
            <Plus size={16} />
            Create flashcards with Noctua
            <ChevronRight size={14} />
          </button>
          <div className="section-label">YOUR CARDS · {snapshot.cards.length}</div>
          {snapshot.cards.length ? (
            <div className="card-library">
              <div className="card-batch-toolbar">
                <label className="csv-checkbox">
                  <input
                    type="checkbox"
                    aria-label="Select all flashcards"
                    checked={snapshot.cards.every((item) => selected.includes(item.id))}
                    onChange={(event) =>
                      setSelected(event.target.checked ? snapshot.cards.map((item) => item.id) : [])
                    }
                  />
                  Select all ({snapshot.cards.length})
                </label>
                <button
                  className="text-button danger"
                  disabled={
                    batchBusy ||
                    !selected.some((id) => snapshot.cards.some((item) => item.id === id))
                  }
                  onClick={() =>
                    void archive(
                      selected.filter((id) => snapshot.cards.some((item) => item.id === id)),
                      true
                    )
                  }
                >
                  Delete selected (
                  {selected.filter((id) => snapshot.cards.some((item) => item.id === id)).length})
                </button>
              </div>
              {snapshot.cards
                .slice()
                .reverse()
                .map((item) => (
                  <div className="library-card" key={item.id}>
                    <input
                      className="card-select"
                      type="checkbox"
                      aria-label={`Select card: ${item.front}`}
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id)
                        )
                      }
                    />
                    <button
                      className="library-card-open"
                      onClick={() => {
                        setReviewId(item.id)
                        setRevealed(false)
                      }}
                    >
                      <Markdown text={item.front} />
                      <small>
                        {item.scheduler.reps
                          ? `${item.scheduler.reps} reviews · due ${new Date(item.scheduler.due).toLocaleDateString()}`
                          : 'New · ready for a first recall'}
                      </small>
                    </button>
                    <button className="icon-button" title="Edit card" onClick={() => edit(item)}>
                      <Edit3 size={14} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="panel-empty">
              <Layers size={30} strokeWidth={1.2} />
              <h3>Keep the useful questions.</h3>
              <p>
                Create cards from a topic, your notes,
                <br />
                or a resource you have attached.
                <br />
                You can also write your own.
              </p>
              <button className="text-button" onClick={() => edit('new')}>
                <Plus size={14} />
                Write a flashcard
              </button>
            </div>
          )}
          <div className="desk-tip">
            <BookOpen size={16} />
            <p>
              A card can strengthen remembering. Explanation, application, and transfer need their
              own evidence.
            </p>
          </div>
        </>
      )}
      {importing && (
        <CardImport
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          onClose={() => setImporting(false)}
          onSaved={async (text) => {
            setImporting(false)
            notify(text)
            await refresh()
          }}
        />
      )}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal card-editor" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">FLASHCARD</span>
                <h2>{editing === 'new' ? 'A question worth keeping.' : 'Refine this card.'}</h2>
              </div>
              <button className="icon-button" onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </div>
            <label>
              Question
              <textarea
                value={front}
                onChange={(event) => setFront(event.target.value)}
                rows={4}
                placeholder="What do you want to be able to retrieve?"
                autoFocus
              />
            </label>
            <label>
              Answer
              <textarea
                value={back}
                onChange={(event) => setBack(event.target.value)}
                rows={5}
                placeholder="A clear, focused answer. Markdown and LaTeX work here."
              />
            </label>
            <label>
              Concept
              <select value={conceptId} onChange={(event) => setConceptId(event.target.value)}>
                <option value="">No concept assigned</option>
                {snapshot.concepts
                  .filter(
                    (concept) =>
                      concept.scope === snapshot.vaultScope ||
                      concept.scope === `attachments:${chatId}`
                  )
                  .map((concept) => (
                    <option value={concept.id} key={concept.id}>
                      {concept.title} · {concept.path}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="secondary-button placement-button"
              disabled={
                placing ||
                !front.trim() ||
                !snapshot.models.some(
                  (model) =>
                    model.key ===
                      (snapshot.settings.roleModels?.organizer || snapshot.settings.modelKey) &&
                    model.ready
                )
              }
              onClick={async () => {
                setPlacing(true)
                try {
                  const placement = await call<{ conceptId: string | null; reason: string }>({
                    action: 'suggestPlacement',
                    conversationId: chatId,
                    text: `Question: ${front}\nAnswer: ${back}`
                  })
                  if (placement) {
                    setConceptId(placement.conceptId || '')
                    setPlacementReason(placement.reason)
                  }
                } finally {
                  setPlacing(false)
                }
              }}
            >
              {placing ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
              Ask model where it belongs
            </button>
            {placementReason && (
              <p className="placement-reason" role="status">
                {placementReason}
              </p>
            )}
            <p className="small-note">
              Changing the question or answer restarts its schedule. Previous reviews are kept.
            </p>
            <div className="modal-actions">
              {editing !== 'new' && (
                <button
                  className="text-button danger"
                  onClick={async () => {
                    await archive([editing.id], true)
                    setEditing(null)
                  }}
                >
                  <Trash2 size={14} />
                  Delete card
                </button>
              )}
              <button
                className="primary-button"
                disabled={!front.trim() || !back.trim()}
                onClick={async () => {
                  const result = await call({
                    action: 'saveCard',
                    front,
                    back,
                    conceptId: conceptId || null,
                    conversationId: chatId,
                    cardId: editing === 'new' ? undefined : editing.id
                  })
                  if (result) {
                    setEditing(null)
                    setRevealed(false)
                    await refresh()
                  }
                }}
              >
                <Save size={15} />
                Save card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { ExercisesPanel } from './PracticePanel'

export function ConceptsPanel({ snapshot, call, refresh }: Shared) {
  const [preview, setPreview] = useState<{
    conceptId: string
    original: string
    updated: string
    revision: string
    path: string
  } | null>(null)
  const [writing, setWriting] = useState(false)
  return (
    <div className="concepts-panel">
      {snapshot.concepts.length ? (
        snapshot.concepts.map((concept) => (
          <details className="concept-card concept-list-item" key={concept.id}>
            <summary className="concept-title">
              <h3>{concept.title}</h3>
              <span className={`level-badge ${concept.level || 'unassessed'}`}>
                {concept.level ? `#${concept.level}` : 'Not assessed'}
              </span>
              <ChevronRight size={15} className="concept-list-chevron" />
            </summary>
            <small className="concept-path">{concept.path}</small>
            <select
              className={`concept-level ${concept.level || 'unassessed'}`}
              aria-label={`Level for ${concept.title}`}
              value={concept.level || 'unassessed'}
              onChange={async (event) => {
                await call({
                  action: 'level',
                  conceptId: concept.id,
                  level: event.target.value as Level
                })
                await refresh()
              }}
            >
              <option value="unassessed" disabled>
                Not assessed
              </option>
              {levels.map((level) => (
                <option key={level} value={level}>
                  #{level} — {levelDescriptions[level]}
                </option>
              ))}
            </select>
            <div className="concept-evidence">
              <div>
                <span>Predicted recall</span>
                <strong>
                  {concept.recall.recall === null
                    ? '—'
                    : `${Math.round(concept.recall.recall * 100)}%`}
                </strong>
              </div>
              <div>
                <span>Cards reviewed</span>
                <strong>
                  {concept.recall.reviewed}/{concept.recall.cards}
                </strong>
              </div>
              <div>
                <span>Independent successes</span>
                <strong>{concept.independentSuccesses}</strong>
              </div>
            </div>
            <p className="small-note">
              {concept.recall.reviews} recall ratings · {concept.attempts} exercise attempts
              <br />
              Recall forecast covers reviewed cards only.
            </p>
            {concept.evidence && (
              <details className="readiness-detail">
                <summary>What the evidence covers</summary>
                {concept.evidence.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {concept.evidence.facets.map((facet) => (
                  <div className="map-facet" key={facet.id}>
                    <strong>{facet.title}</strong>
                    <small>
                      {facet.observations
                        ? `${facet.independentSuccesses} independent · ${facet.assistedSuccesses} assisted · ${facet.gaps} gaps`
                        : 'Not assessed'}
                      {facet.lastObservedAt
                        ? ` · ${new Date(facet.lastObservedAt).toLocaleDateString()}`
                        : ''}
                    </small>
                  </div>
                ))}
                {concept.evidence.uncertainty.map((uncertainty) => (
                  <p key={uncertainty}>{uncertainty}</p>
                ))}
              </details>
            )}
            {concept.readiness && <p className="small-note">{concept.readiness.rationale}</p>}
            {concept.suggestedLevel && concept.suggestedLevel !== concept.level && (
              <button
                className="suggested-tag"
                title="Inspect the observed criteria, help, variety, and dates before accepting this provisional suggestion."
                onClick={async () => {
                  await call({
                    action: 'level',
                    conceptId: concept.id,
                    level: concept.suggestedLevel!
                  })
                  await refresh()
                }}
              >
                <Lightbulb size={13} />
                Evidence suggests #{concept.suggestedLevel}
                <Check size={13} />
              </button>
            )}
            {concept.level &&
              concept.path.endsWith('.md') &&
              concept.scope.startsWith('vault:') && (
                <button
                  className="text-button write-tag"
                  onClick={async () => {
                    const result = await call<Omit<NonNullable<typeof preview>, 'conceptId'>>({
                      action: 'previewTag',
                      conceptId: concept.id
                    })
                    if (result) setPreview({ ...result, conceptId: concept.id })
                  }}
                >
                  <FileText size={12} />
                  Preview tag in note
                </button>
              )}
          </details>
        ))
      ) : (
        <div className="panel-empty">
          <BookOpen size={30} strokeWidth={1.2} />
          <h3>Start with your knowledge.</h3>
          <p>
            Connect a vault or attach resources.
            <br />
            Notes become concepts; large notes
            <br />
            can also expose smaller sections.
          </p>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal tag-preview" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">VAULT CHANGE</span>
                <h2>Save the tag in your note.</h2>
                <p>{preview.path}</p>
              </div>
              <button className="icon-button" onClick={() => setPreview(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="diff-columns">
              <div>
                <h4>Current note</h4>
                <pre>{preview.original}</pre>
              </div>
              <div>
                <h4>With concept tag</h4>
                <pre>{preview.updated}</pre>
              </div>
            </div>
            <p className="small-note">
              Noctua keeps a backup and checks for external edits before saving.
            </p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPreview(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={writing}
                onClick={async () => {
                  setWriting(true)
                  const result = await call<{ saved: boolean }>({
                    action: 'writeTag',
                    conceptId: preview.conceptId,
                    expectedRevision: preview.revision
                  })
                  await refresh()
                  setWriting(false)
                  if (result?.saved) setPreview(null)
                }}
              >
                <Save size={15} />
                Save tag to vault
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsDialog({
  snapshot,
  call,
  refresh,
  onClose,
  onConnect
}: {
  snapshot: Snapshot
  call: Call
  refresh: () => Promise<void>
  onClose: () => void
  onConnect: () => void
}) {
  const [tab, setTab] = useState<'providers' | 'models' | 'knowledge' | 'profile'>('providers')
  const [settings, setSettings] = useState<Settings>({
    ...snapshot.settings,
    embeddings: { ...snapshot.settings.embeddings }
  })
  const [ids, setIds] = useState(snapshot.settings.localModelIds.join(', '))
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [loginReply, setLoginReply] = useState('')
  const selectableModels = modelsForPicker(snapshot.models)
  const modelChoices = (selected: string) => (
    <>
      {selected && !selectableModels.some((model) => model.key === selected) && (
        <option value={selected} disabled>
          {selected} · unavailable
        </option>
      )}
      {selectableModels.map((model) => (
        <option key={model.key} value={model.key} disabled={!model.ready}>
          {model.name}
          {model.local ? ' · local' : ` · ${model.provider}`}
          {!model.ready ? ' · connect first' : ''}
        </option>
      ))}
    </>
  )
  const save = async () => {
    setSaving(true)
    const result = await call<Snapshot>({
      action: 'settings',
      settings: {
        ...settings,
        openaiAuthMode: snapshot.settings.openaiAuthMode,
        localModelIds: ids
          .split(/[,\n]/)
          .map((id) => id.trim())
          .filter(Boolean)
      },
      apiKey: key || undefined
    })
    if (result) {
      setKey('')
      setStatus(
        tab === 'profile'
          ? 'Profile saved.'
          : tab === 'models'
            ? 'Model defaults saved.'
            : 'Settings saved.'
      )
      await refresh()
    }
    setSaving(false)
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>Make Noctua your own.</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="settings-tabs">
          <button
            className={tab === 'providers' ? 'active' : ''}
            onClick={() => setTab('providers')}
          >
            <Cable size={16} />
            Providers
          </button>
          <button className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}>
            <Settings2 size={16} />
            Models
          </button>
          <button
            className={tab === 'knowledge' ? 'active' : ''}
            onClick={() => setTab('knowledge')}
          >
            <FolderOpen size={16} />
            Knowledge & storage
          </button>
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            <UserRound size={16} />
            Profile
          </button>
        </div>
        <div className="settings-content">
          {tab === 'profile' ? (
            <>
              <h3>Your profile</h3>
              <p className="field-description">
                Your background and instructions are included when you use a model. Your photo
                appears beside your chat messages.
              </p>
              <div className="profile-photo-field">
                <div className="profile-photo-preview">
                  {settings.profile?.picture ? (
                    <img src={settings.profile.picture} alt="Profile preview" />
                  ) : (
                    <UserRound size={28} />
                  )}
                </div>
                <label className="secondary-button profile-photo-upload">
                  Choose photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Profile photo"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      if (
                        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                        file.size > 5 * 1024 * 1024
                      ) {
                        setStatus('Choose a PNG, JPEG, or WebP photo under 5 MB.')
                        return
                      }
                      try {
                        const bitmap = await createImageBitmap(file)
                        const canvas = document.createElement('canvas')
                        canvas.width = canvas.height = 256
                        const context = canvas.getContext('2d')!
                        const size = Math.min(bitmap.width, bitmap.height)
                        context.drawImage(
                          bitmap,
                          (bitmap.width - size) / 2,
                          (bitmap.height - size) / 2,
                          size,
                          size,
                          0,
                          0,
                          256,
                          256
                        )
                        bitmap.close()
                        const picture = canvas.toDataURL('image/png')
                        setSettings((previous) => ({
                          ...previous,
                          profile: {
                            name: '',
                            about: '',
                            instructions: '',
                            ...previous.profile,
                            picture
                          }
                        }))
                        setStatus('Photo ready. Save your profile to apply it.')
                      } catch {
                        setStatus('This photo could not be opened. Choose another image.')
                      }
                    }}
                  />
                </label>
                {settings.profile?.picture && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setSettings((previous) => ({
                        ...previous,
                        profile: { ...previous.profile!, picture: undefined }
                      }))
                    }
                  >
                    Remove photo
                  </button>
                )}
              </div>
              {(
                [
                  ['name', 'Name'],
                  ['about', 'About you'],
                  ['instructions', 'Custom instructions']
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  {field === 'name' ? (
                    <input
                      value={settings.profile?.name || ''}
                      maxLength={100}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          profile: {
                            about: '',
                            instructions: '',
                            ...previous.profile,
                            name: event.target.value
                          }
                        }))
                      }
                    />
                  ) : (
                    <textarea
                      rows={field === 'about' ? 4 : 6}
                      maxLength={6000}
                      value={settings.profile?.[field] || ''}
                      placeholder={
                        field === 'about'
                          ? 'Your studies, interests, goals, and prior experience…'
                          : 'How would you like the tutor to help you?'
                      }
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          profile: {
                            name: '',
                            about: '',
                            instructions: '',
                            ...previous.profile,
                            [field]: event.target.value
                          }
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </>
          ) : tab === 'providers' ? (
            <>
              <h3>ChatGPT subscription</h3>
              <p className="field-description">
                Connect your ChatGPT account using Pi’s browser sign-in. You can then choose OpenAI
                models in the composer.
              </p>
              {snapshot.subscriptionConnected ? (
                <button
                  className="text-button danger"
                  disabled={saving || snapshot.providerLogin.status === 'waiting'}
                  onClick={async () => {
                    setSaving(true)
                    await call({ action: 'providerLogout' })
                    await refresh()
                    setSaving(false)
                  }}
                >
                  Disconnect ChatGPT
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={saving || snapshot.providerLogin.status === 'waiting'}
                  onClick={async () => {
                    setLoginReply('')
                    await call({ action: 'providerLogin' })
                    await refresh()
                  }}
                >
                  Sign in with ChatGPT
                </button>
              )}
              {snapshot.subscriptionConnected && (
                <p className="small-note">ChatGPT connected. API keys are a separate connection.</p>
              )}
              {snapshot.providerLogin.message && (
                <p className="small-note" role="status">
                  {snapshot.providerLogin.message}
                </p>
              )}
              {snapshot.providerLogin.status === 'waiting' && (
                <div className="login-controls">
                  {snapshot.providerLogin.url && (
                    <button
                      className="text-button"
                      onClick={() => {
                        void call({ action: 'openLink', url: snapshot.providerLogin.url! })
                      }}
                    >
                      Reopen sign-in page
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={async () => {
                      await call({ action: 'providerLoginCancel' })
                      await refresh()
                    }}
                  >
                    Cancel sign-in
                  </button>
                  {snapshot.providerLogin.prompt && (
                    <label>
                      Browser didn’t return here? Paste the final redirect link.
                      <input
                        aria-label="Sign-in redirect link"
                        value={loginReply}
                        onChange={(event) => setLoginReply(event.target.value)}
                        placeholder={
                          snapshot.providerLogin.prompt.placeholder ||
                          'http://localhost:…/auth/callback?…'
                        }
                        autoComplete="off"
                      />
                      <button
                        className="text-button"
                        disabled={!loginReply.trim()}
                        onClick={async () => {
                          await call({ action: 'providerLoginReply', text: loginReply.trim() })
                          setLoginReply('')
                          await refresh()
                        }}
                      >
                        Complete sign-in
                      </button>
                    </label>
                  )}
                </div>
              )}
              <p className="small-note">
                {snapshot.settings.usePiCredentials
                  ? 'Your existing Pi credential store is used for this connection.'
                  : 'Noctua encrypts saved sign-in credentials with the OS keychain. Without encryption, the connection lasts for this app run only.'}
              </p>
              <div className="settings-divider" />
              <h3>API providers</h3>
              <p className="field-description">
                Pi provides the model catalog and provider adapters. Choose the model you want in
                the chat composer.
              </p>
              <div className="field-row">
                <label>
                  Provider
                  <select
                    value={settings.apiProvider}
                    onChange={(event) => {
                      setSettings({ ...settings, apiProvider: event.target.value })
                      setKey('')
                    }}
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="xai">xAI</option>
                    <option value="mistral">Mistral</option>
                    <option value="groq">Groq</option>
                  </select>
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    placeholder={
                      snapshot.keyProviders.includes(settings.apiProvider)
                        ? 'Key saved · leave blank to keep'
                        : 'Enter a provider key'
                    }
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
              {snapshot.keyProviders.includes(settings.apiProvider) && (
                <button
                  className="text-button danger"
                  onClick={async () => {
                    await call({
                      action: 'settings',
                      settings: snapshot.settings,
                      clearProviderKey: settings.apiProvider
                    })
                    await refresh()
                    setStatus('Provider key removed.')
                  }}
                >
                  <Trash2 size={12} />
                  Remove saved key
                </button>
              )}
              <label className="checkbox-label pi-auth">
                <input
                  type="checkbox"
                  checked={settings.usePiCredentials}
                  onChange={(event) =>
                    setSettings({ ...settings, usePiCredentials: event.target.checked })
                  }
                />
                <span>
                  Use my existing Pi login
                  <small>
                    Reuse your Pi provider logins, including ChatGPT/Codex and normal token refresh.
                    Noctua keeps its bounded study tools and reviewed search integration.
                  </small>
                </span>
              </label>
              <p className="small-note">
                New keys are encrypted with the OS keychain where available. If encryption is
                unavailable, they are kept for this app run only.
              </p>
              <div className="settings-divider" />
              <h3>Local server</h3>
              <p className="field-description">
                Use a tool-capable model in Ollama or LM Studio. Noctua discovers models from your
                local server.
              </p>
              <label>
                OpenAI-compatible local endpoint
                <input
                  value={settings.localBaseUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, localBaseUrl: event.target.value })
                  }
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </label>
              <label>
                Additional model IDs <span className="optional">optional, comma separated</span>
                <input
                  value={ids}
                  onChange={(event) => setIds(event.target.value)}
                  placeholder="e.g. a model already installed on your server"
                />
              </label>
              <div className="provider-status">
                <span className="status-dot" />
                {snapshot.models.filter((model) => model.ready).length} available models
                <button
                  className="text-button"
                  disabled={saving || snapshot.providerLogin.status === 'waiting'}
                  onClick={async () => {
                    setSaving(true)
                    await call({ action: 'models' })
                    await refresh()
                    setSaving(false)
                    setStatus('Model list refreshed.')
                  }}
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>
              {snapshot.modelDiscoveryStatus && (
                <p className="small-note">{snapshot.modelDiscoveryStatus}</p>
              )}
              <div className="settings-divider" />
              <h3>Web resources</h3>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!settings.webSearch?.enabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      webSearch: { enabled: event.target.checked, provider: 'exa' }
                    })
                  }
                />
                Enable Pi Web Access search
              </label>
              <p className="small-note">
                Uses Pi Web Access’s Exa search backend. When enabled, the tutor can send search
                queries to Exa to find papers, textbooks, and current documentation.
              </p>
            </>
          ) : tab === 'models' ? (
            <>
              <h3>Default models</h3>
              <p className="field-description">
                Choose which model handles each job. You can also change the main chat model in the
                composer. Connect accounts and local servers in Providers.
              </p>
              <div className="role-models">
                <div>
                  <label>
                    Main chat
                    <select
                      aria-label="Main chat"
                      value={settings.modelKey}
                      onChange={(event) =>
                        setSettings({ ...settings, modelKey: event.target.value })
                      }
                    >
                      {!settings.modelKey && <option value="">Choose a model</option>}
                      {modelChoices(settings.modelKey)}
                    </select>
                  </label>
                  <p className="small-note">
                    Your default tutor for questions and study activities.
                  </p>
                </div>
                {(
                  [
                    [
                      'chatTitle',
                      'Chat naming',
                      'Names a new chat from your first question, in the background while the tutor answers. Manual names are preserved.'
                    ],
                    [
                      'organizer',
                      'Placement & organization',
                      'Places captured bits and cards with the relevant concepts.'
                    ],
                    [
                      'evaluator',
                      'Exercise evaluation',
                      'Checks reasoning and provides feedback on exercise attempts.'
                    ]
                  ] as const
                ).map(([role, label, description]) => (
                  <div key={role}>
                    <label>
                      {label}
                      <select
                        aria-label={label}
                        value={settings.roleModels?.[role] || ''}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            roleModels: {
                              ...settings.roleModels,
                              [role]: event.target.value || undefined
                            }
                          })
                        }
                      >
                        <option value="">Same as main chat</option>
                        {modelChoices(settings.roleModels?.[role] || '')}
                      </select>
                    </label>
                    <p className="small-note">{description}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3>Your knowledge folder</h3>
              <p className="field-description">
                Markdown stays readable in Obsidian and other editors. Noctua reads your selected
                folder. Note improvements are collected for review; accepting checks the current
                version and keeps a backup.
              </p>
              <div className="settings-vault">
                <FolderOpen size={22} />
                <span>{snapshot.settings.vaultPath || 'No vault connected'}</span>
                <button
                  className="secondary-button"
                  onClick={() => {
                    onClose()
                    onConnect()
                  }}
                >
                  {snapshot.settings.vaultPath ? 'Change' : 'Connect'}
                </button>
              </div>
              <div className="settings-divider" />
              <h3>Semantic retrieval</h3>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.embeddings.enabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      embeddings: { ...settings.embeddings, enabled: event.target.checked }
                    })
                  }
                />
                Cache vector embeddings with Ollama
              </label>
              <div className="field-row">
                <label>
                  Ollama endpoint
                  <input
                    value={settings.embeddings.baseUrl}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        embeddings: { ...settings.embeddings, baseUrl: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  Embedding model
                  <input
                    value={settings.embeddings.model}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        embeddings: { ...settings.embeddings, model: event.target.value }
                      })
                    }
                  />
                </label>
              </div>
              <p className="small-note">
                Install the embedding model in Ollama, then save these settings and cache your
                notes. Changed files are refreshed in the background; unchanged content reuses its
                cache. Text search stays available when local embeddings are offline.
              </p>
              <button
                className="secondary-button"
                disabled={!snapshot.settings.vaultPath || snapshot.index.indexing || saving}
                onClick={async () => {
                  await call({ action: 'index' })
                  await refresh()
                  setStatus('Vault cache refreshed.')
                }}
              >
                {snapshot.index.indexing ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Chunk & cache notes
              </button>
              <button
                className="secondary-button"
                disabled={!snapshot.settings.vaultPath || snapshot.index.indexing || saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const result = await call<Snapshot>({ action: 'clearVaultCache' })
                    if (result) {
                      await refresh()
                      setStatus('Vault cache deleted.')
                    }
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                <Trash2 size={14} />
                Delete vault cache
              </button>
              <p className="small-note">
                Deletes cached passages and vectors for this folder. Notes, chats and study history
                are kept. Choose Chunk &amp; cache notes to rebuild the cache and resume automatic
                updates.
              </p>
              <p className="small-note">
                {snapshot.index.chunks} passages · {snapshot.index.vectors} vectors ·{' '}
                {snapshot.index.message}
              </p>
              <div className="settings-divider" />
              <h3>Study data</h3>
              <p className="field-description">
                Chats, cards, FSRS reviews, exercise attempts, and concept judgments are durable
                SQLite records. Source vectors are a rebuildable cache.
              </p>
              <code className="data-path">{snapshot.dataPath}</code>
              <button
                className="secondary-button export-button"
                onClick={async () => {
                  const file = await call<string>({ action: 'export' })
                  if (file) setStatus(`Export saved: ${file}`)
                }}
              >
                <Download size={14} />
                Export study data or Markdown activities
              </button>
            </>
          )}
        </div>
        {status && (
          <p className="settings-status" role="status">
            <Check size={14} />
            {status}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Done
          </button>
          <button
            className="primary-button"
            disabled={saving || snapshot.providerLogin.status === 'waiting'}
            onClick={() => {
              void save()
            }}
          >
            {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save settings
          </button>
        </div>
      </div>
    </div>
  )
}
