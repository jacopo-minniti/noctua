import { useEffect, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Undo2,
  X
} from 'lucide-react'
import type {
  Flashcard,
  Level,
  NoteProposal,
  Request,
  Snapshot,
  Source,
  StudyBit,
  StudyGoal,
  StudyGuide
} from '../../shared/types'
import { levels } from '../../shared/types'
import { Markdown } from './Markdown'
import './ecosystem.css'

type Call = <T = unknown>(request: Request) => Promise<T | null>
type Shared = {
  snapshot: Snapshot
  chatId: string
  call: Call
  refresh: () => Promise<void>
  onSource: (source: Source) => void
  notify?: (text: string) => void
  onOpenActivity?: (kind: 'cards' | 'exercises', id: string) => void
}
function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
    } catch {
      return fallback
    }
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

export function StudyPanels({
  snapshot,
  chatId,
  call,
  refresh,
  onSource,
  notify,
  onCreateCard,
  onOpenActivity
}: Shared & { onCreateCard?: (text: string, conceptId?: string) => void }) {
  const [tab, setTab] = useStored<'capture' | 'changes' | 'guide'>(
    `noctua-study-tab:${chatId}`,
    'capture'
  )
  const conversation = snapshot.conversations.find((item) => item.id === chatId)
  const pending = snapshot.noteProposals.filter(
    (proposal) =>
      proposal.scope === snapshot.vaultScope &&
      (proposal.status === 'pending' || proposal.status === 'conflict')
  )
  return (
    <div className="study-panel">
      <div className="panel-title">
        <div>
          <h3>Build on your thinking.</h3>
          <p>Keep useful bits, connections, and improvements.</p>
        </div>
      </div>
      <div className="study-mode-controls">
        <label>
          <input
            type="checkbox"
            checked={conversation?.studyMode === 'guided'}
            onChange={async (event) => {
              await call({
                action: 'updateStudy',
                conversationId: chatId,
                studyMode: event.target.checked ? 'guided' : 'free'
              })
              await refresh()
            }}
          />
          <span>
            Guided study<small>Let the tutor suggest a useful next move.</small>
          </span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!conversation?.buildNotes}
            onChange={async (event) => {
              await call({
                action: 'updateStudy',
                conversationId: chatId,
                buildNotes: event.target.checked
              })
              await refresh()
            }}
          />
          <span>
            Build notes as I study<small>Collect proposed changes for your review.</small>
          </span>
        </label>
      </div>
      <div className="study-panel-tabs" role="tablist" aria-label="Notes and study">
        <button role="tab" aria-selected={tab === 'capture'} onClick={() => setTab('capture')}>
          <Inbox size={14} />
          Bits
        </button>
        <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>
          <GitBranch size={14} />
          Changes{pending.length > 0 && <span>{pending.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'guide'} onClick={() => setTab('guide')}>
          <BookOpen size={14} />
          Guide
        </button>
      </div>
      {tab === 'capture' && (
        <CapturePanel
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          refresh={refresh}
          onSource={onSource}
          notify={notify}
          onCreateCard={onCreateCard}
        />
      )}
      {tab === 'changes' && (
        <ProposalPanel
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          refresh={refresh}
          onSource={onSource}
          notify={notify}
        />
      )}
      {tab === 'guide' && (
        <GuidePanel
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          refresh={refresh}
          onSource={onSource}
          notify={notify}
          onOpenActivity={onOpenActivity}
        />
      )}
    </div>
  )
}

