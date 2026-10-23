import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { levels } from '../shared/types'
import type {
  Attempt,
  Concept,
  ConceptEdge,
  Exercise,
  ExerciseProgress,
  Flashcard,
  NoteProposal,
  PracticeSchedule,
  Source,
  StudyBit,
  StudyGoal,
  StudyGuide
} from '../shared/types'
import { exerciseVersion, facetVersion, learningConcepts, learningLevels } from './learning'
import { Store } from './store'

const id = z.string().trim().min(1).max(500)
const title = z.string().trim().min(1).max(200)
const text = z.string().max(20_000)
const ids = z.array(id).max(100).default([])
const nullableLevel = z.enum(levels).nullable()
const facetSchema = z.object({
  id,
  title,
  description: z.string().max(2000).optional(),
  desiredLevel: z.enum(levels).optional()
})
const conceptInput = z.object({
  id: id.optional(),
  title,
  description: z.string().max(4000).optional(),
  aliases: z.array(title).max(30).optional(),
  path: z.string().max(2000).optional(),
  anchor: z.string().max(1000).optional(),
  sourceIds: z.array(id).max(100).optional(),
  facets: z.array(facetSchema).max(40).optional(),
  desiredLevel: nullableLevel.optional(),
  lineageIds: z.array(id).max(100).optional()
})
const edgeInput = z.object({
  id: id.optional(),
  fromId: id,
  toId: id,
  relation: z.enum([
    'part-of',
    'prerequisite',
    'explains',
    'applies-to',
    'contrasts-with',
    'analogous-to'
  ]),
  rationale: z.string().trim().min(1).max(4000),
  context: z.string().max(2000).default(''),
  sourceIds: ids,
  status: z.enum(['proposed', 'accepted', 'rejected']).optional()
})
const goalInput = z.object({
  id: id.optional(),
  title,
  description: z.string().max(8000).default(''),
  conceptIds: ids,
  desiredLevel: nullableLevel.default(null),
  depth: z.enum(['orientation', 'working', 'deep']).default('working'),
  status: z.enum(['active', 'paused', 'done']).default('active')
})
const guideInput = z.object({
  id: id.optional(),
  title,
  goalId: id.nullable().default(null),
  conceptIds: ids,
  questions: z.array(z.string().trim().min(1).max(2000)).max(40).default([]),
  sourceIds: ids,
  exerciseIds: ids,
  cardIds: ids,
  notes: text.default('')
})
const bitInput = z.object({
  id: id.optional(),
  text: z.string().trim().min(1).max(20_000),
  origin: z.enum(['learner', 'quotation', 'model']).default('learner'),
  conceptIds: ids,
  sourceId: id.nullable().default(null)
})
const proposalInput = z.object({
  id: id.optional(),
  path: z.string().trim().min(1).max(2000),
  anchor: z.string().max(1000).default(''),
  expectedRevision: z.string().max(500),
  operation: z.enum(['append', 'replace']),
  before: z.string().max(60_000).default(''),
  after: z.string().trim().min(1).max(60_000),
  rationale: z.string().trim().min(1).max(4000),
  origin: z.enum(['learner', 'model']).default('learner'),
  conceptIds: ids,
  bitIds: ids
})
const criterionSchema = z.object({
  id,
  title,
  description: z.string().max(4000).optional(),
  level: z.enum(learningLevels),
  conceptId: id.optional(),
  edgeId: id.optional(),
  facetId: id.optional(),
  essential: z.boolean().optional()
})
const exerciseInput = z.object({
  id: id.optional(),
  title,
  prompt: z.string().trim().min(1).max(20_000),
  kind: z.enum(learningLevels),
  conceptId: id.nullable().default(null),
  sourceIds: ids,
  hints: z.array(z.string().trim().min(1).max(4000)).max(8).default([]),
  solution: text.default(''),
  criteria: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
  rubric: z.array(criterionSchema).max(30).optional(),
  taskFamily: z.string().trim().max(1000).optional(),
  context: z.string().max(2000).optional(),
  transferDescription: z.string().max(2000).optional(),
  format: z.enum(['open', 'short-answer', 'multiple-choice', 'numeric']).default('open'),
  choices: z.array(z.string().trim().min(1).max(2000)).max(8).optional(),
  answerKey: z.string().max(4000).optional(),
  tolerance: z.number().finite().min(0).max(1e12).optional()
})

