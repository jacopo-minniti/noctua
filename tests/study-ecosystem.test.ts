import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  Attempt,
  Concept,
  Exercise,
  NoteProposal,
  Source,
  StudyBit
} from '../src/shared/types'
import { Store } from '../src/main/store'
import { checkExerciseAnswer, StudyService } from '../src/main/study'
import { learningConcepts, updatePracticeSchedule } from '../src/main/learning'

const stores: Store[] = []
const directories: string[] = []
const now = new Date('2026-10-04T12:00:00Z')
function setup(file = ':memory:') {
  const store = new Store(file)
  stores.push(store)
  store.put('conversation', {
    id: 'chat',
    title: 'LLM systems',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  })
  return { store, study: new StudyService(store) }
}
function concept(study: StudyService, title = 'Backpressure'): Concept {
  return study.saveConcept('vault', {
    title,
    facets: [
      { id: 'mechanism', title: 'Mechanism and conditions' },
      { id: 'tradeoff', title: 'Trade-offs and limits' }
    ]
  })
}
function exercise(
  study: StudyService,
  target: Concept,
  family = 'explain',
  context = 'service',
  kind: Exercise['kind'] = 'comprehension'
): Exercise {
  return study.saveExercise('vault', 'chat', {
    title: `${family} in ${context}`,
    prompt: `Explain ${target.title} in ${context}.`,
    conceptId: target.id,
    kind,
    taskFamily: family,
    context,
    transferDescription:
      kind === 'transfer'
        ? `Apply service-control reasoning to ${context}, explaining changed constraints.`
        : '',
    solution: 'A saved solution that must stay out of background context.',
    hints: ['A private hint.'],
    rubric: target.facets!.map((facet) => ({
      id: facet.id,
      title: facet.title,
      conceptId: target.id,
      facetId: facet.id,
      level: kind
    }))
  })
}
function attempt(
  store: Store,
  task: Exercise,
  attemptId: string,
  at = now.toISOString(),
  overrides: Partial<Attempt> = {}
): Attempt {
  return store.put('attempt', {
    id: attemptId,
    exerciseId: task.id,
    exerciseVersion: task.contentVersion,
    answer: 'My explanation and design reasoning.',
    assistance: 0,
    solutionSeen: false,
    at,
    feedback: 'The criteria were checked.',
    outcome: 'correct',
    assessedBy: 'model',
    criterionFeedback: task.rubric!.map((criterion) => ({
      criterionId: criterion.id,
      outcome: 'met',
      feedback: 'Your reasoning meets this criterion.'
    })),
    ...overrides
  } satisfies Attempt)
}
function source(store: Store, scope: string, sourceId: string): Source {
  const value: Source = {
    id: sourceId,
    scope,
    path: `${sourceId}.md`,
    title: sourceId,
    kind: 'markdown',
    revision: 'revision',
    heading: '',
    text: 'Some checkable source text.'
  }
  store.replaceDocument(scope, value.path, value.revision, value.title, value.kind, [value])
  return value
}
afterEach(async () => {
  for (const store of stores.splice(0)) {
    try {
      store.close()
    } catch {
      /* Persistence tests close and reopen. */
    }
  }
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})