function CapturePanel({
  snapshot,
  chatId,
  call,
  refresh,
  onSource,
  notify,
  onCreateCard
}: Shared & { onCreateCard?: (text: string, conceptId?: string) => void }) {
  const [text, setText] = useStored(`noctua-bit-draft:${chatId}`, '')
  const [conceptId, setConceptId] = useStored(`noctua-bit-concept:${chatId}`, '')
  const [saving, setSaving] = useState(false),
    [placing, setPlacing] = useState(false),
    [reason, setReason] = useState('')
  const [editing, setEditing] = useState<StudyBit | null>(null),
    [proposing, setProposing] = useState<StudyBit | null>(null)
  const [cardBit, setCardBit] = useState<StudyBit | null>(null)
  const bits = snapshot.bits
    .filter((bit) => bit.scope === snapshot.vaultScope)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ready = snapshot.models.some(
    (model) =>
      model.key === (snapshot.settings.roleModels?.organizer || snapshot.settings.modelKey) &&
      model.ready
  )
  return (
    <>
      <div className="bit-composer">
        <label htmlFor="study-bit">A bit worth keeping</label>
        <textarea
          id="study-bit"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="An explanation in your words, a question, or a small connection…"
        />
        <div className="bit-destination">
          <select
            aria-label="Concept for this bit"
            value={conceptId}
            onChange={(event) => setConceptId(event.target.value)}
          >
            <option value="">Save to inbox</option>
            {snapshot.concepts
              .filter(
                (concept) =>
                  concept.scope === snapshot.vaultScope || concept.scope === `attachments:${chatId}`
              )
              .map((concept) => (
                <option value={concept.id} key={concept.id}>
                  {concept.title}
                </option>
              ))}
          </select>
          <button
            className="icon-button"
            title="Ask model where this bit belongs"
            disabled={!text.trim() || !ready || placing}
            onClick={async () => {
              setPlacing(true)
              try {
                const result = await call<{ conceptId: string | null; reason: string }>({
                  action: 'suggestPlacement',
                  conversationId: chatId,
                  text
                })
                if (result) {
                  setConceptId(result.conceptId || '')
                  setReason(result.reason)
                }
              } finally {
                setPlacing(false)
              }
            }}
          >
            {placing ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
          </button>
        </div>
        {reason && <p className="placement-reason">{reason}</p>}
        <button
          className="primary-button"
          disabled={!text.trim() || saving}
          onClick={async () => {
            setSaving(true)
            try {
              const result = await call<StudyBit>({
                action: 'captureBit',
                conversationId: chatId,
                text,
                conceptIds: conceptId ? [conceptId] : []
              })
              if (result) {
                setText('')
                setReason('')
                notify?.('Bit saved.')
                await refresh()
              }
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}Keep this bit
        </button>
      </div>
      <div className="section-label">YOUR BITS · {bits.length}</div>
      {bits.length ? (
        bits.map((bit) => (
          <article className="study-bit" key={bit.id}>
            <div className="study-bit-meta">
              <span>
                {bit.origin === 'learner'
                  ? 'Your words'
                  : bit.origin === 'quotation'
                    ? 'Source quotation'
                    : 'AI suggestion'}{' '}
                · {bit.status === 'inbox' ? 'Inbox' : bit.status}
              </span>
              <button className="icon-button" title="Edit bit" onClick={() => setEditing(bit)}>
                <Pencil size={12} />
              </button>
            </div>
            <Markdown text={bit.text} />
            {!!bit.conceptIds.length && (
              <div className="bit-concept-chips">
                {bit.conceptIds.map((id) => (
                  <span key={id}>
                    {snapshot.concepts.find((concept) => concept.id === id)?.title ||
                      'Archived concept'}
                  </span>
                ))}
              </div>
            )}
            {bit.source && (
              <button className="text-button" onClick={() => onSource(bit.source!)}>
                <FileText size={12} />
                {bit.source.title}
                {bit.source.page ? ` · p. ${bit.source.page}` : ''}
              </button>
            )}
            <div className="bit-actions">
              <button
                className="text-button"
                onClick={() => {
                  if (onCreateCard) onCreateCard(bit.text, bit.conceptIds[0])
                  else setCardBit(bit)
                }}
              >
                <Plus size={12} />
                Make a card
              </button>
              <button
                className="text-button"
                disabled={bit.status === 'placed' || !snapshot.settings.vaultPath}
                onClick={() => setProposing(bit)}
              >
                <FileText size={12} />
                Place in a note
              </button>
            </div>
          </article>
        ))
      ) : (
        <div className="panel-empty">
          <Inbox size={30} strokeWidth={1.2} />
          <h3>Catch an idea while it is fresh.</h3>
          <p>Save now. Find its place when you are ready.</p>
        </div>
      )}
      {editing && (
        <BitEditor
          bit={editing}
          snapshot={snapshot}
          call={call}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}
      {proposing && (
        <ProposalEditor
          bit={proposing}
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          onClose={() => setProposing(null)}
          onSaved={async () => {
            setProposing(null)
            await refresh()
            notify?.('Note change added to your review group.')
          }}
        />
      )}
      {cardBit && (
        <BitCardEditor
          bit={cardBit}
          chatId={chatId}
          call={call}
          onClose={() => setCardBit(null)}
          onSaved={async () => {
            setCardBit(null)
            await refresh()
            notify?.('Card saved. Open Cards to review it.')
          }}
        />
      )}
    </>
  )
}

function BitEditor({
  bit,
  snapshot,
  call,
  onClose,
  onSaved
}: {
  bit: StudyBit
  snapshot: Snapshot
  call: Call
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [text, setText] = useState(bit.text),
    [conceptId, setConceptId] = useState(bit.conceptIds[0] || ''),
    [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bit-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CAPTURED BIT</span>
            <h2>Keep your meaning clear.</h2>
          </div>
          <button className="icon-button" aria-label="Close bit editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Your bit
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            autoFocus
          />
        </label>
        <label>
          Concept
          <select value={conceptId} onChange={(event) => setConceptId(event.target.value)}>
            <option value="">Inbox · no concept yet</option>
            {snapshot.concepts
              .filter(
                (concept) =>
                  concept.scope === snapshot.vaultScope ||
                  concept.scope === `attachments:${bit.conversationId}`
              )
              .map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.title}
                </option>
              ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!text.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call({
                  action: 'updateBit',
                  bitId: bit.id,
                  text,
                  conceptIds: Array.from(
                    new Set([...(conceptId ? [conceptId] : []), ...bit.conceptIds.slice(1)])
                  ),
                  status: conceptId ? 'linked' : 'inbox'
                })
                if (result) await onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            <Save size={14} />
            Save bit
          </button>
        </div>
      </div>
    </div>
  )
}

function BitCardEditor({
  bit,
  chatId,
  call,
  onClose,
  onSaved
}: {
  bit: StudyBit
  chatId: string
  call: Call
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [front, setFront] = useState(''),
    [back, setBack] = useState(bit.text),
    [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">FLASHCARD FROM YOUR BIT</span>
            <h2>A useful question.</h2>
          </div>
          <button className="icon-button" aria-label="Close flashcard editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Question
          <textarea
            rows={3}
            value={front}
            onChange={(event) => setFront(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          Answer
          <textarea rows={5} value={back} onChange={(event) => setBack(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!front.trim() || !back.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<Flashcard>({
                  action: 'saveCard',
                  front,
                  back,
                  conceptId: bit.conceptIds[0] || null,
                  conversationId: chatId
                })
                if (result) await onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            <Save size={14} />
            Save card
          </button>
        </div>
      </div>
    </div>
  )
}

function ProposalPanel({ snapshot, chatId, call, refresh, notify }: Shared) {
  const [selected, setSelected] = useState<string[]>([]),
    [reviewing, setReviewing] = useState(false),
    [editing, setEditing] = useState<NoteProposal | 'new' | null>(null)
  const proposals = snapshot.noteProposals.filter(
    (proposal) =>
      proposal.scope === snapshot.vaultScope &&
      (proposal.status === 'pending' || proposal.status === 'conflict')
  )
  const accepted = snapshot.noteProposals
    .filter((proposal) => proposal.scope === snapshot.vaultScope && proposal.status === 'accepted')
    .slice()
    .reverse()
  const selectedIds = selected.filter((id) =>
    proposals.some((proposal) => proposal.id === id && proposal.status === 'pending')
  )
  const decide = async (decision: 'accept' | 'reject') => {
    if (!selectedIds.length) return
    setReviewing(true)
    try {
      const result = await call({ action: 'reviewNotes', proposalIds: selectedIds, decision })
      if (result) {
        setSelected([])
        notify?.(
          decision === 'accept'
            ? 'Review saved. Any external-edit conflicts remain here for inspection.'
            : 'Selected changes rejected.'
        )
      }
      await refresh()
    } finally {
      setReviewing(false)
    }
  }
  return (
    <>
      <div className="proposal-overview">
        <p>Review improvements together. Your words and model suggestions keep their origins.</p>
        <button
          className="text-button"
          disabled={!snapshot.settings.vaultPath}
          onClick={() => setEditing('new')}
        >
          <Plus size={12} />
          Propose an addition
        </button>
      </div>
      {!!proposals.length && (
        <div className="proposal-group-actions">
          <label>
            <input
              type="checkbox"
              checked={
                !!proposals.filter((proposal) => proposal.status === 'pending').length &&
                selectedIds.length ===
                  proposals.filter((proposal) => proposal.status === 'pending').length
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? proposals
                        .filter((proposal) => proposal.status === 'pending')
                        .map((proposal) => proposal.id)
                    : []
                )
              }
            />
            Select pending changes
          </label>
          <span>{selectedIds.length} selected</span>
        </div>
      )}
      {proposals.length ? (
        proposals.map((proposal) => (
          <article className={`note-proposal ${proposal.status}`} key={proposal.id}>
            <div className="note-proposal-heading">
              <input
                type="checkbox"
                aria-label={`Select proposed change to ${proposal.path}`}
                disabled={proposal.status === 'conflict'}
                checked={selected.includes(proposal.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, proposal.id]
                      : previous.filter((id) => id !== proposal.id)
                  )
                }
              />
              <div>
                <strong>{proposal.path}</strong>
                <small>
                  {proposal.origin === 'learner' ? 'Your contribution' : 'AI suggestion'} ·{' '}
                  {proposal.operation === 'append' ? 'Addition' : 'Replacement'}
                </small>
              </div>
              <button
                className="icon-button"
                title="Edit proposed note change"
                onClick={() => setEditing(proposal)}
              >
                <Pencil size={13} />
              </button>
            </div>
            <p>{proposal.rationale}</p>
            {proposal.status === 'conflict' && (
              <p className="proposal-conflict">
                The note changed outside this proposal. Review and recreate the change against its
                current version.
              </p>
            )}
            <details className="proposal-diff" open>
              <summary>Inspect the exact change</summary>
              {proposal.operation === 'replace' && (
                <div className="proposal-before">
                  <span>Replace this passage</span>
                  <pre>{proposal.before}</pre>
                </div>
              )}
              <div className="proposal-after">
                <span>
                  {proposal.operation === 'append' ? 'Add to the note' : 'With this passage'}
                </span>
                <pre>{proposal.after}</pre>
              </div>
            </details>
          </article>
        ))
      ) : (
        <div className="panel-empty">
          <GitBranch size={30} strokeWidth={1.2} />
          <h3>Room for thoughtful changes.</h3>
          <p>
            Capture your explanations or enable
            <br />
            “Build notes as I study” to collect proposals.
          </p>
        </div>
      )}
      {!!proposals.length && (
        <div className="proposal-review-bar">
          <button
            className="text-button"
            disabled={reviewing || !selectedIds.length}
            onClick={() => {
              void decide('reject')
            }}
          >
            Reject selected
          </button>
          <button
            className="primary-button"
            disabled={reviewing || !selectedIds.length}
            onClick={() => {
              void decide('accept')
            }}
          >
            {reviewing ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Accept
            selected ({selectedIds.length})
          </button>
        </div>
      )}
      {!!accepted.length && (
        <details className="accepted-note-changes">
          <summary>Saved changes ({accepted.length})</summary>
          {accepted.map((proposal) => (
            <div key={proposal.id}>
              <span>
                {proposal.path}
                {proposal.appliedBy === 'model' ? ' · Model edit' : ''}
              </span>
              <button
                className="text-button"
                title="Accepted changes applied to this file together are undone together. Later external edits are protected."
                onClick={async () => {
                  const result = await call({ action: 'undoNote', proposalId: proposal.id })
                  if (result) {
                    await refresh()
                    notify?.('Note change undone.')
                  }
                }}
              >
                <Undo2 size={12} />
                Undo file changes
              </button>
            </div>
          ))}
        </details>
      )}
      {editing && (
        <ProposalEditor
          proposal={editing === 'new' ? undefined : editing}
          snapshot={snapshot}
          chatId={chatId}
          call={call}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}
    </>
  )
}

function ProposalEditor({
  bit,
  proposal,
  snapshot,
  chatId,
  call,
  onClose,
  onSaved
}: {
  bit?: StudyBit
  proposal?: NoteProposal
  snapshot: Snapshot
  chatId: string
  call: Call
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [path, setPath] = useState(
    proposal?.path ||
      snapshot.concepts.find((concept) => bit?.conceptIds.includes(concept.id))?.path ||
      ''
  )
  const [after, setAfter] = useState(
    proposal?.after ||
      (bit?.origin === 'quotation'
        ? bit.text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
        : bit?.text) ||
      ''
  )
  const [rationale, setRationale] = useState(
    proposal?.rationale || (bit ? 'Place this captured contribution in its related note.' : '')
  )
  const [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal proposal-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">PROPOSED NOTE CHANGE</span>
            <h2>Put the idea in context.</h2>
          </div>
          <button className="icon-button" aria-label="Close proposed note change" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Existing Markdown note
          <select value={path} onChange={(event) => setPath(event.target.value)}>
            <option value="">Choose a note</option>
            {snapshot.documents
              .filter((document) => document.kind === 'markdown')
              .map((document) => (
                <option key={document.path} value={document.path}>
                  {document.title} · {document.path}
                </option>
              ))}
          </select>
        </label>
        <label>
          {proposal?.operation === 'replace' ? 'Replacement passage' : 'Addition'}
          <textarea
            rows={8}
            value={after}
            onChange={(event) => setAfter(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          Reason
          <input value={rationale} onChange={(event) => setRationale(event.target.value)} />
        </label>
        <p className="small-note">
          This joins your review group. Accepting checks the current file version and keeps a
          recoverable backup.
        </p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={saving || !path || !after.trim() || !rationale.trim()}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<NoteProposal>({
                  action: 'proposeNote',
                  conversationId: proposal?.conversationId || bit?.conversationId || chatId,
                  proposal: {
                    id: proposal?.status === 'conflict' ? undefined : proposal?.id,
                    path,
                    after,
                    rationale,
                    operation: proposal?.operation || 'append',
                    before: proposal?.before || '',
                    origin: bit?.origin === 'model' ? 'model' : proposal?.origin || 'learner',
                    bitIds: bit ? [bit.id] : proposal?.bitIds || [],
                    conceptIds: bit?.conceptIds || proposal?.conceptIds || []
                  }
                })
                if (result) {
                  if (proposal?.status === 'conflict')
                    await call({
                      action: 'reviewNotes',
                      proposalIds: [proposal.id],
                      decision: 'reject'
                    })
                  await onSaved()
                }
              } finally {
                setSaving(false)
              }
            }}
          >
            <Save size={14} />
            Add to review group
          </button>
        </div>
      </div>
    </div>
  )
}

function GuidePanel({ snapshot, chatId, call, refresh, onSource, onOpenActivity }: Shared) {
  const [editingGoal, setEditingGoal] = useState<StudyGoal | 'new' | null>(null),
    [editingGuide, setEditingGuide] = useState<StudyGuide | 'new' | null>(null)
  const conversation = snapshot.conversations.find((item) => item.id === chatId)
  const goals = snapshot.goals.filter(
    (goal) =>
      goal.scope === snapshot.vaultScope &&
      (goal.conversationId === chatId || goal.id === conversation?.goalId)
  )
  const guides = snapshot.guides.filter(
    (guide) =>
      guide.scope === snapshot.vaultScope &&
      (guide.conversationId === chatId || (guide.goalId && guide.goalId === conversation?.goalId))
  )
  const [resolvedSources, setResolvedSources] = useState<Source[]>([])
  const sources = [
    ...guides.flatMap((guide) => guide.sources || []),
    ...resolvedSources,
    ...snapshot.cards.flatMap((card) => card.sources),
    ...snapshot.exercises.flatMap((exercise) => exercise.sources),
    ...Object.values(snapshot.attachments).flat()
  ]
  const unresolvedIds = Array.from(new Set(guides.flatMap((guide) => guide.sourceIds))).filter(
    (id) => !sources.some((source) => source.id === id)
  )
  const unresolvedKey = unresolvedIds.join('|')
  useEffect(() => {
    if (!unresolvedIds.length) return
    let cancelled = false
    void call<Source[]>({
      action: 'resolveSources',
      conversationId: chatId,
      sourceIds: unresolvedIds.slice(0, 40)
    }).then((result) => {
      if (result && !cancelled) setResolvedSources((previous) => [...previous, ...result])
    })
    return () => {
      cancelled = true
    }
  }, [unresolvedKey, chatId])
  return (
    <>
      <div className="guide-section-heading">
        <span className="section-label">WHAT YOU WANT TO DO</span>
        <button
          className="icon-button"
          title="Create study goal"
          onClick={() => setEditingGoal('new')}
        >
          <Plus size={16} />
        </button>
      </div>
      {goals.map((goal) => (
        <article
          className={`study-goal ${conversation?.goalId === goal.id ? 'active' : ''}`}
          key={goal.id}
        >
          <div className="study-goal-heading">
            <h4>{goal.title}</h4>
            <button
              className="icon-button"
              title="Edit study goal"
              onClick={() => setEditingGoal(goal)}
            >
              <Pencil size={12} />
            </button>
          </div>
          <Markdown text={goal.description} />
          <small>
            {goal.depth === 'orientation'
              ? 'Orientation'
              : goal.depth === 'working'
                ? 'Working familiarity'
                : 'Deep understanding'}
            {goal.desiredLevel ? ` · #${goal.desiredLevel}` : ''} · {goal.status}
          </small>
          {conversation?.goalId !== goal.id && (
            <button
              className="text-button"
              onClick={async () => {
                await call({ action: 'updateStudy', conversationId: chatId, goalId: goal.id })
                await refresh()
              }}
            >
              <Check size={12} />
              Use this goal
            </button>
          )}
        </article>
      ))}
      {!goals.length && (
        <p className="small-note">
          A goal can describe the practical outcome and how deep you need to go. It is optional.
        </p>
      )}
      <div className="guide-section-heading">
        <span className="section-label">YOUR GUIDES</span>
        <button
          className="icon-button"
          title="Create study guide"
          onClick={() => setEditingGuide('new')}
        >
          <Plus size={16} />
        </button>
      </div>
      {guides.length ? (
        guides.map((guide) => (
          <article className="study-guide" key={guide.id}>
            <div className="study-goal-heading">
              <h4>{guide.title}</h4>
              <button
                className="icon-button"
                title="Edit study guide"
                onClick={() => setEditingGuide(guide)}
              >
                <Pencil size={12} />
              </button>
            </div>
            {guide.notes && <Markdown text={guide.notes} />}
            {!!guide.conceptIds.length && (
              <div className="bit-concept-chips">
                {guide.conceptIds.map((id) => (
                  <span key={id}>
                    {snapshot.concepts.find((concept) => concept.id === id)?.title ||
                      'Archived concept'}
                  </span>
                ))}
              </div>
            )}
            {!!guide.questions.length && (
              <div className="guide-questions">
                <span className="eyebrow">QUESTIONS TO EXPLORE</span>
                {guide.questions.map((question, index) => (
                  <div key={index}>
                    <span>{index + 1}</span>
                    <p>{question}</p>
                  </div>
                ))}
              </div>
            )}
            {guide.sourceIds.map((id) => {
              const source = sources.find((item) => item.id === id)
              return source ? (
                <button className="map-material" key={id} onClick={() => onSource(source)}>
                  <FileText size={13} />
                  {source.title}
                  {source.page ? ` · p. ${source.page}` : ''}
                  <ChevronRight size={12} />
                </button>
              ) : (
                <p className="small-note" key={id}>
                  Source location is currently unavailable.
                </p>
              )
            })}
            {(guide.exerciseIds.length > 0 || guide.cardIds.length > 0) && (
              <div className="guide-practice-links">
                {guide.cardIds.map((id) => {
                  const card = snapshot.cards.find((item) => item.id === id)
                  return card ? (
                    <button
                      key={id}
                      className="map-material"
                      onClick={() => onOpenActivity?.('cards', id)}
                      disabled={!onOpenActivity}
                    >
                      <BookOpen size={13} />
                      <span>Card · {card.front.slice(0, 90)}</span>
                      <ChevronRight size={12} />
                    </button>
                  ) : null
                })}
                {guide.exerciseIds.map((id) => {
                  const exercise = snapshot.exercises.find((item) => item.id === id)
                  return exercise ? (
                    <button
                      key={id}
                      className="map-material"
                      onClick={() => onOpenActivity?.('exercises', id)}
                      disabled={!onOpenActivity}
                    >
                      <Pencil size={13} />
                      <span>{exercise.title}</span>
                      <ChevronRight size={12} />
                    </button>
                  ) : null
                })}
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="panel-empty">
          <BookOpen size={30} strokeWidth={1.2} />
          <h3>An orientation, at your pace.</h3>
          <p>
            Keep guiding questions and resource links.
            <br />
            Choose where to begin and what to revisit.
          </p>
          <button className="text-button" onClick={() => setEditingGuide('new')}>
            <Plus size={13} />
            Write a guide
          </button>
        </div>
      )}
      {editingGoal && (
        <GoalEditor
          goal={editingGoal}
          snapshot={snapshot}
          call={call}
          chatId={chatId}
          onClose={() => setEditingGoal(null)}
          onSaved={async () => {
            setEditingGoal(null)
            await refresh()
          }}
        />
      )}
      {editingGuide && (
        <GuideEditor
          guide={editingGuide}
          snapshot={snapshot}
          call={call}
          chatId={chatId}
          onClose={() => setEditingGuide(null)}
          onSaved={async () => {
            setEditingGuide(null)
            await refresh()
          }}
        />
      )}
    </>
  )
}

function ConceptSelection({
  snapshot,
  chatId,
  selected,
  onChange
}: {
  snapshot: Snapshot
  chatId: string
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <details className="guide-concept-selection">
      <summary>Related concepts ({selected.length})</summary>
      <div>
        {snapshot.concepts
          .filter(
            (concept) =>
              concept.scope === snapshot.vaultScope || concept.scope === `attachments:${chatId}`
          )
          .map((concept) => (
            <label className="checkbox-label" key={concept.id}>
              <input
                type="checkbox"
                checked={selected.includes(concept.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, concept.id]
                      : selected.filter((id) => id !== concept.id)
                  )
                }
              />
              {concept.title}
            </label>
          ))}
      </div>
    </details>
  )
}
function GoalEditor({
  goal,
  snapshot,
  call,
  chatId,
  onClose,
  onSaved
}: {
  goal: StudyGoal | 'new'
  snapshot: Snapshot
  call: Call
  chatId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const source = goal === 'new' ? undefined : goal
  const [title, setTitle] = useState(source?.title || ''),
    [description, setDescription] = useState(source?.description || ''),
    [depth, setDepth] = useState<StudyGoal['depth']>(source?.depth || 'working'),
    [desiredLevel, setDesiredLevel] = useState<Level | ''>(source?.desiredLevel || ''),
    [conceptIds, setConceptIds] = useState(source?.conceptIds || []),
    [status, setStatus] = useState<StudyGoal['status']>(source?.status || 'active'),
    [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal goal-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">STUDY GOAL</span>
            <h2>What do you want to be able to do?</h2>
          </div>
          <button className="icon-button" aria-label="Close goal editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Goal
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            placeholder="Discuss and defend an LLM system design"
          />
        </label>
        <label>
          Context and limits
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Your situation, interests, constraints, and how much depth is useful."
          />
        </label>
        <div className="field-row">
          <label>
            Depth
            <select
              value={depth}
              onChange={(event) => setDepth(event.target.value as StudyGoal['depth'])}
            >
              <option value="orientation">Orientation</option>
              <option value="working">Working familiarity</option>
              <option value="deep">Deep understanding</option>
            </select>
          </label>
          <label>
            Target capability
            <select
              value={desiredLevel}
              onChange={(event) => setDesiredLevel(event.target.value as Level | '')}
            >
              <option value="">Adapt to the goal</option>
              {levels
                .filter((level) => level !== 'unknown')
                .map((level) => (
                  <option key={level} value={level}>
                    #{level}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <ConceptSelection
          snapshot={snapshot}
          chatId={chatId}
          selected={conceptIds}
          onChange={setConceptIds}
        />
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StudyGoal['status'])}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!title.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<StudyGoal>({
                  action: 'saveGoal',
                  conversationId: chatId,
                  goal: {
                    id: source?.id,
                    title,
                    description,
                    depth,
                    desiredLevel: desiredLevel || null,
                    conceptIds,
                    status
                  }
                })
                if (result) {
                  await call({ action: 'updateStudy', conversationId: chatId, goalId: result.id })
                  await onSaved()
                }
              } finally {
                setSaving(false)
              }
            }}
          >
            <Save size={14} />
            Save goal
          </button>
        </div>
      </div>
    </div>
  )
}

function GuideEditor({
  guide,
  snapshot,
  call,
  chatId,
  onClose,
  onSaved
}: {
  guide: StudyGuide | 'new'
  snapshot: Snapshot
  call: Call
  chatId: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const source = guide === 'new' ? undefined : guide
  const [title, setTitle] = useState(source?.title || ''),
    [questions, setQuestions] = useState(source?.questions.join('\n') || ''),
    [notes, setNotes] = useState(source?.notes || ''),
    [conceptIds, setConceptIds] = useState(source?.conceptIds || []),
    [goalId, setGoalId] = useState(
      source?.goalId ||
        snapshot.conversations.find((conversation) => conversation.id === chatId)?.goalId ||
        ''
    ),
    [saving, setSaving] = useState(false)
  const [cardIds, setCardIds] = useState(source?.cardIds || []),
    [exerciseIds, setExerciseIds] = useState(source?.exerciseIds || []),
    [sourceIds, setSourceIds] = useState(source?.sourceIds || []),
    [resourceSources, setResourceSources] = useState<Source[]>(source?.sources || []),
    [loadingResources, setLoadingResources] = useState(false)
  const attachmentSources = snapshot.attachments[chatId] || []
  const availableSources = Array.from(
    new Map([...resourceSources, ...attachmentSources].map((item) => [item.id, item])).values()
  )
  useEffect(() => {
    const missing = sourceIds.filter((id) => !availableSources.some((item) => item.id === id))
    if (!missing.length) return
    let cancelled = false
    void call<Source[]>({
      action: 'resolveSources',
      conversationId: chatId,
      sourceIds: missing.slice(0, 40)
    }).then((result) => {
      if (result && !cancelled) setResourceSources((previous) => [...previous, ...result])
    })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal guide-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">STUDY GUIDE</span>
            <h2>Keep a useful orientation.</h2>
          </div>
          <button className="icon-button" aria-label="Close guide editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          Goal
          <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
            <option value="">No goal selected</option>
            {snapshot.goals
              .filter(
                (goal) => goal.scope === snapshot.vaultScope && goal.conversationId === chatId
              )
              .map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Guiding questions · one per line
          <textarea
            rows={4}
            value={questions}
            onChange={(event) => setQuestions(event.target.value)}
            placeholder="Questions to explore, not a required sequence."
          />
        </label>
        <label>
          Orientation and resource links
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Your direction, links, and useful starting points. Markdown supported."
          />
        </label>
        <ConceptSelection
          snapshot={snapshot}
          chatId={chatId}
          selected={conceptIds}
          onChange={setConceptIds}
        />
        <details className="guide-concept-selection">
          <summary>Resource locations ({sourceIds.length})</summary>
          <label>
            Find passages in a vault resource
            <select
              aria-label="Choose guide resource"
              value=""
              disabled={loadingResources}
              onChange={async (event) => {
                const path = event.target.value
                if (!path) return
                setLoadingResources(true)
                try {
                  const result = await call<Source[]>({ action: 'document', path })
                  if (result) setResourceSources((previous) => [...previous, ...result])
                } finally {
                  setLoadingResources(false)
                }
              }}
            >
              <option value="">
                {loadingResources ? 'Loading passages…' : 'Choose a resource'}
              </option>
              {snapshot.documents.map((document) => (
                <option key={document.path} value={document.path}>
                  {document.title} · {document.path}
                </option>
              ))}
            </select>
          </label>
          <div>
            {availableSources.map((item) => (
              <label className="checkbox-label" key={item.id}>
                <input
                  type="checkbox"
                  checked={sourceIds.includes(item.id)}
                  onChange={(event) =>
                    setSourceIds(
                      event.target.checked
                        ? [...sourceIds, item.id]
                        : sourceIds.filter((id) => id !== item.id)
                    )
                  }
                />
                {item.title}
                {item.page ? ` · p. ${item.page}` : item.heading ? ` · ${item.heading}` : ''}
              </label>
            ))}
          </div>
        </details>
        <details className="guide-concept-selection">
          <summary>Link existing practice</summary>
          <div>
            {snapshot.cards.map((card) => (
              <label key={card.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cardIds.includes(card.id)}
                  onChange={(event) =>
                    setCardIds(
                      event.target.checked
                        ? [...cardIds, card.id]
                        : cardIds.filter((id) => id !== card.id)
                    )
                  }
                />
                Card: {card.front.slice(0, 90)}
              </label>
            ))}
            {snapshot.exercises.map((exercise) => (
              <label key={exercise.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={exerciseIds.includes(exercise.id)}
                  onChange={(event) =>
                    setExerciseIds(
                      event.target.checked
                        ? [...exerciseIds, exercise.id]
                        : exerciseIds.filter((id) => id !== exercise.id)
                    )
                  }
                />
                Exercise: {exercise.title}
              </label>
            ))}
          </div>
        </details>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!title.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<StudyGuide>({
                  action: 'saveGuide',
                  conversationId: chatId,
                  guide: {
                    id: source?.id,
                    title,
                    notes,
                    questions: questions
                      .split('\n')
                      .map((question) => question.trim())
                      .filter(Boolean),
                    goalId: goalId || null,
                    conceptIds,
                    cardIds,
                    exerciseIds,
                    sourceIds,
                    sources: availableSources.filter((item) => sourceIds.includes(item.id))
                  }
                })
                if (result) await onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            <Save size={14} />
            Save guide
          </button>
        </div>
      </div>
    </div>
  )
}