export type SaveConceptInput = z.input<typeof conceptInput>
export type SaveEdgeInput = z.input<typeof edgeInput>
export type SaveGoalInput = z.input<typeof goalInput>
export type SaveGuideInput = z.input<typeof guideInput>
export type CaptureBitInput = z.input<typeof bitInput>
export type ProposeNoteInput = z.input<typeof proposalInput>
export type SaveExerciseInput = z.input<typeof exerciseInput>

/** Closed-answer checking establishes the keyed answer only, never reasoning or broad mastery. */
export function checkExerciseAnswer(
  exercise: Exercise,
  answer: string
): { outcome: Attempt['outcome']; feedback: string } | null {
  if (!exercise.answerKey || !exercise.format || exercise.format === 'open') return null
  const normalized = (value: string): string =>
    value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  const responseLine = answer.trim().split(/\r?\n/, 1)[0]
  let matches: boolean
  if (exercise.format === 'numeric') {
    const response = Number(responseLine)
    matches =
      Boolean(responseLine) &&
      Number.isFinite(response) &&
      Math.abs(response - Number(exercise.answerKey)) <= (exercise.tolerance || 0)
  } else {
    matches = normalized(responseLine) === normalized(exercise.answerKey)
  }
  return {
    outcome: matches ? 'correct' : 'incorrect',
    feedback: matches
      ? 'Your answer matches the saved answer key. Reasoning criteria still need a separate check.'
      : 'Your answer does not match the saved answer key. Inspect the task and your reasoning before retrying.'
  }
}

/** Manual UI and Pi use the same bounded application operations and durable records. */
export class StudyService {
  constructor(readonly store: Store) {}

  private entity<T extends { scope: string }>(kind: string, entityId: string, scopes: string[]): T {
    const entity = this.store.get<T>(kind, entityId)
    if (!entity || !scopes.includes(entity.scope))
      throw new Error(`This ${kind} is outside the current study scope or no longer exists.`)
    return entity
  }

  private conversation(conversationId: string): void {
    if (!this.store.get('conversation', conversationId))
      throw new Error('This conversation no longer exists.')
  }

  private scopes(scope: string, conversationId?: string): string[] {
    return conversationId ? [scope, `attachments:${conversationId}`] : [scope]
  }

  private concepts(conceptIds: string[], scopes: string[]): Concept[] {
    return [...new Set(conceptIds)].map((conceptId) => {
      const concept = this.entity<Concept>('concept', conceptId, scopes)
      if (concept.archived) throw new Error('An archived concept cannot be linked to new work.')
      return concept
    })
  }

  private sources(sourceIds: string[], scopes: string[]): Source[] {
    return [...new Set(sourceIds)].map((sourceId) => {
      const source = this.store.resolveSource(sourceId)
      if (!source || !scopes.includes(source.scope))
        throw new Error('This source is outside the current study scope or no longer exists.')
      return source
    })
  }

