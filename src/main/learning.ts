import { createHash, randomUUID } from 'node:crypto'
import { createEmptyCard, fsrs, Rating as FSRSRating, type Card } from 'ts-fsrs'
import type {
  Attempt,
  Concept,
  Exercise,
  Flashcard,
  ConceptEdge,
  ConceptEvidenceSummary,
  ConceptFacet,
  EvidenceFacetSummary,
  LearningConcept,
  Level,
  PracticeReadiness,
  PracticeSchedule,
  Rating,
  RecallSummary,
  Review,
  SchedulerState
} from '../shared/types'
import { Store } from './store'

export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false })
export const schedulerVersion = 'ts-fsrs@5.4.2;retention=0.9;fuzz=false;default-parameters'
export const cardVersion = (front: string, back: string): string =>
  createHash('sha256').update(`${front}\0${back}`).digest('hex')
export function serializeCard(card: Card): SchedulerState {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() }
}
export function deserializeCard(card: SchedulerState): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined
  }
}
export function newSchedule(now = new Date()): SchedulerState {
  return serializeCard(createEmptyCard(now))
}

export function reviewCard(
  store: Store,
  id: string,
  rating: Rating,
  expectedReps: number,
  now = new Date()
): Review {
  const card = store.get<Flashcard>('card', id)
  if (!card || card.suspended) throw new Error('This card is no longer available for review.')
  if (card.scheduler.reps !== expectedReps)
    throw new Error('This review was already recorded. Refresh the card.')
  const result = scheduler.next(
    deserializeCard(card.scheduler),
    now,
    rating as FSRSRating.Again | FSRSRating.Hard | FSRSRating.Good | FSRSRating.Easy
  )
  const review: Review = {
    id: randomUUID(),
    cardId: id,
    rating,
    at: now.toISOString(),
    before: card.scheduler,
    after: serializeCard(result.card),
    schedulerVersion,
    contentVersion: card.contentVersion,
    log: result.log
  }
  store.transaction(() => {
    store.put('review', review)
    store.put('card', { ...card, scheduler: review.after })
  })
  return review
}

export function recallSummary(
  cards: Flashcard[],
  reviews: Review[],
  now = new Date()
): RecallSummary {
  const ids = new Set(cards.map((card) => card.id))
  const versions = new Map(cards.map((card) => [card.id, card.contentVersion]))
  const applicable = reviews.filter(
    (review) => ids.has(review.cardId) && review.contentVersion === versions.get(review.cardId)
  )
  const reviewed = cards.filter((card) => card.scheduler.reps > 0)
  const recalls = reviewed.map((card) =>
    Number(scheduler.get_retrievability(deserializeCard(card.scheduler), now, false))
  )
  const recall = recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : null
  const successfulDays = new Set(
    applicable.filter((review) => review.rating >= 3).map((review) => review.at.slice(0, 10))
  ).size
  // An experimental suggestion, never a validated mastery threshold or automatic promotion.
  const suggestedLevel =
    reviewed.length >= 3 &&
    reviewed.length === cards.length &&
    successfulDays >= 2 &&
    recall !== null &&
    recall >= 0.8
      ? 'knowledge'
      : null
  return {
    cards: cards.length,
    reviewed: reviewed.length,
    reviews: applicable.length,
    recall,
    successfulDays,
    suggestedLevel
  }
}

export const learningLevels = ['knowledge', 'comprehension', 'application', 'transfer'] as const

/** These are transparent practice heuristics, not calibrated mastery probabilities. */
export const levelRubric: Record<Exclude<Level, 'unknown'>, string> = {
  knowledge: 'Retrieve the important facts, distinctions, and conditions without answer cues.',
  comprehension: 'Explain the central mechanism and justify its assumptions and relationships.',
  application: 'Choose and use the idea with justified reasoning in varied suitable problems.',
  transfer:
    'Adapt the idea to meaningfully changed settings and explain what carries over or fails.'
}

const normalized = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ')
const timestamp = (value: string): number => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const day = 86_400_000

export function facetVersion(facet: Pick<ConceptFacet, 'id' | 'title' | 'description'>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({ id: facet.id, title: facet.title, description: facet.description || '' })
    )
    .digest('hex')
}

