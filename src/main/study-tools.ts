import { randomUUID } from 'node:crypto'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Type } from '@earendil-works/pi-ai'
import { z } from 'zod'
import type {
  Concept,
  ConceptEdge,
  Flashcard,
  Exercise,
  Attempt,
  Message,
  Source,
  StudyBit,
  StudyGuide,
  StudyHandoff
} from '../shared/types'
import { Store } from './store'
import { StudyService } from './study'
import { containedFile, hash, Vault } from './vault'
import { readSourceDocument } from './source-reading'
import { NoteEditor } from './note-writing'

const ids = () => Type.Optional(Type.Array(Type.String(), { maxItems: 30 }))
const level = () =>
  Type.Union([
    Type.Literal('knowledge'),
    Type.Literal('comprehension'),
    Type.Literal('application'),
    Type.Literal('transfer')
  ])
const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  details: {}
})
interface StudyMemory {
  id: string
  scope: string
  conversationId: string
  kind: 'goal' | 'question' | 'continuity'
  text: string
  conceptIds: string[]
  origin: 'model'
  createdAt: string
}

/** A compact situational view; authoritative evidence always stays in durable records. */
export function tutorStudyContext(
  store: Store,
  vault: Vault,
  study: StudyService,
  conversationId: string,
  query = ''
) {
  const scopes = [vault.scope, `attachments:${conversationId}`]
  const state = study.context(scopes, conversationId)
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []
  const concepts = state.concepts
    .map((concept) => ({
      concept,
      score: words.filter(
        (word) => concept.title.toLowerCase().includes(word) || concept.id === word
      ).length
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ concept }) => ({
      ...concept,
      facets: concept.facets
        ?.slice(0, 6)
        .map((facet) => ({ ...facet, description: facet.description?.slice(0, 250) })),
      sourceIds: concept.sourceIds?.slice(0, 8),
      readiness: concept.readiness
        ? {
            ...concept.readiness,
            rationale: concept.readiness.rationale.slice(0, 500),
            prerequisiteConceptIds: concept.readiness.prerequisiteConceptIds.slice(0, 8),
            cautions: concept.readiness.cautions.slice(0, 4).map((caution) => caution.slice(0, 300))
          }
        : undefined,
      evidence: concept.evidence
        ? {
            ...concept.evidence,
            reasons: concept.evidence.reasons.slice(0, 4).map((reason) => reason.slice(0, 300)),
            uncertainty: concept.evidence.uncertainty
              .slice(0, 4)
              .map((reason) => reason.slice(0, 300)),
            facets: concept.evidence.facets.slice(0, 6).map((facet) => ({
              ...facet,
              families: facet.families.slice(0, 6),
              contexts: facet.contexts.slice(0, 4).map((context) => context.slice(0, 250))
            }))
          }
        : undefined
    }))
  const conceptIds = new Set(concepts.map((concept) => concept.id))
  const view = {
    rubric: state.rubric,
    concepts,
    conceptCoverage: {
      included: concepts.length,
      available: store
        .all<Concept>('concept')
        .filter((concept) => scopes.includes(concept.scope) && !concept.archived).length,
      complete: concepts.length === state.concepts.length
    },
    edges: state.edges
      .filter((edge) => conceptIds.has(edge.fromId) || conceptIds.has(edge.toId))
      .slice(0, 20)
      .map((edge) => ({
        ...edge,
        rationale: edge.rationale.slice(0, 400),
        context: edge.context.slice(0, 300)
      })),
    goals: state.goals.slice(-3).map((goal) => ({
      ...goal,
      description: goal.description.slice(0, 600),
      conceptIds: goal.conceptIds.slice(0, 20)
    })),
    guides: state.guides.slice(-2).map((guide) => ({
      ...guide,
      notes: guide.notes.slice(0, 800),
      questions: guide.questions.slice(0, 6).map((question) => question.slice(0, 300))
    })),
    bits: state.bits.slice(-4).map((bit) => ({ ...bit, text: bit.text.slice(0, 800) })),
    proposals: state.proposals.slice(-8),
    recentWork: state.recentWork.slice(0, 3).map((work) => ({
      ...work,
      answer: work.answer.slice(0, 1200),
      feedback: work.feedback?.slice(0, 1200),
      criterionFeedback: work.criterionFeedback?.slice(0, 6).map((feedback) => ({
        ...feedback,
        feedback: feedback.feedback.slice(0, 400),
        evidence: feedback.evidence?.slice(0, 300)
      }))
    })),
    practice: state.practice.slice(0, 5),
    memory: store
      .all<StudyMemory>('studyMemory')
      .filter((item) => scopes.includes(item.scope))
      .slice(-5)
      .map((item) => ({ ...item, text: item.text.slice(0, 600) })),
    activeHandoff:
      store
        .all<StudyHandoff>('handoff')
        .filter((item) => item.conversationId === conversationId && item.status === 'active')
        .at(-1) || null
  }
  // Keep complete JSON and visible coverage while shrinking older/less relevant context.
  // The tutor can inspect a particular concept or resource through bounded tools.
  while (JSON.stringify(view).length > 18000) {
    if (view.concepts.length > 3) view.concepts.pop()
    else if (view.edges.length) view.edges.pop()
    else if (view.practice.length) view.practice.pop()
    else if (view.guides.length) view.guides.shift()
    else if (view.memory.length) view.memory.shift()
    else if (view.bits.length) view.bits.shift()
    else if (view.recentWork.length > 1) view.recentWork.pop()
    else if (view.proposals.length) view.proposals.shift()
    else if (view.concepts.length > 1) view.concepts.pop()
    else if (view.concepts[0]?.evidence && view.concepts[0].evidence.facets.length > 1)
      view.concepts[0].evidence.facets.pop()
    else if (view.goals.length > 1) view.goals.shift()
    else if (view.recentWork.length) view.recentWork.pop()
    else break
  }
  view.conceptCoverage.included = view.concepts.length
  view.conceptCoverage.complete = view.concepts.length === view.conceptCoverage.available
  return {
    ...view,
    contextBounded: true,
    detailNote:
      'This compact view omits older work and less relevant targets; use get_learning_state or read_source for targeted detail.'
  }
}