  saveConcept(
    scope: string,
    input: SaveConceptInput,
    origin: 'learner' | 'model' = 'learner'
  ): Concept {
    const value = conceptInput.parse(input)
    const previous = value.id ? this.entity<Concept>('concept', value.id, [scope]) : null
    const sourceIds = value.sourceIds ?? previous?.sourceIds ?? []
    const sources = this.sources(sourceIds, [scope]).map(
      (source) => previous?.sources?.find((saved) => saved.id === source.id) || source
    )
    this.concepts(value.lineageIds || [], [scope])
    if (value.facets && new Set(value.facets.map((facet) => facet.id)).size !== value.facets.length)
      throw new Error('Each concept facet needs a distinct stable ID.')
    const facets = (value.facets ?? previous?.facets ?? []).map((facet) => ({
      ...facet,
      version: facetVersion(facet)
    }))
    const concept: Concept = {
      ...(previous || {}),
      id: previous?.id || randomUUID(),
      scope,
      title: value.title,
      path: previous?.path || value.path || '',
      anchor: previous?.anchor || value.anchor || '',
      level: previous?.level || null,
      levelOrigin: previous?.levelOrigin || null,
      aliases: value.aliases ?? previous?.aliases ?? [],
      description: value.description ?? previous?.description ?? '',
      sourceIds,
      sources,
      facets,
      desiredLevel:
        value.desiredLevel === undefined ? previous?.desiredLevel || null : value.desiredLevel,
      lineageIds: value.lineageIds ?? previous?.lineageIds ?? [],
      archived: previous?.archived || false,
      updatedAt: new Date().toISOString()
    }
    const changedFacetIds =
      previous?.facets
        ?.filter((old) => {
          const current = facets.find((facet) => facet.id === old.id)
          return !current || facetVersion(old) !== facetVersion(current)
        })
        .map((facet) => facet.id) || []
    this.store.transaction(() => {
      if (previous)
        this.store.put('conceptRevision', {
          id: randomUUID(),
          before: previous,
          origin,
          at: concept.updatedAt
        })
      if (changedFacetIds.length)
        this.store.put('conceptFacetRevision', {
          id: randomUUID(),
          conceptId: concept.id,
          before: previous?.facets || [],
          after: facets,
          changedFacetIds,
          at: concept.updatedAt,
          origin
        })
      this.store.put('concept', concept)
    })
    return concept
  }

  saveEdge(
    scope: string,
    input: SaveEdgeInput,
    origin: ConceptEdge['origin'] = 'learner',
    allowedScopes: string[] = [scope]
  ): ConceptEdge {
    const value = edgeInput.parse(input)
    const scopes = z.array(id).min(1).max(100).parse(allowedScopes)
    if (!scopes.includes(scope))
      throw new Error('The relationship must belong to an authorized study scope.')
    this.concepts([value.fromId, value.toId], scopes)
    if (value.fromId === value.toId)
      throw new Error('A relationship must connect two different concepts.')
    const previous = value.id ? this.entity<ConceptEdge>('edge', value.id, [scope]) : null
    const now = new Date().toISOString()
    const edge: ConceptEdge = {
      id: previous?.id || randomUUID(),
      scope,
      fromId: value.fromId,
      toId: value.toId,
      relation: value.relation,
      rationale: value.rationale,
      context: value.context,
      sources: this.sources(value.sourceIds, scopes),
      origin,
      status: origin === 'model' ? 'proposed' : value.status || 'accepted',
      createdAt: previous?.createdAt || now,
      updatedAt: now
    }
    if (previous) this.store.put('edgeRevision', { id: randomUUID(), before: previous, at: now })
    return this.store.put('edge', edge)
  }

  decideEdge(scope: string, edgeId: string, status: ConceptEdge['status']): ConceptEdge {
    const edge = this.entity<ConceptEdge>('edge', edgeId, [scope])
    const next = {
      ...edge,
      status: z.enum(['proposed', 'accepted', 'rejected']).parse(status),
      updatedAt: new Date().toISOString()
    }
    this.store.put('edgeDecision', {
      id: randomUUID(),
      edgeId,
      previous: edge.status,
      status: next.status,
      at: next.updatedAt,
      origin: 'learner'
    })
    return this.store.put('edge', next)
  }

  saveGoal(scope: string, conversationId: string, input: SaveGoalInput): StudyGoal {
    this.conversation(conversationId)
    const previous = input.id
      ? this.entity<StudyGoal>('goal', id.parse(input.id), this.scopes(scope, conversationId))
      : null
    const value = goalInput.parse({ ...previous, ...input })
    if (previous && previous.conversationId !== conversationId)
      throw new Error('This goal belongs to another chat.')
    this.concepts(value.conceptIds, this.scopes(scope, conversationId))
    const now = new Date().toISOString()
    return this.store.put('goal', {
      ...value,
      id: previous?.id || randomUUID(),
      scope,
      conversationId,
      createdAt: previous?.createdAt || now,
      updatedAt: now
    })
  }