export function exerciseVersion(exercise: Exercise): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        prompt: exercise.prompt,
        kind: exercise.kind,
        solution: exercise.solution,
        criteria: exercise.criteria,
        rubric: exercise.rubric || [],
        conceptId: exercise.conceptId,
        format: exercise.format || 'open',
        choices: exercise.choices || [],
        answerKey: exercise.answerKey || '',
        tolerance: exercise.tolerance ?? null,
        taskFamily: exercise.taskFamily || '',
        context: exercise.context || '',
        transferDescription: exercise.transferDescription || ''
      })
    )
    .digest('hex')
}

export function independentAttempt(attempt: Attempt): boolean {
  return (
    attempt.assistance === 0 &&
    !attempt.solutionSeen &&
    !attempt.conditions?.resourcesUsed &&
    !attempt.conditions?.helpDescription?.trim()
  )
}

export function currentAttempt(exercise: Exercise, attempt: Attempt): boolean {
  if (!exercise.contentVersion)
    return !attempt.exerciseVersion || attempt.exerciseVersion === exerciseVersion(exercise)
  return attempt.exerciseVersion === exercise.contentVersion
}

/** Recompute from immutable work so repeated grading cannot count as another practice event. */
export function updatePracticeSchedule(
  store: Store,
  exercise: Exercise,
  attempt: Attempt,
  now = new Date()
): PracticeSchedule {
  const contentVersion = exercise.contentVersion || exerciseVersion(exercise)
  const work = store
    .all<Attempt>('attempt')
    .filter((item) => item.exerciseId === exercise.id && currentAttempt(exercise, item))
    .sort((a, b) => timestamp(a.at) - timestamp(b.at))
  const latest = work.at(-1) || attempt
  const independentDays = new Set(
    work
      .filter((item) => item.outcome === 'correct' && independentAttempt(item))
      .map((item) => item.at.slice(0, 10))
  )
  const independentSuccesses = independentDays.size
  // Exercise intervals are a small revisiting policy, separate from FSRS and rank inference.
  const interval =
    latest.outcome === 'correct' && independentAttempt(latest)
      ? [3, 7, 14, 30][Math.min(3, Math.max(0, independentSuccesses - 1))]
      : latest.outcome === 'ungraded'
        ? 0.25
        : 1
  const baseTime = timestamp(latest.at) || now.getTime()
  const record: PracticeSchedule = {
    id: exercise.id,
    exerciseId: exercise.id,
    contentVersion,
    dueAt: new Date(baseTime + interval * day).toISOString(),
    independentSuccesses,
    lastOutcome: latest.outcome,
    lastAttemptId: latest.id,
    updatedAt: now.toISOString()
  }
  store.transaction(() => {
    store.put('practice', record)
    store.put('exercise', { ...exercise, dueAt: record.dueAt })
  })
  return record
}

interface Observation {
  facetId: string
  level: Exclude<Level, 'unknown'>
  outcome: 'met' | 'partial' | 'not-met' | 'unobserved'
  independent: boolean
  family: string
  context: string
  at: string
  transfer: boolean
  structured: boolean
  taskId: string
  criterionId: string
}