describe('shared study operations', () => {
  it('supports manual capture, guides, relationships and practice with stable concept IDs and no model', () => {
    const { store, study } = setup()
    const target = concept(study)
    const prerequisite = concept(study, 'Queueing')
    const edge = study.saveEdge('vault', {
      fromId: prerequisite.id,
      toId: target.id,
      relation: 'prerequisite',
      rationale: 'Queueing helps explain accumulated load.',
      context: 'Bounded service queues'
    })
    const goal = study.saveGoal('vault', 'chat', {
      title: 'Understand this service design',
      conceptIds: [target.id],
      desiredLevel: 'comprehension'
    })
    const guide = study.saveGuide('vault', 'chat', {
      title: 'Questions to discuss',
      goalId: goal.id,
      conceptIds: [target.id],
      questions: ['What happens when arrivals exceed service capacity?']
    })
    const bit = study.captureBit('vault', 'chat', {
      text: 'I think a queue postpones overload; it does not remove it.'
    })
    expect(bit.status).toBe('inbox')
    expect(guide.goalId).toBe(goal.id)
    expect(edge.status).toBe('accepted')
    expect(store.all('card')).toHaveLength(0)
    expect(store.all('exercise')).toHaveLength(0)
    store.put('concept', { ...target, level: 'comprehension', levelOrigin: 'learner' })
    const renamed = study.saveConcept(
      'vault',
      { id: target.id, title: 'Backpressure and admission control' },
      'model'
    )
    expect(renamed.id).toBe(target.id)
    expect(renamed.level).toBe('comprehension')
    expect(renamed.facets).toEqual(target.facets)
    expect(study.context(['vault', 'attachments:chat'], 'chat').goals[0].id).toBe(goal.id)
  })

  it('checks source and concept scope, including current attachments and explicitly rejecting sibling retrieval', () => {
    const { study, store } = setup()
    const current = source(store, 'attachments:chat', 'current')
    const sibling = source(store, 'attachments:other-chat', 'sibling')
    expect(
      study.captureBit('vault', 'chat', {
        text: current.text,
        origin: 'quotation',
        sourceId: current.id
      }).source?.scope
    ).toBe('attachments:chat')
    expect(() =>
      study.captureBit('vault', 'chat', {
        text: sibling.text,
        origin: 'quotation',
        sourceId: sibling.id
      })
    ).toThrow('outside')
    expect(() =>
      study.captureBit('vault', 'chat', {
        text: 'A quotation without provenance.',
        origin: 'quotation'
      })
    ).toThrow('source')
    const foreign = study.saveConcept('other-vault', { title: 'Private concept' })
    expect(() =>
      study.saveGoal('vault', 'chat', { title: 'A goal', conceptIds: [foreign.id] })
    ).toThrow('outside')
    expect(() =>
      study.saveExercise('vault', 'chat', {
        title: 'Private task',
        prompt: 'Explain it.',
        kind: 'knowledge',
        conceptId: foreign.id
      })
    ).toThrow('outside')
  })

  it('keeps model relationships proposed and does not infer endpoint ability from connections', () => {
    const { store, study } = setup()
    const left = concept(study, 'Rate limits'),
      right = concept(study, 'Queues')
    const edge = study.saveEdge(
      'vault',
      {
        fromId: left.id,
        toId: right.id,
        relation: 'explains',
        rationale: 'A possible relationship to inspect.',
        status: 'accepted'
      },
      'model'
    )
    expect(edge.status).toBe('proposed')
    const accepted = study.decideEdge('vault', edge.id, 'accepted')
    expect(accepted.status).toBe('accepted')
    expect(store.all('edgeDecision')).toHaveLength(1)
    const task = study.saveExercise('vault', 'chat', {
      title: 'Explain this connection',
      prompt: 'Explain how admission control affects queues.',
      kind: 'comprehension',
      conceptId: left.id,
      rubric: [
        { id: 'edge', title: 'Connection explanation', edgeId: edge.id, level: 'comprehension' }
      ]
    })
    attempt(store, task, 'edge-attempt')
    expect(
      learningConcepts(store, 'vault', now).every((item) => item.suggestedLevel === null)
    ).toBe(true)
    expect(
      learningConcepts(store, 'vault', now).find((item) => item.id === left.id)?.evidence
        ?.independentSuccesses
    ).toBe(0)
  })

  it('connects explicitly visible attachment concepts without granting other attachment scopes', () => {
    const { store, study } = setup()
    const vaultConcept = concept(study)
    const attachmentConcept = study.saveConcept('attachments:chat', {
      title: 'Attached capacity study'
    })
    const siblingConcept = study.saveConcept('attachments:other-chat', {
      title: 'Unselected private attachment'
    })
    const cited = source(store, 'attachments:chat', 'edge-source')
    const input = {
      fromId: attachmentConcept.id,
      toId: vaultConcept.id,
      relation: 'explains' as const,
      rationale: 'The attached example explains this vault concept.',
      sourceIds: [cited.id]
    }
    expect(() => study.saveEdge('vault', input, 'model')).toThrow('outside')
    const visible = study.saveEdge('vault', input, 'learner', ['vault', 'attachments:chat'])
    expect(visible.scope).toBe('vault')
    expect(visible.sources[0].scope).toBe('attachments:chat')
    expect(() =>
      study.saveEdge('vault', { ...input, fromId: siblingConcept.id }, 'learner', [
        'vault',
        'attachments:chat'
      ])
    ).toThrow('outside')
  })

  it('collects exact note proposals and preserves bits until the learner reviews them', () => {
    const { store, study } = setup()
    const target = concept(study)
    const bit = study.captureBit('vault', 'chat', {
      text: 'Queues only buffer a finite burst.',
      conceptIds: [target.id]
    })
    const proposal = study.proposeNote('vault', 'chat', {
      path: 'Systems/Queues.md',
      expectedRevision: 'version-a',
      operation: 'append',
      after: bit.text,
      rationale: 'Preserve my explanation.',
      conceptIds: [target.id],
      bitIds: [bit.id]
    })
    expect(proposal.status).toBe('pending')
    expect(store.get<StudyBit>('bit', bit.id)?.status).toBe('proposed')
    expect(() =>
      study.proposeNote('vault', 'chat', {
        path: '../outside.md',
        expectedRevision: '',
        operation: 'append',
        after: 'text',
        rationale: 'test'
      })
    ).toThrow('relative')
    expect(() =>
      study.proposeNote('vault', 'chat', {
        path: 'Queues.md',
        expectedRevision: 'version-a',
        operation: 'replace',
        after: 'replacement',
        rationale: 'test'
      })
    ).toThrow('exact original')
    study.setProposalStatus('vault', proposal.id, 'accepted')
    expect(store.get<NoteProposal>('noteProposal', proposal.id)?.status).toBe('accepted')
    expect(store.get<StudyBit>('bit', bit.id)?.status).toBe('placed')
  })

  it('persists the connected records across a restart independently of rebuilding source cache', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'noctua-ecosystem-'))
    directories.push(directory)
    const file = path.join(directory, 'study.sqlite')
    const first = setup(file)
    const target = concept(first.study)
    const task = exercise(first.study, target)
    const bit = first.study.captureBit('vault', 'chat', {
      text: 'My durable explanation.',
      conceptIds: [target.id]
    })
    const work = attempt(first.store, task, 'persistent-attempt')
    updatePracticeSchedule(first.store, task, work, now)
    first.store.close()
    const second = setup(file)
    second.store.db.exec('DELETE FROM chunks; DELETE FROM documents;')
    expect(second.store.get<StudyBit>('bit', bit.id)?.text).toBe(bit.text)
    expect(second.store.get<Exercise>('exercise', task.id)?.conceptId).toBe(target.id)
    expect(second.study.exercisePracticeInfo(task.id, now).attempts).toBe(1)
    expect(second.study.exercisePracticeInfo(task.id, now).due).toBe(false)
  })

  it('keeps a guide’s exact source version after the source cache is rebuilt', () => {
    const { store, study } = setup()
    const original = source(store, 'vault', 'guide-source')
    const guide = study.saveGuide('vault', 'chat', {
      title: 'A source-grounded guide',
      sourceIds: [original.id]
    })
    store.replaceDocument('vault', original.path, 'new-version', original.title, original.kind, [
      {
        ...original,
        id: 'updated-source',
        revision: 'new-version',
        text: 'A changed source passage.'
      }
    ])
    expect(store.resolveSource(original.id)?.revision).toBe('revision')
    const edited = study.saveGuide('vault', 'chat', {
      id: guide.id,
      title: 'Edited guiding questions',
      sourceIds: [original.id],
      questions: ['What was the original claim?']
    })
    expect(edited.sources).toEqual([original])
    expect(store.resolveSource(original.id)?.historical).toBe(true)
    expect(JSON.stringify(study.context(['vault'], 'chat'))).not.toContain(original.text)
  })

  it('keeps a manually linked concept source inspectable after cache revision', () => {
    const { store, study } = setup()
    const original = source(store, 'vault', 'concept-source')
    const target = study.saveConcept('vault', {
      title: 'A sourced concept',
      sourceIds: [original.id]
    })
    store.db.prepare('DELETE FROM chunks WHERE id=?').run(original.id)
    const renamed = study.saveConcept('vault', {
      id: target.id,
      title: 'A renamed sourced concept'
    })
    expect(renamed.sources).toEqual([original])
    expect(store.resolveSource(original.id)?.revision).toBe(original.revision)
  })

  it('preserves links, authorship and help content when editing only an item title or text', () => {
    const { store, study } = setup()
    const original = source(store, 'vault', 'linked-source')
    const target = concept(study)
    const goal = study.saveGoal('vault', 'chat', {
      title: 'A scoped goal',
      conceptIds: [target.id],
      desiredLevel: 'comprehension'
    })
    const guide = study.saveGuide('vault', 'chat', {
      title: 'A linked guide',
      goalId: goal.id,
      sourceIds: [original.id],
      questions: ['Explain the main idea.']
    })
    const task = study.saveExercise('vault', 'chat', {
      title: 'A linked task',
      prompt: 'Explain it.',
      kind: 'comprehension',
      sourceIds: [original.id],
      hints: ['A hint.'],
      solution: 'A saved answer.'
    })
    const bit = study.captureBit('vault', 'chat', {
      text: original.text,
      origin: 'quotation',
      sourceId: original.id,
      conceptIds: [target.id]
    })
    const renamedGoal = study.saveGoal('vault', 'chat', { id: goal.id, title: 'Renamed goal' })
    const renamedGuide = study.saveGuide('vault', 'chat', { id: guide.id, title: 'Renamed guide' })
    const renamedTask = study.saveExercise('vault', 'chat', {
      id: task.id,
      title: 'Renamed task',
      prompt: task.prompt,
      kind: task.kind
    })
    const editedBit = study.captureBit('vault', 'chat', {
      id: bit.id,
      text: `${bit.text} An unchanged quote origin.`
    })
    expect(renamedGoal.conceptIds).toEqual([target.id])
    expect(renamedGoal.desiredLevel).toBe('comprehension')
    expect(renamedGuide.sources).toEqual([original])
    expect(renamedGuide.questions).toEqual(guide.questions)
    expect(renamedTask.contentVersion).toBe(task.contentVersion)
    expect(renamedTask.sources).toEqual([original])
    expect(renamedTask.hints).toEqual(task.hints)
    expect(editedBit.origin).toBe('quotation')
    expect(editedBit.conceptIds).toEqual([target.id])
  })
})