  saveGuide(scope: string, conversationId: string, input: SaveGuideInput): StudyGuide {
    this.conversation(conversationId)
    const scopes = this.scopes(scope, conversationId)
    const previous = input.id ? this.entity<StudyGuide>('guide', id.parse(input.id), scopes) : null
    const value = guideInput.parse({ ...previous, ...input })
    if (previous && previous.conversationId !== conversationId)
      throw new Error('This guide belongs to another chat.')
    this.concepts(value.conceptIds, scopes)
    const sources = this.sources(value.sourceIds, scopes).map(
      (source) => previous?.sources?.find((saved) => saved.id === source.id) || source
    )
    if (value.goalId) {
      const goal = this.entity<StudyGoal>('goal', value.goalId, scopes)
      if (goal.conversationId !== conversationId)
        throw new Error('This goal belongs to another chat.')
    }
    for (const exerciseId of value.exerciseIds)
      this.entity<Exercise>('exercise', exerciseId, scopes)
    for (const cardId of value.cardIds) this.entity<Flashcard>('card', cardId, scopes)
    const now = new Date().toISOString()
    return this.store.put('guide', {
      ...value,
      id: previous?.id || randomUUID(),
      scope,
      conversationId,
      sources,
      createdAt: previous?.createdAt || now,
      updatedAt: now
    })
  }

  captureBit(scope: string, conversationId: string, input: CaptureBitInput): StudyBit {
    this.conversation(conversationId)
    const scopes = this.scopes(scope, conversationId)
    const previous = input.id ? this.entity<StudyBit>('bit', id.parse(input.id), scopes) : null
    const value = bitInput.parse({ ...previous, sourceId: previous?.source?.id || null, ...input })
    if (previous && previous.conversationId !== conversationId)
      throw new Error('This captured bit belongs to another chat.')
    this.concepts(value.conceptIds, scopes)
    const source = value.sourceId ? this.sources([value.sourceId], scopes)[0] : null
    if (value.origin === 'quotation' && !source)
      throw new Error('A quotation needs its source so it can be checked later.')
    const now = new Date().toISOString()
    return this.store.put('bit', {
      id: previous?.id || randomUUID(),
      scope,
      conversationId,
      text: value.text,
      origin: value.origin,
      conceptIds: [...new Set(value.conceptIds)],
      source,
      status: value.conceptIds.length ? 'linked' : 'inbox',
      createdAt: previous?.createdAt || now,
      updatedAt: now
    })
  }

  updateBit(
    scope: string,
    bitId: string,
    input: { text?: string; conceptIds?: string[]; status?: StudyBit['status'] }
  ): StudyBit {
    const value = z
      .object({
        text: z.string().trim().min(1).max(20_000).optional(),
        conceptIds: z.array(id).max(100).optional(),
        status: z.enum(['inbox', 'linked', 'proposed', 'placed']).optional()
      })
      .parse(input)
    const bit = this.entity<StudyBit>('bit', bitId, [scope])
    if (value.conceptIds) this.concepts(value.conceptIds, this.scopes(scope, bit.conversationId))
    return this.store.put('bit', { ...bit, ...value, updatedAt: new Date().toISOString() })
  }

  proposeNote(scope: string, conversationId: string, input: ProposeNoteInput): NoteProposal {
    this.conversation(conversationId)
    const value = proposalInput.parse(input)
    const scopes = this.scopes(scope, conversationId)
    this.concepts(value.conceptIds, scopes)
    const bits = value.bitIds.map((bitId) => this.entity<StudyBit>('bit', bitId, scopes))
    if (bits.some((bit) => bit.conversationId !== conversationId))
      throw new Error('Only this chat’s captured bits can be proposed together.')
    if (
      !value.path.toLowerCase().endsWith('.md') ||
      /(^|[\\/])\.\.([\\/]|$)/.test(value.path) ||
      /^(?:[\\/]|[a-z]:)/i.test(value.path)
    )
      throw new Error('Choose a relative Markdown note path inside the vault.')
    if (value.operation === 'replace' && !value.before)
      throw new Error('A replacement needs the exact original text.')
    if (value.operation === 'append' && value.before)
      throw new Error('An append proposal must not replace original text.')
    const previous = value.id ? this.entity<NoteProposal>('noteProposal', value.id, scopes) : null
    if (previous && (previous.conversationId !== conversationId || previous.status !== 'pending'))
      throw new Error('Only a pending proposal from this chat can be edited.')
    const now = new Date().toISOString()
    const record: NoteProposal = {
      ...value,
      id: previous?.id || randomUUID(),
      scope,
      conversationId,
      status: 'pending',
      createdAt: previous?.createdAt || now,
      updatedAt: now
    }
    this.store.transaction(() => {
      this.store.put('noteProposal', record)
      for (const bit of bits) this.store.put('bit', { ...bit, status: 'proposed', updatedAt: now })
    })
    return record
  }