function summarizeEvidence(
  concept: Concept,
  cards: Flashcard[],
  reviews: Review[],
  tasks: Exercise[],
  work: Attempt[],
  now: Date,
  revisedFacets: Set<string>
): ConceptEvidenceSummary {
  const declaredFacets = concept.facets || []
  const uncertainty = new Set<string>()
  const observations: Observation[] = []
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  let ungraded = 0
  for (const attempt of work) {
    const task = taskMap.get(attempt.exerciseId)
    if (!task || !currentAttempt(task, attempt)) {
      uncertainty.add('Historical attempts are retained but do not assess revised task content.')
      continue
    }
    if (attempt.outcome === 'ungraded') {
      ungraded++
      continue
    }
    if (attempt.assessedBy === 'model')
      uncertainty.add('Model assessments are provisional and can be corrected.')
    if (attempt.conditions?.resourcesUsed)
      uncertainty.add(
        'Some work used resources; it does not establish unaided recall or reasoning.'
      )
    if (attempt.uncertainty) uncertainty.add(attempt.uncertainty)
    if (!task.taskFamily)
      uncertainty.add(
        'Some task families are inferred from prompts; near-duplicate variation may be unrecognized.'
      )
    const family = normalized(task.taskFamily || task.prompt)
    const context = normalized(task.context || '')
    const rubric = task.rubric || []
    const feedback = attempt.criterionFeedback || []
    const independent = independentAttempt(attempt)
    let structured = false
    for (const criterion of rubric) {
      // An edge criterion assesses the relationship, not both endpoints by association.
      if (criterion.edgeId || (criterion.conceptId || task.conceptId) !== concept.id) continue
      const facet = declaredFacets.find((item) => item.id === criterion.facetId)
      if (
        criterion.facetId &&
        (!facet ||
          (criterion.facetVersion
            ? criterion.facetVersion !== facetVersion(facet)
            : revisedFacets.has(criterion.facetId)))
      ) {
        uncertainty.add(
          'Historical observations of a changed facet are retained but do not assess its revised meaning.'
        )
        continue
      }
      const result = feedback.find((item) => item.criterionId === criterion.id)
      if (!result) continue
      if (result.uncertainty) uncertainty.add(result.uncertainty)
      structured = true
      observations.push({
        facetId: criterion.facetId || '',
        level: criterion.level,
        outcome:
          attempt.outcome === 'incorrect' && result.outcome === 'met'
            ? 'unobserved'
            : result.outcome,
        independent,
        family,
        context,
        at: attempt.at,
        transfer: Boolean(task.transferDescription?.trim()),
        structured: true,
        taskId: task.id,
        criterionId: criterion.id
      })
    }
    if (!structured && task.conceptId === concept.id && !rubric.length) {
      observations.push({
        facetId: '',
        level: task.kind,
        outcome:
          attempt.outcome === 'correct'
            ? 'met'
            : attempt.outcome === 'partial'
              ? 'partial'
              : 'not-met',
        independent,
        family,
        context,
        at: attempt.at,
        transfer: false,
        structured: false,
        taskId: task.id,
        criterionId: ''
      })
      uncertainty.add(
        'Overall correctness without criterion-level coverage does not establish a broad concept rank.'
      )
    }
  }
  for (const card of cards) {
    const facet = declaredFacets.find((item) => item.id === card.facetId)
    if (
      card.facetId &&
      (!facet ||
        (card.facetVersion
          ? card.facetVersion !== facetVersion(facet)
          : revisedFacets.has(card.facetId)))
    ) {
      uncertainty.add(
        'Historical recall of a changed facet is retained but does not assess its revised meaning.'
      )
      continue
    }
    for (const review of reviews) {
      if (review.cardId !== card.id || review.contentVersion !== card.contentVersion) continue
      observations.push({
        facetId: card.facetId || '',
        level: 'knowledge',
        outcome: review.rating >= 3 ? 'met' : review.rating === 2 ? 'partial' : 'not-met',
        independent: true,
        family: normalized(card.taskFamily || card.front),
        context: 'flashcard retrieval',
        at: review.at,
        transfer: false,
        structured: Boolean(card.facetId),
        taskId: card.id,
        criterionId: 'recall'
      })
    }
  }
  if (cards.length)
    uncertainty.add(
      'Flashcard ratings are self-reported sampled recall, not comprehension or complete coverage.'
    )
  const facets = declaredFacets.map((facet) => ({ id: facet.id, title: facet.title }))
  if (observations.some((item) => !item.facetId) || !facets.length)
    facets.push({ id: '', title: 'Unspecified coverage' })
  const summary: EvidenceFacetSummary[] = facets.map((facet) => {
    const relevant = observations.filter((item) => item.facetId === facet.id)
    const success = relevant.filter((item) => item.outcome === 'met')
    const latestByFamily = new Map<string, Observation>()
    for (const observation of relevant) {
      const key = `${observation.level}\0${observation.family}\0${observation.context}`
      const previous = latestByFamily.get(key)
      if (!previous || timestamp(observation.at) >= timestamp(previous.at))
        latestByFamily.set(key, observation)
    }
    const distinct = (items: Observation[]): number =>
      new Set(items.map((item) => `${item.level}\0${item.family}\0${item.context}`)).size
    return {
      id: facet.id,
      title: facet.title,
      observations: relevant.length,
      independentSuccesses: distinct(success.filter((item) => item.independent)),
      assistedSuccesses: distinct(success.filter((item) => !item.independent)),
      gaps: [...latestByFamily.values()].filter(
        (item) => item.outcome === 'not-met' || item.outcome === 'partial'
      ).length,
      families: [...new Set(success.map((item) => item.family))],
      contexts: [...new Set(success.map((item) => item.context).filter(Boolean))],
      levels: [...new Set(success.filter((item) => item.independent).map((item) => item.level))],
      lastObservedAt: relevant.length
        ? relevant.reduce(
            (latest, item) => (timestamp(item.at) > timestamp(latest) ? item.at : latest),
            relevant[0].at
          )
        : null
    }
  })
  const reasons: string[] = []
  let candidateLevel: Level | null = null
  if (!declaredFacets.length) {
    reasons.push(
      'Define the important facets before interpreting sampled work as coverage of the whole concept.'
    )
  } else {
    for (const level of learningLevels) {
      const eligible = observations.filter(
        (item) =>
          item.level === level && item.structured && item.independent && item.outcome === 'met'
      )
      const covered = declaredFacets.every((facet) => {
        const samples = eligible.filter((item) => item.facetId === facet.id)
        if (!samples.length) return false
        // Delayed evidence is necessary for a broad suggestion; repetitions still do not add families.
        const times = samples.map((item) => timestamp(item.at))
        const latestAt = Math.max(...times)
        const oldestAt = Math.min(...times)
        const newerGap = observations.some(
          (item) =>
            item.facetId === facet.id &&
            item.level === level &&
            item.independent &&
            item.outcome !== 'met' &&
            item.outcome !== 'unobserved' &&
            timestamp(item.at) >= latestAt
        )
        return latestAt - oldestAt >= day && now.getTime() - latestAt <= 90 * day && !newerGap
      })
      const varied = new Set(eligible.map((item) => item.family)).size > 1
      const contexts = new Set(eligible.map((item) => item.context).filter(Boolean)).size
      const changedContexts = level !== 'transfer' || eligible.every((item) => item.transfer)
      if (
        covered &&
        varied &&
        (level === 'knowledge' || level === 'comprehension' || contexts > 1) &&
        changedContexts
      )
        candidateLevel = level
    }
    if (candidateLevel)
      reasons.push(
        `Independent, delayed evidence covers the declared facets at #${candidateLevel}; inspect the observations before choosing a tag.`
      )
    else
      reasons.push(
        'Current evidence is useful for individual facets; delayed or varied independent coverage is still incomplete.'
      )
  }
  const independentSuccesses = new Set(
    observations
      .filter((item) => item.independent && item.outcome === 'met')
      .map((item) => `${item.family}\0${item.context}`)
  ).size
  const assistedSuccesses = new Set(
    observations
      .filter((item) => !item.independent && item.outcome === 'met')
      .map((item) => `${item.family}\0${item.context}`)
  ).size
  const lastObservedAt = observations.length
    ? observations.reduce(
        (latest, item) => (timestamp(item.at) > timestamp(latest) ? item.at : latest),
        observations[0].at
      )
    : null
  if (concept.level)
    uncertainty.add('The chosen tag is learner/vault judgment, not proof of independent ability.')
  if (lastObservedAt && now.getTime() - timestamp(lastObservedAt) > 90 * day)
    uncertainty.add('The most recent observed evidence is old; revisit it before relying on it.')
  return {
    facets: summary,
    independentSuccesses,
    assistedSuccesses,
    ungraded,
    lastObservedAt,
    source: observations.length ? 'observed' : concept.level ? 'self-reported' : 'unassessed',
    reasons,
    uncertainty: [...uncertainty],
    candidateLevel
  }
}