describe('criterion-level evidence and flexible depth', () => {
  it('can support application directly without requiring flashcards or successive lower-level quizzes', () => {
    const { store, study } = setup()
    const target = concept(study)
    const tasks = [
      exercise(study, target, 'diagnose a bottleneck', 'interactive service', 'application'),
      exercise(study, target, 'design admission control', 'batch pipeline', 'application')
    ]
    for (const task of tasks) {
      attempt(store, task, `${task.id}-early`, '2026-10-01T12:00:00Z')
      attempt(store, task, `${task.id}-later`, '2026-10-04T12:00:00Z')
    }
    const summary = learningConcepts(store, 'vault', now)[0]
    expect(summary.suggestedLevel).toBe('application')
    expect(summary.level).toBeNull()
    expect(summary.recall.cards).toBe(0)
    expect(summary.evidence?.facets.map((facet) => facet.levels)).toEqual([
      ['application'],
      ['application']
    ])
    expect(summary.evidence?.uncertainty).toContain(
      'Model assessments are provisional and can be corrected.'
    )
  })

  it('does not promote from two questions, omitted facets, duplicate task families, or assisted answers', () => {
    const { store, study } = setup()
    const target = concept(study)
    const a = exercise(study, target, 'same family', 'same context')
    const b = exercise(study, target, 'same family', 'same context')
    attempt(store, a, 'first')
    attempt(store, b, 'second')
    expect(learningConcepts(store, 'vault', now)[0].suggestedLevel).toBeNull()
    attempt(store, a, 'old-first', '2026-10-01T12:00:00Z')
    attempt(store, b, 'old-second', '2026-10-01T12:00:00Z')
    expect(learningConcepts(store, 'vault', now)[0].evidence?.independentSuccesses).toBe(1)
    const varied = exercise(study, target, 'different family', 'changed context')
    attempt(store, varied, 'assisted-old', '2026-10-01T12:00:00Z', { assistance: 1 })
    attempt(store, varied, 'assisted-new', now.toISOString(), { solutionSeen: true })
    expect(learningConcepts(store, 'vault', now)[0].suggestedLevel).toBeNull()
    expect(learningConcepts(store, 'vault', now)[0].evidence?.assistedSuccesses).toBe(1)
  })

  it('retains mixed facet gaps without marking unrelated facets or prerequisites unknown', () => {
    const { store, study } = setup()
    const target = concept(study),
      prerequisite = concept(study, 'Capacity planning')
    study.saveEdge('vault', {
      fromId: prerequisite.id,
      toId: target.id,
      relation: 'prerequisite',
      rationale: 'Relevant for capacity decisions.'
    })
    const task = exercise(study, target)
    attempt(store, task, 'mixed', now.toISOString(), {
      outcome: 'partial',
      criterionFeedback: [
        { criterionId: 'mechanism', outcome: 'met', feedback: 'Mechanism explained.' },
        {
          criterionId: 'tradeoff',
          outcome: 'not-met',
          feedback: 'A finite queue does not remove sustained overload.'
        }
      ]
    })
    const summaries = learningConcepts(store, 'vault', now)
    const summary = summaries.find((item) => item.id === target.id)!
    expect(
      summary.evidence?.facets.find((facet) => facet.id === 'mechanism')?.independentSuccesses
    ).toBe(1)
    expect(summary.evidence?.facets.find((facet) => facet.id === 'tradeoff')?.gaps).toBe(1)
    expect(summary.readiness?.prerequisiteConceptIds).toContain(prerequisite.id)
    expect(summaries.find((item) => item.id === prerequisite.id)?.level).toBeNull()
    expect(summaries.find((item) => item.id === prerequisite.id)?.evidence?.source).toBe(
      'unassessed'
    )
  })

  it('keeps source-supported performance distinct and respects the requested shallow depth', () => {
    const { store, study } = setup()
    const target = concept(study)
    store.put('concept', {
      ...target,
      level: 'transfer',
      levelOrigin: 'learner',
      desiredLevel: 'knowledge'
    })
    const task = exercise(study, target, 'design', 'service', 'application')
    attempt(store, task, 'with-resources', now.toISOString(), {
      conditions: { resourcesUsed: true, helpDescription: '' }
    })
    const summary = learningConcepts(store, 'vault', now)[0]
    expect(summary.level).toBe('transfer')
    expect(summary.readiness?.recommendedLevel).toBe('knowledge')
    expect(summary.evidence?.independentSuccesses).toBe(0)
    expect(summary.evidence?.assistedSuccesses).toBe(1)
    expect(summary.evidence?.uncertainty).toContain(
      'The chosen tag is learner/vault judgment, not proof of independent ability.'
    )
    expect(study.practice(['vault'])).toHaveLength(0)
    expect(study.practice(['vault'], { includeAdvanced: true })).toHaveLength(1)
  })

  it('requires described changed contexts for transfer and avoids treating a label as proof', () => {
    const { store, study } = setup()
    const target = concept(study)
    const tasks = [
      exercise(study, target, 'adapt capacity reasoning', 'geometry proof', 'transfer'),
      exercise(study, target, 'adapt control reasoning', 'distributed training', 'transfer')
    ]
    for (const task of tasks) {
      store.put('exercise', { ...task, transferDescription: '' })
      attempt(store, task, `${task.id}-early`, '2026-10-01T12:00:00Z')
      attempt(store, task, `${task.id}-late`)
    }
    expect(learningConcepts(store, 'vault', now)[0].suggestedLevel).toBeNull()
    for (const task of tasks) store.put('exercise', task)
    expect(learningConcepts(store, 'vault', now)[0].suggestedLevel).toBe('transfer')
  })

  it('retains work while excluding observations whose facet meaning changed', () => {
    const { store, study } = setup()
    const target = concept(study)
    const tasks = [
      exercise(study, target, 'explain causally'),
      exercise(study, target, 'contrast mechanisms')
    ]
    for (const task of tasks) {
      attempt(store, task, `${task.id}-old`, '2026-10-01T12:00:00Z')
      attempt(store, task, `${task.id}-new`)
    }
    expect(learningConcepts(store, 'vault', now)[0].suggestedLevel).toBe('comprehension')
    const revised = study.saveConcept('vault', {
      id: target.id,
      title: target.title,
      facets: target.facets!.map((facet) =>
        facet.id === 'mechanism'
          ? { ...facet, description: 'Include queue stability, feedback delay, and oscillation.' }
          : facet
      )
    })
    expect(revised.facets?.find((facet) => facet.id === 'mechanism')?.version).not.toBe(
      target.facets?.find((facet) => facet.id === 'mechanism')?.version
    )
    const summary = learningConcepts(store, 'vault', now)[0]
    expect(summary.suggestedLevel).toBeNull()
    expect(
      summary.evidence?.facets.find((facet) => facet.id === 'mechanism')?.independentSuccesses
    ).toBe(0)
    expect(
      summary.evidence?.facets.find((facet) => facet.id === 'tradeoff')?.independentSuccesses
    ).toBe(2)
    expect(store.all('conceptFacetRevision')).toHaveLength(1)
    expect(store.all('attempt')).toHaveLength(4)
  })
})