  setProposalStatus(
    scope: string,
    proposalId: string,
    status: NoteProposal['status']
  ): NoteProposal {
    const proposal = this.entity<NoteProposal>('noteProposal', proposalId, [scope])
    const next = {
      ...proposal,
      status: z.enum(['pending', 'accepted', 'rejected', 'conflict']).parse(status),
      updatedAt: new Date().toISOString()
    }
    this.store.transaction(() => {
      this.store.put('noteProposalDecision', {
        id: randomUUID(),
        proposalId,
        previous: proposal.status,
        status: next.status,
        at: next.updatedAt
      })
      this.store.put('noteProposal', next)
      if (status === 'accepted') {
        for (const bitId of proposal.bitIds) {
          const bit = this.store.get<StudyBit>('bit', bitId)
          if (bit && bit.scope === scope)
            this.store.put('bit', { ...bit, status: 'placed', updatedAt: next.updatedAt })
        }
      }
    })
    return next
  }

  saveExercise(
    scope: string,
    conversationId: string,
    input: SaveExerciseInput,
    origin: Exercise['origin'] = 'learner'
  ): Exercise {
    this.conversation(conversationId)
    const scopes = this.scopes(scope, conversationId)
    const previous = input.id ? this.entity<Exercise>('exercise', id.parse(input.id), scopes) : null
    const value = exerciseInput.parse({
      ...previous,
      sourceIds: previous?.sources.map((source) => source.id) || [],
      ...input
    })
    if (value.conceptId) this.concepts([value.conceptId], scopes)
    if (previous && previous.conversationId !== conversationId)
      throw new Error('This exercise belongs to another chat.')
    if (
      value.format === 'multiple-choice' &&
      (!value.choices ||
        value.choices.length < 2 ||
        !value.answerKey ||
        !value.choices.includes(value.answerKey))
    )
      throw new Error(
        'A multiple-choice exercise needs at least two choices and an answer key matching one choice.'
      )
    if (
      value.format === 'numeric' &&
      (!value.answerKey || !Number.isFinite(Number(value.answerKey)))
    )
      throw new Error('A numeric exercise needs a finite numeric answer key.')
    if (
      value.rubric &&
      new Set(value.rubric.map((criterion) => criterion.id)).size !== value.rubric.length
    )
      throw new Error('Each rubric criterion needs a distinct stable ID.')
    for (const criterion of value.rubric || []) {
      if (criterion.conceptId && criterion.edgeId)
        throw new Error('A criterion targets a concept or a relationship, not both.')
      if (criterion.edgeId) this.entity<ConceptEdge>('edge', criterion.edgeId, scopes)
      const conceptId = criterion.conceptId || value.conceptId
      const concept = conceptId ? this.concepts([conceptId], scopes)[0] : null
      if (criterion.facetId && !concept?.facets?.some((facet) => facet.id === criterion.facetId))
        throw new Error('A rubric facet must exist on its target concept.')
    }
    const now = new Date().toISOString()
    const record: Exercise = {
      ...(previous || {}),
      id: previous?.id || randomUUID(),
      scope,
      conversationId,
      title: value.title,
      prompt: value.prompt,
      kind: value.kind,
      conceptId: value.conceptId,
      hints: value.hints,
      solution: value.solution,
      criteria: value.criteria.length
        ? value.criteria
        : (value.rubric || []).map((criterion) => criterion.title),
      rubric: (value.rubric || []).map((criterion) => {
        const conceptId = criterion.conceptId || value.conceptId
        const facet =
          criterion.facetId && conceptId
            ? this.store
                .get<Concept>('concept', conceptId)
                ?.facets?.find((item) => item.id === criterion.facetId)
            : null
        const previousCriterion =
          input.rubric === undefined
            ? previous?.rubric?.find((item) => item.id === criterion.id)
            : null
        return {
          ...criterion,
          ...(facet ? { facetVersion: previousCriterion?.facetVersion || facetVersion(facet) } : {})
        }
      }),
      taskFamily: value.taskFamily || '',
      context: value.context || '',
      transferDescription: value.transferDescription || '',
      format: value.format,
      choices: value.choices || [],
      answerKey: value.answerKey || '',
      tolerance: value.tolerance,
      sources: this.sources(value.sourceIds, scopes),
      createdAt: previous?.createdAt || now,
      origin,
      dueAt: previous?.dueAt || now
    }
    record.contentVersion = exerciseVersion(record)
    const changed =
      previous && (previous.contentVersion || exerciseVersion(previous)) !== record.contentVersion
    this.store.transaction(() => {
      if (changed) {
        this.store.put('exerciseRevision', { id: randomUUID(), before: previous, at: now })
        this.store.remove('practice', record.id)
        this.store.setMeta(`exercise-progress:${record.id}`, {
          draft: '',
          hintsShown: 0,
          solutionSeen: false
        })
        record.dueAt = now
      }
      this.store.put('exercise', record)
    })
    return record
  }