export function practiceReadiness(
  concept: Concept,
  evidence: ConceptEvidenceSummary,
  concepts: Concept[],
  edges: ConceptEdge[]
): PracticeReadiness {
  const observed = evidence.candidateLevel === 'unknown' ? null : evidence.candidateLevel
  const selected = concept.level === 'unknown' ? null : concept.level
  let recommendedLevel = selected || observed || 'knowledge'
  const desiredLevel = concept.desiredLevel || null
  if (
    desiredLevel &&
    desiredLevel !== 'unknown' &&
    learningLevels.indexOf(desiredLevel) < learningLevels.indexOf(recommendedLevel)
  )
    recommendedLevel = desiredLevel
  const prerequisiteConceptIds = edges
    .filter(
      (edge) =>
        edge.status === 'accepted' && edge.relation === 'prerequisite' && edge.toId === concept.id
    )
    .map((edge) => edge.fromId)
  const missing = concepts.filter(
    (item) =>
      prerequisiteConceptIds.includes(item.id) && (item.level === null || item.level === 'unknown')
  )
  const cautions: string[] = []
  if (!observed)
    cautions.push(
      'Independent performance has not established the selected depth; start with a focused check.'
    )
  if (missing.length)
    cautions.push(
      `Possible prerequisites to inspect: ${missing.map((item) => item.title).join(', ')}. Connections do not prove a gap.`
    )
  if (evidence.facets.some((facet) => facet.gaps > 0))
    cautions.push(
      'Specific facet gaps remain; revisit those without resetting unrelated abilities.'
    )
  return {
    recommendedLevel,
    desiredLevel,
    rationale: `${levelRubric[recommendedLevel]} ${desiredLevel ? 'Respect the chosen depth; deeper study is optional.' : 'Stay at a useful depth until the learner’s goal or evidence calls for a change.'}`,
    prerequisiteConceptIds,
    cautions
  }
}