describe('exercise work and revisiting', () => {
  it('records help across restarts/reopens and excludes historical answers after a task revision', () => {
    const { store, study } = setup()
    const target = concept(study),
      task = exercise(study, target)
    const progress = study.recordProgress(['vault'], task.id, {
      draft: 'My partial reasoning.',
      hint: true
    })
    store.setMeta(`exercise-progress:${task.id}`, { ...progress, adviceCount: 2 })
    study.recordProgress(['vault'], task.id, { solution: true })
    study.recordProgress(['vault'], task.id, { hint: false, solution: false })
    expect(study.progress(task.id)).toEqual({
      adviceCount: 2,
      draft: 'My partial reasoning.',
      hintsShown: 1,
      solutionSeen: true
    })
    const work = attempt(store, task, 'old-work')
    updatePracticeSchedule(store, task, work, now)
    const revised = study.saveExercise('vault', 'chat', {
      id: task.id,
      title: task.title,
      prompt: 'Use a changed set of constraints.',
      kind: task.kind,
      conceptId: target.id,
      solution: task.solution,
      hints: task.hints,
      rubric: task.rubric,
      taskFamily: task.taskFamily,
      context: task.context
    })
    expect(revised.contentVersion).not.toBe(task.contentVersion)
    expect(study.progress(task.id)).toEqual({ draft: '', hintsShown: 0, solutionSeen: false })
    expect(store.all<Attempt>('attempt')).toHaveLength(1)
    expect(study.exercisePracticeInfo(task.id).schedule).toBeNull()
    expect(learningConcepts(store, 'vault', now)[0].evidence?.independentSuccesses).toBe(0)
  })

  it('resurfaces failed and assisted work sooner without counting reassessment as repeated success', () => {
    const { store, study } = setup()
    const target = concept(study),
      task = exercise(study, target)
    const work = attempt(store, task, 'practice-attempt')
    const independent = updatePracticeSchedule(store, task, work, now)
    expect(independent.independentSuccesses).toBe(1)
    expect(updatePracticeSchedule(store, task, work, now).independentSuccesses).toBe(1)
    const corrected = store.put('attempt', {
      ...work,
      outcome: 'incorrect' as const,
      assessedBy: 'learner' as const,
      criterionFeedback: []
    })
    const failed = updatePracticeSchedule(store, task, corrected, now)
    expect(failed.independentSuccesses).toBe(0)
    expect(new Date(failed.dueAt).getTime()).toBeLessThan(new Date(independent.dueAt).getTime())
    expect(study.exercisePracticeInfo(task.id, new Date('2026-10-06T12:00:00Z')).due).toBe(true)
  })

  it('checks keyed closed answers without a model and does not expose solutions in contextual state', () => {
    const { study } = setup()
    const target = concept(study)
    const numeric = study.saveExercise('vault', 'chat', {
      title: 'A capacity calculation',
      prompt: 'What capacity is required?',
      kind: 'application',
      conceptId: target.id,
      format: 'numeric',
      answerKey: '12.5',
      tolerance: 0.1,
      solution: 'The full saved worked solution.',
      hints: ['A saved hint.']
    })
    expect(checkExerciseAnswer(numeric, '12.55')?.outcome).toBe('correct')
    expect(checkExerciseAnswer(numeric, '12.55\nI apply the capacity constraint.')?.outcome).toBe(
      'correct'
    )
    expect(checkExerciseAnswer(numeric, '')?.outcome).toBe('incorrect')
    expect(checkExerciseAnswer(numeric, '0')?.outcome).toBe('incorrect')
    expect(() =>
      study.saveExercise('vault', 'chat', {
        title: 'Invalid choices',
        prompt: 'Choose.',
        kind: 'knowledge',
        format: 'multiple-choice',
        choices: ['A', 'B'],
        answerKey: 'C'
      })
    ).toThrow('matching')
    const context = JSON.stringify(study.context(['vault', 'attachments:chat'], 'chat'))
    expect(context).not.toContain('full saved worked solution')
    expect(context).not.toContain('A saved hint')
    expect(context).not.toContain('answerKey')
  })
})