  progress(exerciseId: string): ExerciseProgress {
    return this.store.meta<ExerciseProgress>(`exercise-progress:${exerciseId}`, {
      draft: '',
      hintsShown: 0,
      solutionSeen: false
    })
  }

  recordProgress(
    scopes: string[],
    exerciseId: string,
    input: { draft?: string; hint?: boolean; solution?: boolean }
  ): ExerciseProgress {
    const value = z
      .object({
        draft: text.optional(),
        hint: z.boolean().optional(),
        solution: z.boolean().optional()
      })
      .parse(input)
    const exercise = this.entity<Exercise>('exercise', exerciseId, scopes)
    const previous = this.progress(exerciseId)
    const next: ExerciseProgress = {
      ...previous,
      draft: value.draft ?? previous.draft,
      hintsShown: value.hint
        ? Math.min(exercise.hints.length, previous.hintsShown + 1)
        : previous.hintsShown,
      solutionSeen: previous.solutionSeen || Boolean(value.solution)
    }
    this.store.setMeta(`exercise-progress:${exerciseId}`, next)
    return next
  }

  exercisePracticeInfo(
    exerciseId: string,
    now = new Date()
  ): { schedule: PracticeSchedule | null; due: boolean; attempts: number } {
    const exercise = this.store.get<Exercise>('exercise', exerciseId)
    if (!exercise) throw new Error('This exercise no longer exists.')
    const schedule = this.store.get<PracticeSchedule>('practice', exerciseId)
    return {
      schedule,
      due:
        new Date(schedule?.dueAt || exercise.dueAt || exercise.createdAt).getTime() <=
        now.getTime(),
      attempts: this.store
        .all<Attempt>('attempt')
        .filter((attempt) => attempt.exerciseId === exerciseId).length
    }
  }

  practice(
    scopes: string[],
    options: { conceptId?: string; limit?: number; includeAdvanced?: boolean } = {},
    now = new Date()
  ): Exercise[] {
    const value = z
      .object({
        conceptId: id.optional(),
        limit: z.number().int().min(1).max(50).default(12),
        includeAdvanced: z.boolean().default(false)
      })
      .parse(options)
    if (value.conceptId) this.concepts([value.conceptId], scopes)
    const concepts = scopes.flatMap((scope) => learningConcepts(this.store, scope, now))
    const readiness = new Map(
      concepts.map((concept) => [concept.id, concept.readiness?.recommendedLevel || 'knowledge'])
    )
    return this.store
      .all<Exercise>('exercise')
      .filter(
        (exercise) =>
          scopes.includes(exercise.scope) &&
          (!value.conceptId ||
            exercise.conceptId === value.conceptId ||
            exercise.rubric?.some((criterion) => criterion.conceptId === value.conceptId))
      )
      .filter(
        (exercise) =>
          value.includeAdvanced ||
          learningLevels.indexOf(exercise.kind) <=
            learningLevels.indexOf(
              exercise.conceptId ? readiness.get(exercise.conceptId) || 'knowledge' : 'knowledge'
            )
      )
      .sort((a, b) => {
        const due = (exercise: Exercise): number =>
          new Date(
            this.store.get<PracticeSchedule>('practice', exercise.id)?.dueAt ||
              exercise.dueAt ||
              exercise.createdAt
          ).getTime()
        return due(a) - due(b)
      })
      .slice(0, value.limit)
  }