export function learningConcepts(store: Store, scope: string, now = new Date()): LearningConcept[] {
  const concepts = store
    .all<Concept>('concept')
    .filter((concept) => concept.scope === scope && !concept.archived)
  const cards = store
    .all<Flashcard>('card')
    .filter((card) => !card.suspended && card.scope === scope)
  const reviews = store.all<Review>('review')
  const exercises = store.all<Exercise>('exercise').filter((exercise) => exercise.scope === scope)
  const attempts = store.all<Attempt>('attempt')
  const edges = store.all<ConceptEdge>('edge').filter((edge) => edge.scope === scope)
  const revisions = store.all<{ conceptId: string; changedFacetIds: string[] }>(
    'conceptFacetRevision'
  )
  return concepts.map((concept) => {
    const conceptCards = cards.filter((card) => card.conceptId === concept.id)
    const recall = recallSummary(conceptCards, reviews, now)
    const tasks = exercises.filter(
      (exercise) =>
        exercise.conceptId === concept.id ||
        exercise.rubric?.some(
          (criterion) => criterion.conceptId === concept.id && !criterion.edgeId
        )
    )
    const taskIds = new Set(tasks.map((task) => task.id))
    const work = attempts.filter((attempt) => taskIds.has(attempt.exerciseId))
    const revisedFacets = new Set(
      revisions
        .filter((revision) => revision.conceptId === concept.id)
        .flatMap((revision) => revision.changedFacetIds)
    )
    const evidence = summarizeEvidence(
      concept,
      conceptCards,
      reviews,
      tasks,
      work,
      now,
      revisedFacets
    )
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const independentTasks = work.filter((attempt) => {
      const task = taskMap.get(attempt.exerciseId)!
      return (
        attempt.outcome === 'correct' &&
        independentAttempt(attempt) &&
        currentAttempt(task, attempt) &&
        (!task.rubric?.length ||
          task.rubric.some(
            (criterion) =>
              !criterion.edgeId && (criterion.conceptId || task.conceptId) === concept.id
          ))
      )
    })
    return {
      ...concept,
      recall,
      evidence,
      readiness: practiceReadiness(concept, evidence, concepts, edges),
      attempts: work.length,
      independentSuccesses: new Set(
        independentTasks.map((attempt) => {
          const task = taskMap.get(attempt.exerciseId)!
          return `${normalized(task.taskFamily || task.prompt)}\0${normalized(task.context || '')}`
        })
      ).size,
      suggestedLevel: evidence.candidateLevel
    }
  })
}