/** Vault-scoped study operations; direct writes use the shared conflict/backup boundary. */
export function ecosystemTools(
  store: Store,
  vault: Vault,
  study: StudyService,
  conversationId: string,
  usedSources: Map<string, Source>,
  changed: () => void,
  options: {
    focus?: (handoff: StudyHandoff) => void
    allowHandoff?: boolean
    notes?: NoteEditor
  } = {}
): ToolDefinition[] {
  const scopes = [vault.scope, `attachments:${conversationId}`]
  const concept = (id: string) => {
    const value = store.get<Concept>('concept', id)
    if (!value)
      throw new Error(
        'This concept ID does not exist. Use the stable ID returned by save_concept or get_learning_state; when creating a concept, omit id.'
      )
    if (!scopes.includes(value.scope) || value.archived)
      throw new Error('This concept is outside the current vault or chat, or has been archived.')
    return value
  }
  const citations = (sourceIds: string[] = []) =>
    sourceIds.map((id) => {
      const source = usedSources.get(id)
      if (!source) throw new Error('Citations must use sources actually retrieved or read.')
      return source
    })
  const accessibleItem = <T extends { scope: string }>(kind: string, id: string): T => {
    const value = store.get<T>(kind, id)
    if (!value || !scopes.includes(value.scope))
      throw new Error(`This ${kind} is outside the current study scope.`)
    return value
  }
  const readNotes = new Map<string, { revision: string; text: string }>()
  const tools: ToolDefinition[] = [
    defineTool({
      name: 'save_concept',
      label: 'Connecting a concept',
      description:
        'Create or refine a meaningful concept/facets with known source links. For creation omit id; the result supplies the stable ID to use in later calls and connections. For updates use an existing returned ID. Reuse existing concepts. This cannot change the learner’s tag.',
      parameters: Type.Object({
        id: Type.Optional(
          Type.String({
            description: 'Existing concept ID returned by the app. Omit when creating a concept.'
          })
        ),
        title: Type.String({ minLength: 1, maxLength: 200 }),
        description: Type.Optional(Type.String({ maxLength: 4000 })),
        aliases: Type.Optional(Type.Array(Type.String(), { maxItems: 15 })),
        sourceIds: ids(),
        facets: Type.Optional(
          Type.Array(
            Type.Object({
              id: Type.String(),
              title: Type.String(),
              description: Type.Optional(Type.String({ maxLength: 2000 }))
            }),
            { maxItems: 20 }
          )
        )
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const sources = citations(params.sourceIds)
        // Models sometimes invent a slug for a new concept. Only saved IDs identify
        // updates; an existing inaccessible ID must still fail the scope check.
        const stored = params.id ? store.get<Concept>('concept', params.id) : null
        let existing = stored ? concept(stored.id) : null
        const scope = existing?.scope || sources[0]?.scope || vault.scope
        if (!scopes.includes(scope) || sources.some((source) => source.scope !== scope))
          throw new Error('A concept’s supplied source links must belong to its study scope.')
        if (!existing) {
          const title = params.title.trim().toLocaleLowerCase()
          const matches = store
            .all<Concept>('concept')
            .filter(
              (value) =>
                value.scope === scope &&
                !value.archived &&
                value.title.trim().toLocaleLowerCase() === title
            )
          if (matches.length > 1)
            throw new Error(
              'Several concepts have this title. Use get_learning_state to choose an existing concept ID.'
            )
          existing = matches[0] || null
        }
        const value = study.saveConcept(
          scope,
          { ...params, id: existing?.id, path: sources[0]?.path, anchor: sources[0]?.anchor },
          'model'
        )
        changed()
        return result(value)
      }
    }),
    defineTool({
      name: 'connect_concepts',
      label: 'Proposing a connection',
      description:
        'Propose a typed relationship with a rationale and actual source links. A connection is content structure, not evidence that the learner understands it. The learner can accept or correct the proposed edge.',
      parameters: Type.Object({
        fromId: Type.String(),
        toId: Type.String(),
        relation: Type.Union([
          Type.Literal('part-of'),
          Type.Literal('prerequisite'),
          Type.Literal('explains'),
          Type.Literal('applies-to'),
          Type.Literal('contrasts-with'),
          Type.Literal('analogous-to')
        ]),
        rationale: Type.String({ minLength: 1, maxLength: 4000 }),
        context: Type.Optional(Type.String({ maxLength: 2000 })),
        sourceIds: ids()
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const from = concept(params.fromId),
          to = concept(params.toId)
        citations(params.sourceIds)
        const existing = store
          .all<ConceptEdge>('edge')
          .find(
            (edge) =>
              scopes.includes(edge.scope) &&
              edge.fromId === from.id &&
              edge.toId === to.id &&
              edge.relation === params.relation &&
              edge.status !== 'rejected'
          )
        if (existing)
          return result({
            existing,
            note: 'This relationship already exists; no duplicate was created.'
          })
        const value = study.saveEdge(vault.scope, params, 'model', scopes)
        changed()
        return result(value)
      }
    }),
    defineTool({
      name: 'save_study_goal',
      label: 'Keeping your goal',
      description:
        'Record a concise goal and desired depth grounded in the learner’s request. Orientation is a valid scope. This is not a required plan or a mastery change.',
      parameters: Type.Object({
        id: Type.Optional(Type.String()),
        title: Type.String({ maxLength: 200 }),
        description: Type.Optional(Type.String({ maxLength: 4000 })),
        conceptIds: ids(),
        desiredLevel: Type.Optional(Type.Union([level(), Type.Null()])),
        depth: Type.Optional(
          Type.Union([Type.Literal('orientation'), Type.Literal('working'), Type.Literal('deep')])
        )
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const value = study.saveGoal(vault.scope, conversationId, params)
        changed()
        return result(value)
      }
    }),
    defineTool({
      name: 'save_study_guide',
      label: 'Preparing an orientation',
      description:
        'Save a small editable orientation: useful questions, source links, concepts, and existing practice. Notes contain navigation/context, never a complete generated learning note. No required sequence.',
      parameters: Type.Object({
        id: Type.Optional(Type.String()),
        title: Type.String({ maxLength: 200 }),
        goalId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        conceptIds: ids(),
        sourceIds: ids(),
        exerciseIds: ids(),
        cardIds: ids(),
        questions: Type.Optional(Type.Array(Type.String({ maxLength: 2000 }), { maxItems: 15 })),
        notes: Type.Optional(Type.String({ maxLength: 4000 }))
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        citations(params.sourceIds)
        const value = study.saveGuide(vault.scope, conversationId, params)
        changed()
        return result(value)
      }
    }),
    defineTool({
      name: 'find_practice',
      label: 'Finding suitable practice',
      description:
        'Find stored exercises prioritized for revisiting and current evidence/readiness. Returns prompts and criteria, never hidden hints or solutions. Include advanced work only for an explicitly requested challenge.',
      parameters: Type.Object({
        conceptId: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
        includeAdvanced: Type.Optional(Type.Boolean())
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        return result(
          study.practice(scopes, params).map((exercise) => {
            exercise.sources.forEach((source) =>
              usedSources.set(source.id, {
                ...source,
                historical: source.historical || !store.source(source.id)
              })
            )
            return {
              id: exercise.id,
              title: exercise.title,
              prompt: exercise.prompt,
              kind: exercise.kind,
              conceptId: exercise.conceptId,
              rubric: exercise.rubric,
              taskFamily: exercise.taskFamily,
              context: exercise.context,
              dueAt: exercise.dueAt,
              format: exercise.format,
              choices: exercise.choices,
              sources: exercise.sources.map((source) => ({
                id: source.id,
                title: source.title,
                revision: source.revision
              }))
            }
          })
        )
      }
    }),
    defineTool({
      name: 'capture_bit',
      label: 'Saving a bit',
      description:
        'Save a small learner contribution, exact source quotation, or clearly labeled model suggestion to the durable inbox or selected concepts. Do not generate extra artifacts automatically.',
      parameters: Type.Object({
        text: Type.String({ minLength: 1, maxLength: 12000 }),
        origin: Type.Union([
          Type.Literal('learner'),
          Type.Literal('quotation'),
          Type.Literal('model')
        ]),
        conceptIds: ids(),
        sourceId: Type.Optional(Type.Union([Type.String(), Type.Null()]))
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const source = params.sourceId ? citations([params.sourceId])[0] : null
        if (params.origin === 'learner') {
          const contributions = [
            ...store
              .all<Message>('message')
              .filter(
                (message) => message.conversationId === conversationId && message.role === 'user'
              )
              .slice(-6)
              .map((message) => message.text),
            ...store
              .all<Attempt>('attempt')
              .filter((attempt) => {
                const exercise = store.get<Exercise>('exercise', attempt.exerciseId)
                return exercise && scopes.includes(exercise.scope)
              })
              .slice(-20)
              .map((attempt) => attempt.answer),
            ...store
              .all<StudyBit>('bit')
              .filter((bit) => scopes.includes(bit.scope) && bit.origin === 'learner')
              .slice(-30)
              .map((bit) => bit.text)
          ]
          if (!contributions.some((text) => text.includes(params.text)))
            throw new Error(
              'Learner-origin bits must preserve actual learner words. Label rewritten additions as model suggestions.'
            )
        }
        if (params.origin === 'quotation' && (!source || !source.text.includes(params.text)))
          throw new Error('A quotation must exactly match its retrieved source passage.')
        const transferred = source && !scopes.includes(source.scope)
        const saved = study.captureBit(
          vault.scope,
          conversationId,
          transferred ? { ...params, origin: 'model', sourceId: null } : params
        )
        // An explicitly shared source snapshot may be retained; it grants no other-tab retrieval.
        const value = transferred
          ? store.put('bit', { ...saved, origin: params.origin, source })
          : saved
        changed()
        return result(value)
      }
    }),
    defineTool({
      name: 'read_note',
      label: 'Checking the current note',
      description:
        'Read a current Markdown note by vault-relative path or already-retrieved source ID. Returns its revision and bounded text for edit_note or a reviewed proposal. Paths stay within the connected vault; current content is separate from saved citation evidence.',
      parameters: Type.Object({
        sourceId: Type.Optional(Type.String()),
        path: Type.Optional(Type.String({ maxLength: 2000 }))
      }),
      async execute(_id, { sourceId, path: notePath }, signal) {
        signal?.throwIfAborted()
        if (!sourceId && notePath && options.notes) {
          const target = await options.notes.target(notePath)
          if (!target.exists)
            throw new Error('This note does not exist. Use create_note to start it.')
          if (target.text.length > 2 * 1024 * 1024)
            throw new Error('This note is too large to read in the study tools.')
          const revision = hash(target.text)
          readNotes.set(notePath, { revision, text: target.text })
          return result({
            path: notePath,
            revision,
            text: target.text.slice(0, 24000),
            truncated: target.text.length > 24000
          })
        }
        if (!sourceId)
          throw new Error('Provide a retrieved source ID or a vault-relative note path.')
        const source = citations([sourceId])[0]
        const root = store.settings.vaultPath
        if (!root || source.scope !== vault.scope || source.kind !== 'markdown')
          throw new Error('Choose a retrieved Markdown note from the connected vault.')
        const file = await containedFile(root, source.path)
        const document = await readSourceDocument(source, file)
        signal?.throwIfAborted()
        readNotes.set(source.path, { revision: document.revision, text: document.text })
        return result({
          path: source.path,
          revision: document.revision,
          text: document.text.slice(0, 24000),
          truncated: document.text.length > 24000,
          savedSourceId: source.id,
          sourceChanged: document.revision !== source.revision,
          note: 'Current note text is separate from saved citation evidence; do not cite changed prose with an older source ID.'
        })
      }
    }),
    ...(options.notes
      ? [
          defineTool({
            name: 'create_note',
            label: 'Creating a note',
            description:
              'Create a new Markdown note in the connected vault, with an optional new folder. Saves directly, keeps model authorship in the change history, and supports undo. Existing files are never overwritten. Use requested content, learner work and cited sources without implying independent understanding.',
            executionMode: 'sequential',
            parameters: Type.Object({
              path: Type.String({ maxLength: 2000 }),
              content: Type.String({ minLength: 1, maxLength: 60000 }),
              rationale: Type.String({ minLength: 1, maxLength: 4000 })
            }),
            async execute(_id, params, signal) {
              const value = z
                .object({
                  path: z.string().min(1).max(2000),
                  content: z.string().min(1).max(60000),
                  rationale: z.string().min(1).max(4000)
                })
                .parse(params)
              signal?.throwIfAborted()
              await options.notes!.createFolders(value.path)
              const target = await options.notes!.target(value.path)
              if (target.exists)
                throw new Error('This note already exists. Read it and use edit_note.')
              const proposal = study.proposeNote(vault.scope, conversationId, {
                path: value.path,
                after: value.content,
                rationale: value.rationale,
                expectedRevision: '',
                operation: 'append',
                origin: 'model',
                bitIds: [],
                conceptIds: []
              })
              signal?.throwIfAborted()
              const applied = await options.notes!.applyModel(proposal, signal)
              changed()
              return result({
                path: value.path,
                saved: true,
                changeId: proposal.id,
                undoAvailable: true,
                warning: applied.warning,
                origin: 'model'
              })
            }
          }),
          defineTool({
            name: 'edit_note',
            label: 'Editing a note',
            description:
              'Directly append to or replace an exact unique passage in a current Markdown note. First call read_note in this turn and pass its revision. Saves with conflict protection, a backup and undo; records model authorship. Does not change learner rank tags or grant file access outside the vault.',
            executionMode: 'sequential',
            parameters: Type.Object({
              path: Type.String({ maxLength: 2000 }),
              expectedRevision: Type.String(),
              operation: Type.Union([Type.Literal('append'), Type.Literal('replace')]),
              before: Type.Optional(Type.String({ maxLength: 60000 })),
              after: Type.String({ minLength: 1, maxLength: 60000 }),
              rationale: Type.String({ minLength: 1, maxLength: 4000 })
            }),
            async execute(_id, params, signal) {
              const value = z
                .object({
                  path: z.string().min(1).max(2000),
                  expectedRevision: z.string().min(1).max(200),
                  operation: z.enum(['append', 'replace']),
                  before: z.string().max(60000).optional(),
                  after: z.string().min(1).max(60000),
                  rationale: z.string().min(1).max(4000)
                })
                .parse(params)
              const read = readNotes.get(value.path)
              if (!read || read.revision !== value.expectedRevision)
                throw new Error('Read the current note with read_note before editing it.')
              signal?.throwIfAborted()
              const proposal = study.proposeNote(vault.scope, conversationId, {
                ...value,
                origin: 'model',
                bitIds: [],
                conceptIds: []
              })
              const applied = await options.notes!.applyModel(proposal, signal)
              readNotes.delete(value.path)
              changed()
              return result({
                path: value.path,
                saved: true,
                changeId: proposal.id,
                undoAvailable: true,
                warning: applied.warning,
                origin: 'model'
              })
            }
          })
        ]
      : []),
    defineTool({
      name: 'propose_note_change',
      label: 'Collecting a note improvement',
      description:
        'Collect an exact append/replacement for grouped learner review. Existing notes must first be read using read_note in this turn. This never applies edits. Base changes on actual learner work or source quotations; preserve authorship.',
      parameters: Type.Object({
        path: Type.String(),
        anchor: Type.Optional(Type.String()),
        expectedRevision: Type.String(),
        operation: Type.Union([Type.Literal('append'), Type.Literal('replace')]),
        before: Type.Optional(Type.String({ maxLength: 12000 })),
        after: Type.String({ minLength: 1, maxLength: 12000 }),
        rationale: Type.String({ minLength: 1, maxLength: 4000 }),
        conceptIds: ids(),
        bitIds: ids()
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const read = readNotes.get(params.path)
        if (!read || read.revision !== params.expectedRevision) {
          // A first note can start from actual captured learner work, never a generated topic summary.
          const bits = (params.bitIds || []).map((id) => accessibleItem<StudyBit>('bit', id))
          if (
            params.expectedRevision ||
            params.operation !== 'append' ||
            !bits.length ||
            bits.some(
              (bit) =>
                bit.conversationId !== conversationId ||
                bit.origin === 'model' ||
                !params.after.includes(bit.text)
            )
          )
            throw new Error(
              'Read the existing note with read_note before proposing changes to its current revision. A new note needs exact learner/quotation bits.'
            )
          const learnerTextSize = bits.reduce((length, bit) => length + bit.text.length, 0)
          if (params.after.length > learnerTextSize + 2000)
            throw new Error(
              'Build a new note from the learner’s captured work; keep suggested additions bounded.'
            )
        }
        if (
          params.operation === 'replace' &&
          (!params.before || !read?.text.includes(params.before))
        )
          throw new Error('A replacement must contain an exact piece of the current note.')
        const value = study.proposeNote(vault.scope, conversationId, { ...params, origin: 'model' })
        changed()
        return result({
          id: value.id,
          status: value.status,
          path: value.path,
          operation: value.operation,
          note: 'Saved as pending; the learner reviews proposed changes together.'
        })
      }
    }),
    defineTool({
      name: 'remember_study',
      label: 'Keeping a continuity note',
      description:
        'Remember one concise goal, unresolved question, or continuity fact grounded in this exchange. Model-origin memory remains provisional; no mastery conclusions, credentials, private source dumps, or invented traits.',
      parameters: Type.Object({
        kind: Type.Union([
          Type.Literal('goal'),
          Type.Literal('question'),
          Type.Literal('continuity')
        ]),
        text: Type.String({ minLength: 1, maxLength: 1500 }),
        conceptIds: ids()
      }),
      async execute(_id, params, signal) {
        signal?.throwIfAborted()
        const parsed = z
          .object({
            kind: z.enum(['goal', 'question', 'continuity']),
            text: z.string().trim().min(1).max(1500),
            conceptIds: z.array(z.string()).max(30).default([])
          })
          .parse(params)
        parsed.conceptIds.forEach(concept)
        const duplicate = store
          .all<StudyMemory>('studyMemory')
          .find(
            (item) =>
              item.scope === vault.scope && item.kind === parsed.kind && item.text === parsed.text
          )
        if (duplicate)
          return result({ id: duplicate.id, recorded: false, note: 'Already remembered.' })
        const value: StudyMemory = {
          ...parsed,
          id: randomUUID(),
          scope: vault.scope,
          conversationId,
          origin: 'model',
          createdAt: new Date().toISOString()
        }
        store.put('studyMemory', value)
        changed()
        return result(value)
      }
    })
  ]
  if (options.allowHandoff !== false)
    tools.push(
      defineTool({
        name: 'focus_study',
        label: 'Opening the study desk',
        description:
          'Open saved cards, one exercise, one guide, or an exact source passage in the right study desk. The learner completes or dismisses it; completion can return to the main chat once. No private answers are shown.',
        parameters: Type.Object({
          kind: Type.Union([
            Type.Literal('cards'),
            Type.Literal('exercise'),
            Type.Literal('source'),
            Type.Literal('guide')
          ]),
          itemIds: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
          sourceId: Type.Optional(Type.String()),
          quote: Type.Optional(Type.String({ maxLength: 2000 })),
          reason: Type.String({ minLength: 1, maxLength: 1500 })
        }),
        async execute(_id, params, signal) {
          signal?.throwIfAborted()
          const checked = z
            .object({
              kind: z.enum(['cards', 'exercise', 'source', 'guide']),
              itemIds: z.array(z.string()).max(20).default([]),
              sourceId: z.string().optional(),
              quote: z.string().max(2000).optional(),
              reason: z.string().min(1).max(1500)
            })
            .parse(params)
          if (checked.kind === 'source') {
            if (!checked.sourceId) throw new Error('A source handoff needs a retrieved source ID.')
            const source = citations([checked.sourceId])[0]
            if (checked.quote && !source.text.includes(checked.quote))
              throw new Error('The highlighted quote must occur in the cited passage.')
          } else {
            if (
              !checked.itemIds.length ||
              (checked.kind !== 'cards' && checked.itemIds.length !== 1)
            )
              throw new Error('Select cards or exactly one exercise/guide for this handoff.')
            for (const id of checked.itemIds) {
              if (checked.kind === 'cards') {
                if (accessibleItem<Flashcard>('card', id).suspended)
                  throw new Error('An archived card cannot be opened for review.')
              } else if (checked.kind === 'exercise') accessibleItem<Exercise>('exercise', id)
              else accessibleItem<StudyGuide>('guide', id)
            }
          }
          const existing = store
            .all<StudyHandoff>('handoff')
            .find((item) => item.conversationId === conversationId && item.status === 'active')
          if (existing)
            throw new Error(
              'A study activity is already active. Await its completion or dismissal.'
            )
          const handoff: StudyHandoff = {
            ...checked,
            id: randomUUID(),
            conversationId,
            status: 'active',
            createdAt: new Date().toISOString()
          }
          store.put('handoff', handoff)
          options.focus?.(handoff)
          changed()
          return result({ id: handoff.id, opened: true, awaitingLearner: true })
        }
      })
    )
  return tools
}
