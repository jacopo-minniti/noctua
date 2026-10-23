import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  Lightbulb,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Target,
  X
} from 'lucide-react'
import type { Exercise, ExerciseKind, Request, Snapshot, Source } from '../../shared/types'
import { AnswerCanvas, AnnotatedAnswer, type AnswerAnnotation } from './AnswerCanvas'
import { Markdown } from './Markdown'
import { SelectionToChat, type SelectionActions } from './SelectionToChat'
import './ecosystem.css'

type Call = <T = unknown>(request: Request) => Promise<T | null>
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

function ExerciseSources({
  sources,
  onSource
}: {
  sources: Source[]
  onSource: (source: Source) => void
}) {
  return sources.length ? (
    <div className="artifact-sources">
      {sources.slice(0, 4).map((source) => (
        <button key={source.id} onClick={() => onSource(source)}>
          {source.title}
          {source.page ? ` · p. ${source.page}` : ''}
        </button>
      ))}
    </div>
  ) : (
    <p className="artifact-origin">
      No source attached · inspect the task and criteria before studying.
    </p>
  )
}

export function ExercisesPanel({
  chatId,
  snapshot,
  call,
  refresh,
  onGenerate,
  onSource,
  busy,
  onAdd,
  chatTargets,
  focusedId,
  onActivityDone
}: SelectionActions & {
  snapshot: Snapshot
  chatId: string
  call: Call
  refresh: () => Promise<void>
  onGenerate: () => void
  onSource: (source: Source) => void
  busy: boolean
  focusedId?: string | null
  onActivityDone?: (itemId: string) => void
}) {
  const [selectedId, setSelectedId] = useStored<string | null | undefined>(
    `noctua-exercise:${chatId}`,
    undefined
  )
  const [drafts, setDrafts] = useStored<Record<string, string>>(
    `noctua-answer-drafts:${chatId}`,
    {}
  )
  const [outsideHelp, setOutsideHelp] = useStored<Record<string, boolean>>(
    `noctua-outside-help:${chatId}`,
    {}
  )
  const [resourceUse, setResourceUse] = useStored<Record<string, boolean>>(
    `noctua-resource-use:${chatId}`,
    {}
  )
  const [checking, setChecking] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [advice, setAdvice] = useStored<Record<string, string>>(
    `noctua-exercise-advice:${chatId}`,
    {}
  )
  const [saved, setSaved] = useState<'saving' | 'saved' | 'error'>('saved')
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const exercise =
    selectedId === null
      ? undefined
      : snapshot.exercises.find((item) => item.id === selectedId) || snapshot.exercises.at(-1)
  const progress = exercise
    ? snapshot.exerciseProgress[exercise.id] || {
        draft: '',
        hintsShown: 0,
        solutionSeen: false,
        adviceCount: 0
      }
    : { draft: '', hintsShown: 0, solutionSeen: false, adviceCount: 0 }
  const stateKey = exercise ? `${exercise.id}:${exercise.contentVersion || exercise.createdAt}` : ''
  const answer = exercise ? (drafts[stateKey] ?? progress.draft) : ''
  const latestDrafts = useRef<Record<string, string>>({})
  latestDrafts.current = {
    ...latestDrafts.current,
    ...drafts,
    ...(exercise ? { [stateKey]: answer } : {})
  }
  const saveQueue = useRef(Promise.resolve())
  const savedValues = useRef<Record<string, string>>({})
  const current = useRef({ id: exercise?.id, answer, key: stateKey })
  current.current = { id: exercise?.id, answer, key: stateKey }
  const persist = (id: string, text: string, key = stateKey) => {
    if (savedValues.current[key] === text) return saveQueue.current
    saveQueue.current = saveQueue.current
      .then(async () => {
        if (
          savedValues.current[key] === text ||
          (current.current.id === id && current.current.key !== key)
        )
          return
        const result = await call({
          action: 'exerciseHelp',
          exerciseId: id,
          kind: 'draft',
          draft: text
        })
        if (result !== null) savedValues.current[key] = text
        if (current.current.key === key && current.current.answer === text)
          setSaved(result === null ? 'error' : 'saved')
      })
      .catch(() => {
        if (current.current.key === key) setSaved('error')
      })
    return saveQueue.current
  }
  useEffect(() => {
    if (!exercise) return
    const id = exercise.id
    if (savedValues.current[stateKey] === answer || (!answer && !progress.draft)) {
      setSaved('saved')
      return
    }
    setSaved('saving')
    const timer = window.setTimeout(() => {
      void persist(id, answer)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [stateKey, answer])
  useEffect(() => {
    const id = exercise?.id
    const key = stateKey
    return () => {
      if (id) void persist(id, latestDrafts.current[key] || '', key)
    }
  }, [stateKey])
  useEffect(() => {
    if (focusedId) setSelectedId(focusedId)
  }, [focusedId])
  const setAnswer = (text: string) => {
    if (exercise) setDrafts((previous) => ({ ...previous, [stateKey]: text }))
  }
  const saveDraft = () => (exercise ? persist(exercise.id, answer) : Promise.resolve())
  const attempts = snapshot.attempts
    .filter((attempt) => attempt.exerciseId === exercise?.id)
    .slice()
    .reverse()
  const evaluator = snapshot.settings.roleModels?.evaluator || snapshot.settings.modelKey
  const canCheck = snapshot.models.some((model) => model.key === evaluator && model.ready)
  const canCheckAnswer = !!exercise?.answerKey && exercise.format !== 'open'
  const canAdvise = snapshot.models.some(
    (model) => model.key === snapshot.settings.modelKey && model.ready
  )
  const concept = snapshot.concepts.find((item) => item.id === exercise?.conceptId)
  const submit = async (gradeWithModel: boolean) => {
    if (!exercise || !answer.trim() || checking) return
    setChecking(true)
    try {
      await saveDraft()
      const result = await call({
        action: 'answer',
        exerciseId: exercise.id,
        answer,
        assistance: Math.max(
          progress.hintsShown,
          progress.adviceCount || 0,
          outsideHelp[stateKey] ? 1 : 0
        ),
        solutionSeen: progress.solutionSeen,
        gradeWithModel,
        conditions: {
          resourcesUsed: !!resourceUse[stateKey],
          helpDescription: outsideHelp[stateKey] ? 'Learner reported additional help.' : ''
        }
      })
      await refresh()
      if (result) onActivityDone?.(exercise.id)
    } finally {
      setChecking(false)
    }
  }
  return (
    <div className="exercises-panel">
      <div className="panel-title">
        <div>
          <h3>Work through the why.</h3>
          <p>Problems, reasoning, and useful feedback.</p>
        </div>
        <button
          className="icon-button"
          title="Create an exercise yourself"
          onClick={() => setEditing('new')}
        >
          <Plus size={18} />
        </button>
      </div>
      {exercise ? (
        <>
          <div className="practice-navigation">
            <button
              className="text-button back-link"
              onClick={() => {
                void saveDraft()
                setSelectedId(null)
              }}
            >
              <ArrowLeft size={13} />
              All exercises ({snapshot.exercises.length})
            </button>
            <button
              className="icon-button"
              title="Edit exercise"
              onClick={() => setEditing(exercise)}
            >
              <Edit3 size={14} />
            </button>
          </div>
          <div className="exercise-content">
            <div className="exercise-target">
              <span className={`level-badge ${exercise.kind}`}>#{exercise.kind}</span>
              {concept && <span>{concept.title}</span>}
            </div>
            <h3>{exercise.title}</h3>
            <SelectionToChat
              origin={{ exerciseId: exercise.id, label: exercise.title, side: 'prompt' }}
              onAdd={onAdd}
              chatTargets={chatTargets}
            >
              <Markdown text={exercise.prompt} sources={exercise.sources} onSource={onSource} />
            </SelectionToChat>
            <ExerciseSources sources={exercise.sources} onSource={onSource} />
            {exercise.context && <p className="exercise-context">Context: {exercise.context}</p>}
            {!!(exercise.rubric?.length || exercise.criteria.length) && (
              <details className="criteria">
                <summary>What this asks you to demonstrate</summary>
                <ul>
                  {exercise.rubric?.length
                    ? exercise.rubric.map((criterion) => (
                        <li key={criterion.id}>
                          <strong>{criterion.title}</strong>
                          {criterion.description && <span> · {criterion.description}</span>}
                          <small className={`criterion-level ${criterion.level}`}>
                            #{criterion.level}
                          </small>
                        </li>
                      ))
                    : exercise.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}
                </ul>
              </details>
            )}
            {concept?.readiness && (
              <details className="readiness-detail">
                <summary>Why this difficulty?</summary>
                <p>{concept.readiness.rationale}</p>
                {concept.readiness.cautions.map((caution) => (
                  <p key={caution}>{caution}</p>
                ))}
              </details>
            )}
          </div>
          {exercise.format === 'multiple-choice' && !!exercise.choices?.length && (
            <fieldset className="exercise-choices">
              <legend>Choose an answer, then explain your reasoning</legend>
              {exercise.choices.map((choice, index) => (
                <label key={index}>
                  <input
                    type="radio"
                    name={`answer-${exercise.id}`}
                    checked={answer.split('\n')[0] === choice}
                    onChange={() => setAnswer([choice, ...answer.split('\n').slice(1)].join('\n'))}
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </fieldset>
          )}
          {canCheckAnswer && (
            <p className="small-note">
              Put your answer on the first line, then show your reasoning below. The answer key
              checks that line; a reasoning review checks your explanation.
            </p>
          )}
          <AnswerCanvas
            value={answer}
            onChange={setAnswer}
            onBlur={() => {
              void saveDraft()
            }}
            saved={saved}
            disabled={checking}
          />
          <div className="attempt-conditions">
            <label className="checkbox-label outside-help">
              <input
                type="checkbox"
                checked={!!outsideHelp[stateKey]}
                onChange={(event) =>
                  setOutsideHelp((previous) => ({
                    ...previous,
                    [stateKey]: event.target.checked
                  }))
                }
              />
              I used additional help for this attempt
            </label>
            <label className="checkbox-label outside-help">
              <input
                type="checkbox"
                checked={!!resourceUse[stateKey]}
                onChange={(event) =>
                  setResourceUse((previous) => ({
                    ...previous,
                    [stateKey]: event.target.checked
                  }))
                }
              />
              I used notes or other resources
            </label>
          </div>
          <div className="attempt-buttons">
            <button
              className="primary-button"
              disabled={!answer.trim() || checking || busy}
              onClick={() => {
                void submit(canCheck && !canCheckAnswer)
              }}
            >
              {checking ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
              {canCheckAnswer ? 'Check answer' : canCheck ? 'Check reasoning' : 'Save attempt'}
            </button>
            {canCheck && !canCheckAnswer && (
              <button
                className="text-button"
                disabled={!answer.trim() || checking}
                onClick={() => {
                  void submit(false)
                }}
              >
                Save without checking
              </button>
            )}
            {canCheck && canCheckAnswer && (
              <button
                className="text-button"
                disabled={!answer.trim() || checking || busy}
                onClick={() => {
                  void submit(true)
                }}
              >
                Review reasoning with model
              </button>
            )}
          </div>
          <div className="exercise-help">
            <button
              className="secondary-button"
              disabled={progress.hintsShown >= exercise.hints.length || checking}
              onClick={async () => {
                await call({ action: 'exerciseHelp', exerciseId: exercise.id, kind: 'hint' })
                await refresh()
              }}
            >
              <Lightbulb size={14} />
              {progress.hintsShown ? 'Another hint' : 'A small hint'}
            </button>
            <button
              className="text-button"
              disabled={progress.solutionSeen || !exercise.solution}
              onClick={async () => {
                await call({ action: 'exerciseHelp', exerciseId: exercise.id, kind: 'solution' })
                await refresh()
              }}
            >
              <Eye size={14} />
              View solution
            </button>
          </div>
          <button
            className="advice-button"
            disabled={!answer.trim() || !canAdvise || advising || checking || busy}
            onClick={async () => {
              setAdvising(true)
              try {
                await saveDraft()
                const result = await call<string>({
                  action: 'exerciseAdvice',
                  conversationId: chatId,
                  exerciseId: exercise.id,
                  answer
                })
                if (result) setAdvice((previous) => ({ ...previous, [stateKey]: result }))
                await refresh()
              } finally {
                setAdvising(false)
              }
            }}
          >
            {advising ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}Ask for
            advice on my approach
            <ChevronRight size={13} />
          </button>
          {advice[stateKey] && (
            <div className="exercise-advice">
              <span className="eyebrow">ADVICE ON YOUR APPROACH</span>
              <Markdown text={advice[stateKey]} />
              <p className="small-note">This help is recorded with your attempt.</p>
            </div>
          )}
          {progress.hintsShown > 0 && (
            <div className="hints">
              {exercise.hints.slice(0, progress.hintsShown).map((hint, index) => (
                <div key={index}>
                  <span className="eyebrow">HINT {index + 1}</span>
                  <Markdown text={hint} />
                </div>
              ))}
            </div>
          )}
          {progress.solutionSeen && (
            <div className="solution">
              <span className="eyebrow">REFERENCE SOLUTION</span>
              <Markdown text={exercise.solution} sources={exercise.sources} onSource={onSource} />
            </div>
          )}
          {(progress.hintsShown > 0 || progress.solutionSeen || !!progress.adviceCount) && (
            <p className="small-note">
              {progress.solutionSeen
                ? 'Solution seen'
                : `${progress.hintsShown} hints · ${progress.adviceCount || 0} advice requests`}{' '}
              · further attempts on this problem retain the help received.
            </p>
          )}
          {attempts.length > 0 && (
            <>
              <div className="section-label">YOUR ATTEMPTS · {attempts.length}</div>
              {attempts.map((attempt) => {
                const annotations: AnswerAnnotation[] = (attempt.criterionFeedback || [])
                  .filter((item) => !!item.evidence)
                  .map((item) => ({
                    quote: item.evidence!,
                    start: item.start,
                    end: item.end,
                    comment: item.feedback,
                    kind:
                      item.outcome === 'met'
                        ? 'strength'
                        : item.outcome === 'unobserved'
                          ? 'question'
                          : 'gap',
                    criterion: exercise.rubric?.find(
                      (criterion) => criterion.id === item.criterionId
                    )?.title
                  }))
                return (
                  <div className="attempt-history" key={attempt.id}>
                    <div>
                      <span className={`outcome ${attempt.outcome}`}>
                        {attempt.outcome === 'ungraded' ? 'Not assessed' : attempt.outcome}
                      </span>
                      <small>
                        {attempt.assistance || attempt.solutionSeen
                          ? 'Assisted'
                          : attempt.conditions?.resourcesUsed
                            ? 'With resources'
                            : 'Independent'}{' '}
                        ·{' '}
                        {attempt.assessedBy === 'model'
                          ? 'AI assessment'
                          : attempt.assessedBy === 'answer-key'
                            ? 'Answer key check'
                            : attempt.assessedBy === 'learner'
                              ? 'Self assessment'
                              : 'Saved'}
                      </small>
                    </div>
                    <time>
                      {new Date(attempt.at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </time>
                    {attempt.exerciseVersion &&
                      exercise.contentVersion &&
                      attempt.exerciseVersion !== exercise.contentVersion && (
                        <p className="small-note">
                          Saved against an earlier version of this exercise.
                        </p>
                      )}
                    <details open={annotations.length > 0}>
                      <summary>Your submitted reasoning</summary>
                      {annotations.length ? (
                        <AnnotatedAnswer answer={attempt.answer} annotations={annotations} />
                      ) : (
                        <Markdown text={attempt.answer} />
                      )}
                    </details>
                    {attempt.feedback && <Markdown text={attempt.feedback} />}
                    {!!attempt.criterionFeedback?.length && (
                      <div className="criterion-feedback">
                        {attempt.criterionFeedback.map((item) => (
                          <div
                            key={item.criterionId}
                            className={`criterion-result ${item.outcome}`}
                          >
                            <span>
                              {exercise.rubric?.find(
                                (criterion) => criterion.id === item.criterionId
                              )?.title || item.criterionId}
                            </span>
                            <small>
                              {item.outcome === 'not-met'
                                ? 'Not yet demonstrated'
                                : item.outcome === 'unobserved'
                                  ? 'Not observed'
                                  : item.outcome === 'partial'
                                    ? 'Partly demonstrated'
                                    : 'Demonstrated'}
                            </small>
                            <p>{item.feedback}</p>
                            {item.uncertainty && <p className="small-note">{item.uncertainty}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {attempt.uncertainty && <p className="small-note">{attempt.uncertainty}</p>}
                    {attempt.assessedBy === 'model' && (
                      <p className="small-note">
                        Check the feedback. You can correct this judgment.
                      </p>
                    )}
                    <label className="assessment-select">
                      Your judgment
                      <select
                        value={attempt.outcome}
                        onChange={async (event) => {
                          await call({
                            action: 'assessAttempt',
                            attemptId: attempt.id,
                            outcome: event.target.value as typeof attempt.outcome
                          })
                          await refresh()
                        }}
                      >
                        <option value="ungraded">Not assessed</option>
                        <option value="correct">Correct</option>
                        <option value="partial">Partly correct</option>
                        <option value="incorrect">Incorrect</option>
                      </select>
                    </label>
                  </div>
                )
              })}
            </>
          )}
        </>
      ) : (
        <>
          <button className="generate-button" onClick={onGenerate} disabled={busy}>
            <Plus size={16} />
            Create exercises with Noctua
            <ChevronRight size={14} />
          </button>
          <div className="section-label">YOUR EXERCISES · {snapshot.exercises.length}</div>
          {snapshot.exercises.length ? (
            snapshot.exercises
              .slice()
              .sort((left, right) =>
                (left.dueAt || left.createdAt).localeCompare(right.dueAt || right.createdAt)
              )
              .map((item) => {
                const history = snapshot.attempts.filter(
                  (attempt) => attempt.exerciseId === item.id
                )
                const latest = history.at(-1)
                const due = snapshot.practiceSchedules.find(
                  (schedule) => schedule.exerciseId === item.id
                )
                return (
                  <button
                    className="exercise-list-item"
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={`level-badge ${item.kind}`}>#{item.kind}</span>
                    <strong>{item.title}</strong>
                    <small>
                      {history.length} attempts
                      {latest
                        ? ` · ${latest.outcome === 'ungraded' ? 'Not assessed' : latest.outcome}`
                        : ''}
                      {due
                        ? ` · ${new Date(due.dueAt).getTime() <= Date.now() ? 'Ready to revisit' : `revisit ${new Date(due.dueAt).toLocaleDateString()}`}`
                        : ''}
                      <ArrowRight size={13} />
                    </small>
                  </button>
                )
              })
          ) : (
            <div className="panel-empty">
              <Target size={32} strokeWidth={1.2} />
              <h3>Understanding takes practice.</h3>
              <p>
                Keep a problem, try your reasoning,
                <br />
                and return to it when useful.
              </p>
              <button className="text-button" onClick={() => setEditing('new')}>
                <Plus size={14} />
                Write an exercise
              </button>
            </div>
          )}
          <div className="desk-tip">
            <Lightbulb size={16} />
            <p>
              Work at a useful depth. Several topics, contexts, and prerequisites can belong to the
              same level.
            </p>
          </div>
        </>
      )}
      {editing && (
        <ExerciseEditor
          exercise={editing}
          snapshot={snapshot}
          call={call}
          chatId={chatId}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null)
            setSelectedId(id)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function ExerciseEditor({
  exercise,
  snapshot,
  call,
  chatId,
  onClose,
  onSaved
}: {
  exercise: Exercise | 'new'
  snapshot: Snapshot
  call: Call
  chatId: string
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const source = exercise === 'new' ? undefined : exercise
  const [title, setTitle] = useState(source?.title || '')
  const [prompt, setPrompt] = useState(source?.prompt || '')
  const [solution, setSolution] = useState(source?.solution || '')
  const [criteria, setCriteria] = useState(source?.criteria.join('\n') || '')
  const [hints, setHints] = useState(source?.hints.join('\n\n') || '')
  const [kind, setKind] = useState<ExerciseKind>(source?.kind || 'knowledge')
  const [conceptId, setConceptId] = useState(source?.conceptId || '')
  const [format, setFormat] = useState<NonNullable<Exercise['format']>>(source?.format || 'open')
  const [choices, setChoices] = useState(source?.choices?.join('\n') || '')
  const [answerKey, setAnswerKey] = useState(source?.answerKey || '')
  const [context, setContext] = useState(source?.context || '')
  const [transferDescription, setTransferDescription] = useState(source?.transferDescription || '')
  const [family, setFamily] = useState(source?.taskFamily || '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal exercise-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">EXERCISE</span>
            <h2>{source ? 'Refine the challenge.' : 'A problem worth thinking through.'}</h2>
          </div>
          <button className="icon-button" aria-label="Close exercise editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            placeholder="What will this question explore?"
          />
        </label>
        <label>
          Question
          <textarea
            rows={4}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Supply the information and constraints needed to attempt it."
          />
        </label>
        <div className="field-row">
          <label>
            Concept
            <select value={conceptId} onChange={(event) => setConceptId(event.target.value)}>
              <option value="">No concept assigned</option>
              {snapshot.concepts
                .filter(
                  (concept) =>
                    concept.scope === snapshot.vaultScope ||
                    concept.scope === `attachments:${source?.conversationId || chatId}`
                )
                .map((concept) => (
                  <option key={concept.id} value={concept.id}>
                    {concept.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Depth
            <select value={kind} onChange={(event) => setKind(event.target.value as ExerciseKind)}>
              <option value="knowledge">#knowledge · recall</option>
              <option value="comprehension">#comprehension · explain</option>
              <option value="application">#application · use</option>
              <option value="transfer">#transfer · adapt to a changed setting</option>
            </select>
          </label>
        </div>
        {kind === 'transfer' && (
          <label>
            What changes from familiar problems?
            <textarea
              rows={2}
              value={transferDescription}
              onChange={(event) => setTransferDescription(event.target.value)}
              placeholder="Describe the new setting or representation and the adaptation it requires."
            />
          </label>
        )}
        <label>
          Answer format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as typeof format)}
          >
            <option value="open">Open reasoning</option>
            <option value="short-answer">Short answer</option>
            <option value="multiple-choice">Multiple choice</option>
            <option value="numeric">Numeric</option>
          </select>
        </label>
        {format === 'multiple-choice' && (
          <label>
            Answer options · one per line
            <textarea
              rows={3}
              value={choices}
              onChange={(event) => setChoices(event.target.value)}
            />
          </label>
        )}
        {format !== 'open' && (
          <label>
            Expected answer
            <input
              value={answerKey}
              onChange={(event) => setAnswerKey(event.target.value)}
              placeholder={format === 'numeric' ? 'A number' : 'Exact answer or matching option'}
            />
          </label>
        )}
        <label>
          What a good answer demonstrates · one criterion per line
          <textarea
            rows={3}
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
            placeholder="Use specific, observable criteria; allow alternative sound reasoning."
          />
        </label>
        <label>
          Reference solution
          <textarea
            rows={4}
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
            placeholder="Kept hidden until the learner asks to see it."
          />
        </label>
        <details className="exercise-author-options">
          <summary>Hints and task context</summary>
          <label>
            Hints · separate with a blank line
            <textarea rows={3} value={hints} onChange={(event) => setHints(event.target.value)} />
          </label>
          <label>
            Context
            <input
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Conditions, prerequisite knowledge, or resources allowed"
            />
          </label>
          <label>
            Task family
            <input
              value={family}
              onChange={(event) => setFamily(event.target.value)}
              placeholder="Related variants share a family"
            />
          </label>
        </details>
        <p className="small-note">
          The depth describes what this problem asks for. It does not change your concept tag.
        </p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={
              saving ||
              !title.trim() ||
              !prompt.trim() ||
              !solution.trim() ||
              !criteria.trim() ||
              (kind === 'transfer' && !transferDescription.trim())
            }
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<Exercise>({
                  action: 'saveExercise',
                  conversationId: source?.conversationId || chatId,
                  exercise: {
                    id: source?.id,
                    title,
                    prompt,
                    solution,
                    criteria: criteria
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                    rubric: criteria
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map(
                        (title) =>
                          source?.rubric?.find((criterion) => criterion.title === title) || {
                            id: crypto.randomUUID(),
                            title,
                            level: kind,
                            conceptId: conceptId || undefined
                          }
                      ),
                    conceptId: conceptId || null,
                    kind,
                    hints: hints.split(/\n\s*\n/).filter((item) => item.trim()),
                    format,
                    choices:
                      format === 'multiple-choice'
                        ? choices.split('\n').filter((item) => item.trim())
                        : undefined,
                    answerKey: format === 'open' ? undefined : answerKey,
                    context,
                    transferDescription,
                    taskFamily: family || undefined,
                    sources: source?.sources || []
                  }
                })
                if (result) await onSaved(result.id)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save exercise
          </button>
        </div>
      </div>
    </div>
  )
}