  context(scopes: string[], conversationId: string) {
    this.conversation(conversationId)
    const activeScopes = [...new Set(scopes)]
    const concepts = activeScopes.flatMap((scope) => learningConcepts(this.store, scope))
    const exercises = this.store
      .all<Exercise>('exercise')
      .filter((exercise) => activeScopes.includes(exercise.scope))
    const exerciseIds = new Set(exercises.map((exercise) => exercise.id))
    const inConversation = <T extends { scope: string; conversationId: string }>(
      kind: string
    ): T[] =>
      this.store
        .all<T>(kind)
        .filter(
          (item) => activeScopes.includes(item.scope) && item.conversationId === conversationId
        )
    const recentWork = this.store
      .all<Attempt>('attempt')
      .filter(
        (attempt) =>
          exerciseIds.has(attempt.exerciseId) &&
          exercises.find((exercise) => exercise.id === attempt.exerciseId)?.conversationId ===
            conversationId
      )
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12)
      .map((attempt) => ({
        ...attempt,
        answer: attempt.answer.slice(0, 2500),
        feedback: attempt.feedback?.slice(0, 2000) || null
      }))
    return {
      rubric:
        'Tags summarize scoped evidence. Unassessed is distinct from #unknown. No fixed progression, automatic promotion, prerequisite unlocking, or inference from graph proximity.',
      concepts: concepts.slice(0, 100).map((concept) => ({
        id: concept.id,
        title: concept.title,
        level: concept.level,
        levelOrigin: concept.levelOrigin,
        desiredLevel: concept.desiredLevel,
        facets: concept.facets,
        evidence: concept.evidence,
        readiness: concept.readiness,
        sourceIds: concept.sourceIds
      })),
      edges: this.store
        .all<ConceptEdge>('edge')
        .filter((edge) => activeScopes.includes(edge.scope) && edge.status !== 'rejected')
        .slice(0, 150)
        .map((edge) => ({
          ...edge,
          sources: edge.sources.map((source) => ({
            id: source.id,
            title: source.title,
            revision: source.revision
          }))
        })),
      goals: inConversation<StudyGoal>('goal')
        .filter((goal) => goal.status === 'active')
        .slice(-12),
      guides: inConversation<StudyGuide>('guide')
        .slice(-5)
        .map((guide) => ({
          ...guide,
          notes: guide.notes.slice(0, 2000),
          sources: guide.sources?.map((source) => ({
            id: source.id,
            title: source.title,
            revision: source.revision
          }))
        })),
      bits: inConversation<StudyBit>('bit')
        .filter((bit) => bit.status !== 'placed')
        .slice(-20)
        .map((bit) => ({
          id: bit.id,
          text: bit.text.slice(0, 2000),
          origin: bit.origin,
          conceptIds: bit.conceptIds,
          status: bit.status,
          sourceId: bit.source?.id
        })),
      proposals: inConversation<NoteProposal>('noteProposal')
        .filter((proposal) => proposal.status === 'pending')
        .slice(-15)
        .map((proposal) => ({
          id: proposal.id,
          path: proposal.path,
          conceptIds: proposal.conceptIds,
          rationale: proposal.rationale,
          operation: proposal.operation
        })),
      recentWork,
      practice: this.practice(activeScopes, { limit: 12 }).map((exercise) => ({
        id: exercise.id,
        conceptId: exercise.conceptId,
        title: exercise.title,
        kind: exercise.kind,
        format: exercise.format || 'open',
        prompt: exercise.prompt.slice(0, 2000),
        taskFamily: exercise.taskFamily,
        context: exercise.context,
        dueAt: exercise.dueAt
      }))
    }
  }
}
