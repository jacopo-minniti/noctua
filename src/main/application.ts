import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type {
  Attempt,
  Concept,
  Conversation,
  Event,
  Exercise,
  ExerciseProgress,
  Flashcard,
  Message,
  Request,
  Settings,
  Snapshot,
  Source,
  SourceHighlight,
  StudyHandoff,
  NoteProposal
} from '../shared/types'
import { contextWindow, enrichReferenceContext, resolveChatReferences } from './chat-context'
import { levels } from '../shared/types'
import { cardRows, maxCardCsvLength } from '../shared/card-csv'
import {
  cardVersion,
  learningConcepts,
  newSchedule,
  reviewCard,
  exerciseVersion,
  updatePracticeSchedule
} from './learning'
import { StudyService, checkExerciseAnswer } from './study'
import { NoteEditor } from './note-writing'
import { importWebResource } from './web-import'
import { ProviderSignIn } from './provider-login'
import { Keys, PiHarness, type SecretCodec } from './pi'
import { Store } from './store'
import { validProfilePicture } from './profile'
import { obsidianSourceUri, readSourceDocument } from './source-reading'
import { containedFile, hash, tagPatch, Vault, vaultScope, writeTag } from './vault'

const id = z.string().min(1).max(200)
const localUrl = z
  .string()
  .url()
  .refine(
    (value) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname) &&
      ['http:', 'https:'].includes(new URL(value).protocol),
    'Use a local Ollama or LM Studio URL.'
  )
const settingsSchema = z.object({
  profile: z
    .object({
      name: z.string().max(100),
      about: z.string().max(6000),
      instructions: z.string().max(6000),
      picture: z
        .string()
        .max(350000)
        .refine(validProfilePicture, 'Choose a PNG, JPEG, or WebP profile photo.')
        .optional()
    })
    .optional(),
  vaultPath: z.string().nullable(),
  modelKey: z.string().max(250),
  reasoningEffort: z
    .enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    .default('off'),
  usePiCredentials: z.boolean(),
  localBaseUrl: localUrl,
  localModelIds: z.array(z.string().min(1).max(250)).max(30),
  embeddings: z.object({
    enabled: z.boolean(),
    baseUrl: localUrl,
    model: z.string().min(1).max(250)
  }),
  openaiAuthMode: z.enum(['api', 'subscription']).optional(),
  apiProvider: z.enum(['anthropic', 'openai', 'google', 'openrouter', 'xai', 'mistral', 'groq']),
  roleModels: z
    .object({
      organizer: z.string().max(250).optional(),
      evaluator: z.string().max(250).optional(),
      chatTitle: z.string().max(250).optional()
    })
    .optional(),
  webSearch: z.object({ enabled: z.boolean(), provider: z.string().max(100).optional() }).optional()
})
const sourceSchema = z.object({ id }).passthrough()
const referenceSchema = z.object({
  id,
  text: z.string().min(1).max(8000),
  label: z.string().max(300),
  sourceId: id.optional(),
  cardId: id.optional(),
  exerciseId: id.optional(),
  conceptId: id.optional(),
  messageId: id.optional(),
  revision: z.string().max(200).optional(),
  page: z.number().int().positive().optional(),
  sourceLine: z.number().int().positive().optional(),
  side: z.enum(['front', 'back', 'prompt']).optional(),
  view: z.enum(['document', 'passage']).optional()
})
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot') }),
  z.object({
    action: z.literal('resolveSources'),
    conversationId: id,
    sourceIds: z.array(id).max(40)
  }),
  z.object({
    action: z.literal('addChatReference'),
    conversationId: id,
    reference: referenceSchema
  }),
  z.object({ action: z.literal('newChat'), parentId: id.optional() }),
  z.object({ action: z.literal('forkMessage'), messageId: id }),
  z.object({
    action: z.literal('updateTab'),
    conversationId: id,
    closed: z.boolean().optional(),
    hasDraft: z.boolean().optional(),
    title: z.string().trim().min(1).max(100).optional()
  }),
  z.object({ action: z.literal('providerLoginReply'), text: z.string().min(1).max(6000) }),
  ...[
    'providerLogin',
    'providerLoginCancel',
    'providerLogout',
    'models',
    'chooseVault',
    'index',
    'clearVaultCache',
    'stop',
    'export'
  ].map((action) => z.object({ action: z.literal(action) })),
  z.object({
    action: z.literal('settings'),
    settings: settingsSchema,
    apiKey: z.string().max(5000).optional(),
    clearProviderKey: z.string().max(100).optional()
  }),
  ...['messages', 'deleteChat'].map((action) =>
    z.object({ action: z.literal(action), conversationId: id })
  ),
  z.object({
    action: z.literal('attach'),
    conversationId: id,
    paths: z.array(z.string().min(1).max(4096)).min(1).max(10).optional()
  }),
  z.object({ action: z.literal('search'), query: z.string().min(1).max(3000), conversationId: id }),
  z.object({ action: z.literal('document'), path: z.string().min(1).max(2000) }),
  z.object({
    action: z.literal('openLink'),
    url: z
      .string()
      .url()
      .max(3000)
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
  }),
  ...['source', 'sourceDocument', 'sourceBytes', 'openOriginal'].map((action) =>
    z.object({ action: z.literal(action), source: sourceSchema })
  ),
  ...['sourceAsset', 'sourceLink'].map((action) =>
    z.object({
      action: z.literal(action),
      source: sourceSchema,
      reference: z.string().min(1).max(2000)
    })
  ),
  z.object({
    action: z.literal('send'),
    conversationId: id,
    text: z
      .string()
      .min(1)
      .max(30000)
      .refine((value) => !!value.trim(), 'Write a message first.'),
    sourceIds: z.array(id).max(12),
    activity: z.enum(['flashcards', 'exercises']).optional(),
    references: z.array(referenceSchema).max(12).optional()
  }),
  z.object({
    action: z.literal('review'),
    cardId: id,
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    expectedReps: z.number().int().min(0)
  }),
  z.object({
    action: z.literal('saveCard'),
    front: z.string().trim().min(1).max(6000),
    back: z.string().trim().min(1).max(12000),
    conceptId: id.nullable(),
    conversationId: id,
    cardId: id.optional()
  }),
  z.object({ action: z.literal('deleteCard'), cardId: id }),
  z.object({
    action: z.literal('importCards'),
    conversationId: id,
    text: z.string().max(maxCardCsvLength),
    fileName: z.string().trim().min(1).max(255),
    options: z.object({
      separator: z.string().length(1),
      header: z.boolean(),
      frontColumn: z.number().int().min(0).max(99),
      backColumn: z.number().int().min(0).max(99)
    }),
    conceptId: id.nullable(),
    skipDuplicates: z.boolean()
  }),
  z.object({
    action: z.literal('archiveCards'),
    cardIds: z.array(id).min(1).max(10000),
    suspended: z.boolean()
  }),
  z.object({
    action: z.literal('answer'),
    exerciseId: id,
    answer: z.string().trim().min(1).max(30000),
    assistance: z.number().int().min(0).max(100),
    solutionSeen: z.boolean(),
    gradeWithModel: z.boolean(),
    conditions: z
      .object({ resourcesUsed: z.boolean(), helpDescription: z.string().max(3000) })
      .optional()
  }),
  z.object({
    action: z.literal('exerciseHelp'),
    exerciseId: id,
    kind: z.enum(['hint', 'solution', 'draft']),
    draft: z.string().max(30000).optional()
  }),
  z.object({
    action: z.literal('assessAttempt'),
    attemptId: id,
    outcome: z.enum(['correct', 'partial', 'incorrect', 'ungraded'])
  }),
  z.object({ action: z.literal('level'), conceptId: id, level: z.enum(levels) }),
  z.object({ action: z.literal('previewTag'), conceptId: id }),
  z.object({
    action: z.literal('writeTag'),
    conceptId: id,
    expectedRevision: z.string().length(64)
  }),
  z.object({
    action: z.literal('saveConcept'),
    concept: z.object({
      id: id.optional(),
      title: z.string().trim().min(1).max(300),
      description: z.string().max(6000).optional(),
      aliases: z.array(z.string().max(300)).max(50).optional(),
      path: z.string().max(2000).optional(),
      anchor: z.string().max(500).optional(),
      sourceIds: z.array(id).max(30).optional(),
      desiredLevel: z.enum(levels).nullable().optional(),
      facets: z
        .array(
          z.object({
            id,
            title: z.string().min(1).max(300),
            description: z.string().max(3000).optional(),
            desiredLevel: z.enum(levels).optional()
          })
        )
        .max(40)
        .optional()
    })
  }),
  z.object({
    action: z.literal('saveEdge'),
    edge: z.object({
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
      rationale: z.string().min(1).max(3000),
      context: z.string().max(3000).optional()
    })
  }),
  z.object({
    action: z.literal('decideEdge'),
    edgeId: id,
    status: z.enum(['accepted', 'rejected'])
  }),
  z.object({
    action: z.literal('saveGoal'),
    conversationId: id,
    goal: z.object({
      id: id.optional(),
      title: z.string().min(1).max(300),
      description: z.string().max(6000).optional(),
      conceptIds: z.array(id).max(40).optional(),
      desiredLevel: z.enum(levels).nullable().optional(),
      depth: z.enum(['orientation', 'working', 'deep']).optional(),
      status: z.enum(['active', 'paused', 'done']).optional()
    })
  }),
  z.object({
    action: z.literal('saveGuide'),
    conversationId: id,
    guide: z.object({
      id: id.optional(),
      title: z.string().min(1).max(300),
      goalId: id.nullable().optional(),
      conceptIds: z.array(id).max(40).optional(),
      questions: z.array(z.string().max(3000)).max(30).optional(),
      sourceIds: z.array(id).max(40).optional(),
      exerciseIds: z.array(id).max(40).optional(),
      cardIds: z.array(id).max(40).optional(),
      notes: z.string().max(12000).optional()
    })
  }),
  z.object({
    action: z.literal('captureBit'),
    conversationId: id,
    text: z.string().trim().min(1).max(12000),
    origin: z.enum(['learner', 'quotation', 'model']).optional(),
    conceptIds: z.array(id).max(30).optional(),
    sourceId: id.optional()
  }),
  z.object({
    action: z.literal('updateBit'),
    bitId: id,
    text: z.string().trim().min(1).max(12000).optional(),
    conceptIds: z.array(id).max(30).optional(),
    status: z.enum(['inbox', 'linked', 'proposed', 'placed']).optional()
  }),
  z.object({
    action: z.literal('proposeNote'),
    conversationId: id,
    proposal: z.object({
      id: id.optional(),
      path: z.string().min(1).max(2000),
      after: z.string().min(1).max(30000),
      rationale: z.string().min(1).max(3000),
      anchor: z.string().max(500).optional(),
      expectedRevision: z.string().max(64).optional(),
      operation: z.enum(['append', 'replace']).optional(),
      before: z.string().max(30000).optional(),
      conceptIds: z.array(id).max(40).optional(),
      bitIds: z.array(id).max(40).optional()
    })
  }),
  z.object({
    action: z.literal('reviewNotes'),
    proposalIds: z.array(id).min(1).max(50),
    decision: z.enum(['accept', 'reject'])
  }),
  z.object({ action: z.literal('undoNote'), proposalId: id }),
  z.object({
    action: z.literal('suggestPlacement'),
    conversationId: id,
    text: z.string().min(1).max(12000)
  }),
  z.object({
    action: z.literal('saveExercise'),
    conversationId: id,
    exercise: z.object({
      id: id.optional(),
      title: z.string().min(1).max(300),
      prompt: z.string().min(1).max(16000),
      kind: z.enum(['knowledge', 'comprehension', 'application', 'transfer']),
      solution: z.string().max(16000),
      criteria: z.array(z.string().max(3000)).max(30),
      hints: z.array(z.string().max(3000)).max(20).optional(),
      conceptId: id.nullable().optional(),
      format: z.enum(['open', 'short-answer', 'multiple-choice', 'numeric']).optional(),
      choices: z.array(z.string().max(3000)).max(12).optional(),
      answerKey: z.string().max(3000).optional(),
      tolerance: z.number().min(0).optional(),
      taskFamily: z.string().max(300).optional(),
      context: z.string().max(3000).optional(),
      transferDescription: z.string().max(3000).optional(),
      rubric: z
        .array(
          z.object({
            id,
            title: z.string().max(300),
            description: z.string().max(3000).optional(),
            level: z.enum(['knowledge', 'comprehension', 'application', 'transfer']),
            conceptId: id.optional(),
            facetId: id.optional(),
            edgeId: id.optional(),
            essential: z.boolean().optional()
          })
        )
        .max(30)
        .optional()
    })
  }),
  z.object({
    action: z.literal('exerciseAdvice'),
    conversationId: id,
    exerciseId: id,
    answer: z.string().max(30000)
  }),
  z.object({
    action: z.literal('updateStudy'),
    conversationId: id,
    studyMode: z.enum(['free', 'guided']).optional(),
    buildNotes: z.boolean().optional(),
    goalId: id.nullable().optional()
  }),
  z.object({
    action: z.literal('completeHandoff'),
    handoffId: id,
    resume: z.boolean().optional(),
    itemId: id.optional()
  }),
  z.object({
    action: z.literal('highlight'),
    sourceId: id,
    revision: z.string().length(64),
    quote: z.string().trim().min(1).max(8000),
    page: z.number().int().positive().optional(),
    rects: z
      .array(
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0).max(1),
          height: z.number().min(0).max(1)
        })
      )
      .max(100)
      .optional()
  }),
  z.object({ action: z.literal('deleteHighlight'), highlightId: id }),
  z.object({
    action: z.literal('importWeb'),
    conversationId: id,
    url: z.string().url().max(3000),
    title: z.string().max(300).optional()
  })
])

export interface Host {
  chooseDirectory(): Promise<string | null>
  chooseFiles(): Promise<string[]>
  chooseExport(): Promise<string | null>
  openFile(file: string): Promise<void>
  openLink(url: string): Promise<void>
}
export class Application {
  readonly providerSignIn: ProviderSignIn
  readonly store: Store
  readonly vault: Vault
  readonly keys: Keys
  readonly pi: PiHarness
  readonly study: StudyService
  readonly notes: NoteEditor
  private closing = false
  private closeWork: Promise<void> | null = null
  private pending = new Set<Promise<unknown>>()
  constructor(
    readonly dataDir: string,
    readonly host: Host,
    readonly emit: (event: Event) => void,
    codec: SecretCodec
  ) {
    this.store = new Store(path.join(dataDir, 'noctua.sqlite'))
    this.vault = new Vault(this.store, (status) => emit({ type: 'index', status }))
    this.study = new StudyService(this.store)
    this.notes = new NoteEditor(this.store, this.vault, dataDir)
    this.keys = new Keys(this.store, codec)
    this.pi = new PiHarness(this.store, this.vault, this.keys, dataDir, emit)
    this.providerSignIn = new ProviderSignIn(
      () => emit({ type: 'changed' }),
      (url) => this.host.openLink(url)
    )
  }
  async initialize(): Promise<void> {
    await this.track(
      this.pi.configure(true).then(() => {
        if (!this.closing) this.vault.watch()
      })
    )
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work)
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work)
    )
    return work
  }
  snapshot(): Snapshot {
    const exercises = this.store.all<Exercise>('exercise')
    const exerciseProgress = Object.fromEntries(
      exercises.map((exercise) => [exercise.id, this.progress(exercise.id)])
    )
    const documents = this.store.db
      .prepare(
        'SELECT d.path,d.title,d.kind,COUNT(c.id) AS chunks FROM documents d LEFT JOIN chunks c ON d.scope=c.scope AND d.path=c.path WHERE d.scope=? GROUP BY d.path'
      )
      .all(this.vault.scope)
      .map((row) => ({
        path: row.path as string,
        title: row.title as string,
        kind: row.kind as Source['kind'],
        chunks: Number(row.chunks)
      }))
    const conversations = this.store
      .all<Conversation>('conversation')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const attachments = Object.fromEntries(
      conversations.map((chat) => {
        const seen = new Set<string>()
        return [
          chat.id,
          this.store.chunks([`attachments:${chat.id}`]).filter((source) => {
            if (seen.has(source.path)) return false
            seen.add(source.path)
            return true
          })
        ]
      })
    )
    const concepts = [
      this.vault.scope,
      ...conversations.map((chat) => `attachments:${chat.id}`)
    ].flatMap((scope) => learningConcepts(this.store, scope))
    return {
      vaultScope: this.vault.scope,
      settings: this.store.settings,
      providerLogin: this.providerSignIn.state,
      subscriptionConnected: this.pi.subscriptionConnected,
      keyProviders: Object.keys(this.keys.values()),
      models: this.pi.models,
      modelDiscoveryStatus: this.pi.modelDiscoveryStatus,
      conversations,
      cards: this.store.all<Flashcard>('card').filter((card) => !card.suspended),
      exercises,
      attempts: this.store.all<Attempt>('attempt'),
      exerciseProgress,
      concepts,
      edges: this.store
        .all<{ id: string; scope: string }>('edge')
        .filter((r) => r.scope === this.vault.scope) as Snapshot['edges'],
      goals: this.store
        .all<{ id: string; scope: string }>('goal')
        .filter((r) => r.scope === this.vault.scope) as Snapshot['goals'],
      guides: this.store
        .all<{ id: string; scope: string }>('guide')
        .filter((r) => r.scope === this.vault.scope) as Snapshot['guides'],
      bits: this.store
        .all<{ id: string; scope: string }>('bit')
        .filter((r) => r.scope === this.vault.scope) as Snapshot['bits'],
      noteProposals: this.store
        .all<{ id: string; scope: string }>('noteProposal')
        .filter((r) => r.scope === this.vault.scope) as Snapshot['noteProposals'],
      handoffs: this.store.all('handoff'),
      highlights: this.store.all('highlight'),
      practiceSchedules: this.store.all('practice'),
      attachments,
      documents,
      index: this.vault.status,
      dataPath: this.dataDir
    }
  }
  progress(exerciseId: string): ExerciseProgress {
    return this.store.meta(`exercise-progress:${exerciseId}`, {
      draft: '',
      hintsShown: 0,
      solutionSeen: false
    })
  }
  private required<T>(kind: string, id: string): T {
    const record = this.store.get<T>(kind, id)
    if (!record) throw new Error('This item no longer exists.')
    return record
  }
  private source(id: string): Source {
    const cached = this.store.resolveSource(id)
    if (cached) return cached
    throw new Error('This source reference cannot be resolved.')
  }
  private async fileForSource(source: Source): Promise<string> {
    if (source.scope.startsWith('vault:')) {
      const roots = this.store.meta<Record<string, string>>('vault-roots', {})
      const root = roots[source.scope]
      if (!root) throw new Error('The original vault is no longer connected.')
      return containedFile(root, this.vault.pathForSource(source))
    }
    if (source.scope.startsWith('attachments:')) {
      const file = this.store.meta<string | null>(
        `attachment-file:${source.scope}:${source.path}`,
        null
      )
      if (!file) throw new Error('The original attachment is unavailable.')
      return containedFile(
        path.join(this.dataDir, 'resources'),
        path.relative(path.join(this.dataDir, 'resources'), file)
      )
    }
    throw new Error('This source has no original file.')
  }
  request(raw: unknown): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error('Noctua is closing.'))
    return this.track(this.handleRequest(raw))
  }
  private async handleRequest(raw: unknown): Promise<unknown> {
    const input = requestSchema.parse(raw) as Request
    if (this.providerSignIn.active && input.action === 'answer' && input.gradeWithModel)
      throw new Error('Finish or cancel sign-in first.')
    const changed = () => this.emit({ type: 'changed' })
    switch (input.action) {
      case 'snapshot':
        return this.snapshot()
      case 'resolveSources': {
        this.required<Conversation>('conversation', input.conversationId)
        const scopes = [this.vault.scope, `attachments:${input.conversationId}`]
        return input.sourceIds
          .map((id) => this.source(id))
          .filter((source) => scopes.includes(source.scope))
      }
      case 'providerLogin': {
        if (this.providerSignIn.active) throw new Error('A sign-in is already in progress.')
        const runtime = await this.pi.loginRuntime()
        const deviceId = this.store.meta('provider-device-id', randomUUID())
        this.store.setMeta('provider-device-id', deviceId)
        this.providerSignIn.start(runtime, 'openai', deviceId, async () => {
          this.store.settings = { ...this.store.settings, openaiAuthMode: 'subscription' }
          await this.pi.configure(true)
        })
        return this.snapshot()
      }
      case 'providerLoginReply':
        this.providerSignIn.submit(input.text)
        return null
      case 'providerLoginCancel':
        await this.providerSignIn.cancel()
        return this.snapshot()
      case 'providerLogout':
        if (this.providerSignIn.active) throw new Error('Cancel the current sign-in first.')
        await this.pi.logoutProvider()
        changed()
        return this.snapshot()
      case 'models':
        if (this.providerSignIn.active) return this.pi.models
        const models = await this.pi.configure(true)
        changed()
        return models
      case 'settings': {
        if (this.providerSignIn.active)
          throw new Error('Finish or cancel sign-in before changing settings.')
        if (this.pi.busy || this.vault.status.indexing)
          throw new Error('Wait for the current activity before changing settings.')
        if (input.settings.vaultPath !== this.store.settings.vaultPath)
          throw new Error('Use the folder picker to change vaults.')
        const previous = this.store.settings
        if (input.apiKey?.trim()) this.keys.put(input.settings.apiProvider, input.apiKey)
        if (input.clearProviderKey) this.keys.remove(input.clearProviderKey)
        this.store.settings = {
          ...input.settings,
          ...(input.apiKey?.trim() && input.settings.apiProvider === 'openai'
            ? { openaiAuthMode: 'api' as const }
            : {})
        }
        try {
          await this.pi.configure(
            previous.apiProvider !== input.settings.apiProvider ||
              previous.usePiCredentials !== input.settings.usePiCredentials ||
              !!input.apiKey ||
              !!input.clearProviderKey
          )
        } catch (error) {
          this.store.settings = previous
          throw error
        }
        this.vault.refreshStatus()
        changed()
        return this.snapshot()
      }
      case 'chooseVault': {
        if (this.pi.busy || this.vault.status.indexing)
          throw new Error('Wait for the current activity before switching vaults.')
        const selected = await this.host.chooseDirectory()
        if (!selected) return null
        const root = await fs.realpath(selected)
        this.store.settings = { ...this.store.settings, vaultPath: root }
        // First vault connection adopts study work created before a vault existed.
        this.store.transaction(() => {
          for (const kind of [
            'concept',
            'edge',
            'goal',
            'guide',
            'bit',
            'noteProposal',
            'card',
            'exercise',
            'studyMemory'
          ])
            for (const record of this.store
              .all<{ id: string; scope: string }>(kind)
              .filter((r) => r.scope === 'unconnected'))
              this.store.put(kind, { ...record, scope: this.vault.scope })
        })
        this.store.setMeta('vault-roots', {
          ...this.store.meta<Record<string, string>>('vault-roots', {}),
          [vaultScope(root)]: root
        })
        this.vault.refreshStatus('Vault connected. Indexing…')
        changed()
        await this.vault.index()
        this.vault.watch()
        changed()
        return this.snapshot()
      }
      case 'clearVaultCache':
        if (this.pi.busy || this.vault.status.indexing)
          throw new Error('Wait for the current activity before deleting the vault cache.')
        this.vault.clearCache()
        changed()
        return this.snapshot()
      case 'index':
        await this.vault.index()
        if (!this.closing) this.vault.watch()
        changed()
        return this.snapshot()
      case 'saveConcept': {
        const existing = input.concept.id
          ? this.required<Concept>('concept', input.concept.id)
          : null
        const scopes = [
          this.vault.scope,
          ...this.store.all<Conversation>('conversation').map((c) => `attachments:${c.id}`)
        ]
        if (existing && !scopes.includes(existing.scope))
          throw new Error('This concept belongs to another vault.')
        const result = this.study.saveConcept(existing?.scope || this.vault.scope, input.concept)
        changed()
        return result
      }
      case 'saveEdge': {
        const scopes = [
          this.vault.scope,
          ...this.store.all<Conversation>('conversation').map((c) => `attachments:${c.id}`)
        ]
        const result = this.study.saveEdge(this.vault.scope, input.edge, 'learner', scopes)
        changed()
        return result
      }
      case 'decideEdge': {
        const result = this.study.decideEdge(this.vault.scope, input.edgeId, input.status)
        changed()
        return result
      }
      case 'saveGoal': {
        this.required<Conversation>('conversation', input.conversationId)
        const result = this.study.saveGoal(this.vault.scope, input.conversationId, input.goal)
        changed()
        return result
      }
      case 'saveGuide': {
        this.required<Conversation>('conversation', input.conversationId)
        const result = this.study.saveGuide(this.vault.scope, input.conversationId, input.guide)
        changed()
        return result
      }
      case 'captureBit': {
        this.required<Conversation>('conversation', input.conversationId)
        const result = this.study.captureBit(this.vault.scope, input.conversationId, input)
        changed()
        return result
      }
      case 'updateBit': {
        const result = this.study.updateBit(this.vault.scope, input.bitId, input)
        changed()
        return result
      }
      case 'proposeNote': {
        this.required<Conversation>('conversation', input.conversationId)
        const proposal = await this.notes.prepare(input.proposal)
        const result = this.study.proposeNote(this.vault.scope, input.conversationId, proposal)
        changed()
        return result
      }
      case 'reviewNotes': {
        if (input.decision === 'accept') {
          try {
            return await this.notes.accept(input.proposalIds)
          } finally {
            changed()
          }
        }
        for (const id of input.proposalIds)
          this.study.setProposalStatus(this.vault.scope, id, 'rejected')
        changed()
        return true
      }
      case 'undoNote': {
        try {
          await this.notes.undo(input.proposalId)
          return true
        } finally {
          changed()
        }
      }
      case 'suggestPlacement':
        this.required<Conversation>('conversation', input.conversationId)
        return this.pi.organize(input.text, input.conversationId)
      case 'saveExercise': {
        this.required<Conversation>('conversation', input.conversationId)
        const result = this.study.saveExercise(
          this.vault.scope,
          input.conversationId,
          input.exercise
        )
        changed()
        return result
      }
      case 'exerciseAdvice': {
        this.required<Conversation>('conversation', input.conversationId)
        const exercise = this.required<Exercise>('exercise', input.exerciseId)
        this.study.recordProgress([exercise.scope], exercise.id, {
          draft: input.answer,
          hint: true
        })
        const progress = this.progress(exercise.id)
        this.store.setMeta(`exercise-progress:${exercise.id}`, {
          ...progress,
          adviceCount: (progress.adviceCount || 0) + 1
        })
        changed()
        return this.pi.advice(exercise, input.answer, input.conversationId)
      }
      case 'updateStudy': {
        const tab = this.required<Conversation>('conversation', input.conversationId)
        if (input.goalId) {
          const goal = this.required<{ conversationId: string }>('goal', input.goalId)
          if (goal.conversationId !== tab.id) throw new Error('Choose a goal from this chat.')
        }
        const updated = {
          ...tab,
          ...(input.studyMode !== undefined ? { studyMode: input.studyMode } : {}),
          ...(input.buildNotes !== undefined ? { buildNotes: input.buildNotes } : {}),
          ...(input.goalId !== undefined ? { goalId: input.goalId } : {})
        }
        this.store.put('conversation', updated)
        changed()
        return updated
      }
      case 'completeHandoff': {
        const handoff = this.required<StudyHandoff>('handoff', input.handoffId)
        if (handoff.status === 'completed' && !handoff.resumedAt && input.resume !== false) {
          await this.pi.resumeStudy(handoff.conversationId, handoff)
          changed()
          return this.required<StudyHandoff>('handoff', handoff.id)
        }
        if (handoff.status !== 'active') return handoff
        if (input.resume !== false && this.pi.busy)
          throw new Error('Wait for the current response before returning to the chat.')
        if (input.itemId && handoff.kind === 'cards') {
          if (!handoff.itemIds.includes(input.itemId))
            throw new Error('This card is outside the suggested activity.')
          handoff.completedItemIds = [
            ...new Set([...(handoff.completedItemIds || []), input.itemId])
          ]
          if (handoff.itemIds.some((id) => !handoff.completedItemIds!.includes(id))) {
            this.store.put('handoff', handoff)
            changed()
            return handoff
          }
        }
        const completed = {
          ...handoff,
          status: input.resume === false ? ('dismissed' as const) : ('completed' as const),
          completedAt: new Date().toISOString()
        }
        this.store.put('handoff', completed)
        changed()
        if (input.resume !== false) await this.pi.resumeStudy(completed.conversationId, completed)
        return completed
      }
      case 'highlight': {
        const source = this.source(input.sourceId)
        const document = await readSourceDocument(source, await this.fileForSource(source))
        if (document.revision !== input.revision)
          throw new Error('The source changed. Reload before highlighting.')
        const text = input.page ? document.pages?.[input.page - 1] : document.text
        const normalized = (value: string) => value.replace(/\s+/g, ' ').trim()
        if (text === undefined || !normalized(text).includes(normalized(input.quote)))
          throw new Error('The highlighted text could not be matched to this source revision.')
        const highlight: SourceHighlight = {
          id: randomUUID(),
          sourceId: source.id,
          documentId: source.documentId,
          scope: source.scope,
          path: source.path,
          revision: input.revision,
          page: input.page,
          quote: input.quote,
          rects: input.rects || [],
          createdAt: new Date().toISOString()
        }
        this.store.put('highlight', { ...highlight, source })
        changed()
        return highlight
      }
      case 'deleteHighlight':
        this.store.remove('highlight', input.highlightId)
        changed()
        return true
      case 'importWeb': {
        this.required<Conversation>('conversation', input.conversationId)
        const result = await importWebResource(
          this.store,
          this.vault,
          this.dataDir,
          input.conversationId,
          input.url,
          input.title
        )
        changed()
        return result
      }
      case 'updateTab': {
        const tab = this.required<Conversation>('conversation', input.conversationId)
        const updated = {
          ...tab,
          ...(input.closed !== undefined ? { closed: input.closed } : {}),
          ...(input.hasDraft !== undefined ? { hasDraft: input.hasDraft } : {}),
          ...(input.title
            ? { title: input.title, titleOrigin: 'manual' as const, titleGeneration: undefined }
            : {})
        }
        const result =
          tab.temporary && !input.title && !input.hasDraft
            ? this.store.stageConversation(updated)
            : this.store.put('conversation', updated)
        if (input.hasDraft === false) this.store.releaseEmptyConversation(tab.id)
        else if (updated.closed) this.store.discardEmptyClosedConversation(tab.id)
        changed()
        return this.store.get<Conversation>('conversation', result.id)
      }
      case 'forkMessage': {
        const message = this.required<Message>('message', input.messageId)
        if (message.role !== 'assistant' || !message.text.trim())
          throw new Error('Choose a saved assistant reply to fork.')
        const origin = this.required<Conversation>('conversation', message.conversationId)
        const now = new Date().toISOString()
        const conversation: Conversation = {
          id: randomUUID(),
          title: 'New conversation',
          parentId: origin.parentId || origin.id,
          createdAt: now,
          updatedAt: now
        }
        const result = this.store.transaction(() => {
          this.store.stageConversation(conversation)
          const reference = resolveChatReferences(this.store, conversation, this.vault.scope, [
            {
              id: randomUUID(),
              messageId: message.id,
              text: message.text,
              label: ''
            }
          ])[0]
          const scopes = new Set([
            this.vault.scope,
            ...this.store
              .all<Conversation>('conversation')
              .filter((tab) => (tab.parentId || tab.id) === conversation.parentId)
              .map((tab) => `attachments:${tab.id}`)
          ])
          reference.relatedSources = message.sources.filter((source) => scopes.has(source.scope))
          this.store.put('chatReference', {
            ...reference,
            conversationId: conversation.id,
            sources: reference.relatedSources
          })
          return {
            conversation: this.required<Conversation>('conversation', conversation.id),
            reference
          }
        })
        changed()
        return result
      }
      case 'newChat': {
        const parent = input.parentId
          ? this.required<Conversation>('conversation', input.parentId)
          : null
        if (!parent) {
          const chats = this.store.all<Conversation>('conversation')
          const unused = chats.find(
            (chat) =>
              chat.temporary &&
              !chat.parentId &&
              !chat.closed &&
              !chats.some((child) => child.parentId === chat.id)
          )
          if (unused) return unused
        }
        const conversation: Conversation = {
          id: randomUUID(),
          title: 'New conversation',
          ...(parent ? { parentId: parent.parentId || parent.id } : {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        const draft = this.store.stageConversation(conversation)
        changed()
        return draft
      }
      case 'addChatReference': {
        const tab = this.required<Conversation>('conversation', input.conversationId)
        let reference = resolveChatReferences(this.store, tab, this.vault.scope, [
          input.reference
        ])[0]
        if (reference.source && !reference.context) {
          let document
          if (reference.view === 'document') {
            try {
              document = await readSourceDocument(
                reference.source,
                await this.fileForSource(reference.source)
              )
            } catch {
              /* Historical context remains available. */
            }
          }
          if (
            document &&
            document.revision === reference.revision &&
            reference.view === 'document'
          ) {
            const origin = reference.source
            const candidates = this.store
              .documentChunks(origin.scope, origin.path)
              .filter(
                (source) =>
                  source.revision === document.revision &&
                  (!reference.page || source.page === reference.page)
              )
            const located =
              candidates.find(
                (source) =>
                  reference.sourceLine &&
                  source.startLine &&
                  source.endLine &&
                  reference.sourceLine >= source.startLine &&
                  reference.sourceLine <= source.endLine
              ) || candidates.find((source) => contextWindow(source.text, reference.text).matched)
            if (located) reference = { ...reference, source: located, sourceId: located.id }
          }
          reference = enrichReferenceContext(reference, document)
        }
        this.store.put('chatReference', {
          ...reference,
          conversationId: tab.id,
          sources: [
            ...(reference.source ? [reference.source] : []),
            ...(reference.relatedSources || [])
          ]
        })
        return reference
      }
      case 'messages':
        return this.store
          .all<Message>('message')
          .filter((message) => message.conversationId === input.conversationId)
      case 'deleteChat': {
        if (this.pi.busy)
          throw new Error('Stop the current response before deleting a conversation.')
        const root = this.required<Conversation>('conversation', input.conversationId)
        const deleting = new Set([
          root.id,
          ...(!root.parentId
            ? this.store
                .all<Conversation>('conversation')
                .filter((tab) => tab.parentId === root.id)
                .map((tab) => tab.id)
            : [])
        ])
        // Study artifacts and review/attempt history survive conversation deletion.
        this.store.transaction(() => {
          for (const id of deleting) this.store.remove('conversation', id)
          for (const reference of this.store.all<{ id: string; conversationId: string }>(
            'chatReference'
          ))
            if (deleting.has(reference.conversationId))
              this.store.remove('chatReference', reference.id)
          for (const message of this.store
            .all<Message>('message')
            .filter((message) => deleting.has(message.conversationId)))
            this.store.remove('message', message.id)
        })
        changed()
        return true
      }
      case 'attach': {
        this.required<Conversation>('conversation', input.conversationId)
        const selected = input.paths || (await this.host.chooseFiles())
        const sources: Source[] = []
        const directory = path.join(this.dataDir, 'resources')
        await fs.mkdir(directory, { recursive: true, mode: 0o700 })
        for (const original of selected.slice(0, 10)) {
          const ext = path.extname(original).toLowerCase()
          if (!['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext))
            throw new Error('Attach a Markdown, text, PDF, or image source.')
          if ((await fs.stat(original)).size > 40 * 1024 * 1024)
            throw new Error('Attachments are limited to 40 MB in this version.')
          const relative = `${randomUUID().slice(0, 8)}-${path.basename(original)}`
          const file = path.join(directory, relative)
          await fs.copyFile(original, file, 1)
          await fs.chmod(file, 0o600)
          const scope = `attachments:${input.conversationId}`
          const chunks = await this.vault.indexFile(
            scope,
            relative,
            file,
            path.basename(original, path.extname(original))
          )
          this.store.setMeta(`attachment-file:${scope}:${relative}`, file)
          sources.push(...chunks)
          // Reuse the configured embedding model for attached resources as well.
          const embedding = this.vault.embedding
          if (embedding) {
            try {
              for (let i = 0; i < chunks.length; i += 8) {
                const vectors = await embedding.embed(
                  chunks.slice(i, i + 8).map((source) => source.text)
                )
                chunks
                  .slice(i, i + 8)
                  .forEach((source, n) =>
                    this.store.db
                      .prepare('UPDATE chunks SET vector=?,embedding_key=? WHERE id=?')
                      .run(new Uint8Array(vectors[n].buffer), embedding.key, source.id)
                  )
              }
            } catch {
              /* Attached text remains retrievable when embeddings are unavailable. */
            }
          }
        }
        const attached = this.store.meta<string[]>(`attached-sources:${input.conversationId}`, [])
        this.store.setMeta(`attached-sources:${input.conversationId}`, [
          ...new Set([...attached, ...sources.map((source) => source.id)])
        ])
        changed()
        return sources
      }
      case 'search':
        return this.vault.search(input.query, input.conversationId, 12)
      case 'document':
        return this.store.documentChunks(this.vault.scope, input.path).slice(0, 12)
      case 'openLink':
        await this.host.openLink(input.url)
        return null
      case 'source': {
        const source = this.source(input.source.id)
        let stale = false,
          missing = false
        try {
          stale = hash(await fs.readFile(await this.fileForSource(source))) !== source.revision
        } catch {
          missing = true
        }
        return { source, stale, missing }
      }
      case 'sourceDocument': {
        const source = this.source(input.source.id)
        let file: string
        try {
          file = await this.fileForSource(source)
        } catch {
          return { source, stale: false, missing: true, document: null }
        }
        try {
          const document = await readSourceDocument(source, file)
          return { source, stale: document.revision !== source.revision, missing: false, document }
        } catch (error) {
          return {
            source,
            stale: false,
            missing: false,
            document: null,
            error: error instanceof Error ? error.message : 'Could not read this source.'
          }
        }
      }
      case 'sourceBytes': {
        const source = this.source(input.source.id)
        if (source.kind !== 'pdf' && source.kind !== 'image')
          throw new Error('Only PDFs and images have binary source data.')
        const file = await this.fileForSource(source)
        if ((await fs.stat(file)).size > 40 * 1024 * 1024)
          throw new Error('This PDF exceeds the 40 MB reader limit.')
        const bytes = await fs.readFile(file)
        return { bytes: new Uint8Array(bytes), revision: hash(bytes) }
      }
      case 'sourceAsset': {
        const source = this.source(input.source.id)
        if (!source.scope.startsWith('vault:'))
          throw new Error('This attachment has no vault image folder.')
        const roots = this.store.meta<Record<string, string>>('vault-roots', {})
        const root = roots[source.scope]
        if (!root) throw new Error('The original vault is no longer connected.')
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(input.reference))
          throw new Error('Only local vault images are supported.')
        const reference = decodeURIComponent(input.reference.split(/[?#]/)[0])
        const relative = path.posix.normalize(
          path.posix.join(path.posix.dirname(this.vault.pathForSource(source)), reference)
        )
        const mime: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        }
        const type = mime[path.extname(relative).toLowerCase()]
        if (!type) throw new Error('Unsupported source image format.')
        const file = await containedFile(root, relative)
        if ((await fs.stat(file)).size > 8 * 1024 * 1024)
          throw new Error('This source image is too large.')
        const bytes = await fs.readFile(file)
        if (bytes.length > 8 * 1024 * 1024) throw new Error('This source image is too large.')
        return `data:${type};base64,${bytes.toString('base64')}`
      }
      case 'sourceLink': {
        const source = this.source(input.source.id)
        if (!source.scope.startsWith('vault:'))
          throw new Error('This attachment has no vault note links.')
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(input.reference))
          throw new Error('This is not a vault note link.')
        const [rawPath, ...headingParts] = decodeURIComponent(input.reference).split('#')
        const heading = headingParts.join('#')
        const target = rawPath
          ? /\.md$/i.test(rawPath)
            ? rawPath
            : `${rawPath}.md`
          : this.vault.pathForSource(source)
        const chunks = this.store.chunks([source.scope])
        const relative = path.posix.normalize(
          path.posix.join(path.posix.dirname(this.vault.pathForSource(source)), target)
        )
        let matches = chunks.filter((chunk) => chunk.path === target || chunk.path === relative)
        if (!matches.length && !target.includes('/')) {
          const paths = new Set(
            chunks
              .filter((chunk) => path.posix.basename(chunk.path) === target)
              .map((chunk) => chunk.path)
          )
          if (paths.size > 1)
            throw new Error('Several notes have this name. Use a full vault path.')
          matches = chunks.filter((chunk) => paths.has(chunk.path))
        }
        const paths = new Set(matches.map((chunk) => chunk.path))
        if (paths.size > 1) throw new Error('This note link is ambiguous. Use a full vault path.')
        const match = heading ? matches.find((chunk) => chunk.heading === heading) : matches[0]
        if (!match)
          throw new Error(
            'This note or heading is not in the current index. Refresh the vault index.'
          )
        await this.fileForSource(match)
        return match
      }
      case 'openOriginal': {
        const source = this.source(input.source.id)
        const file = await this.fileForSource(source)
        if (source.scope.startsWith('vault:'))
          await this.host.openLink(obsidianSourceUri(file, source))
        else await this.host.openFile(file)
        return null
      }
      case 'send':
        if (this.providerSignIn.active)
          throw new Error('Finish or cancel sign-in before sending a message.')
        return this.pi.send(
          input.conversationId,
          input.text,
          input.sourceIds,
          input.activity,
          input.references
        )
      case 'stop':
        return this.pi.stop()
      case 'review': {
        const result = reviewCard(this.store, input.cardId, input.rating, input.expectedReps)
        changed()
        return result
      }
      case 'saveCard': {
        this.required<Conversation>('conversation', input.conversationId)
        if (input.conceptId) this.required<Concept>('concept', input.conceptId)
        const old = input.cardId ? this.required<Flashcard>('card', input.cardId) : null
        const modified = old && (old.front !== input.front || old.back !== input.back)
        if (modified) this.store.put('cardRevision', { id: randomUUID(), before: old })
        const card: Flashcard = {
          id: old?.id || randomUUID(),
          scope: old?.scope || this.vault.scope,
          conversationId: old?.conversationId || input.conversationId,
          conceptId: input.conceptId,
          front: input.front,
          back: input.back,
          sources: old?.sources || [],
          importInfo: old?.importInfo,
          scheduler: old && !modified ? old.scheduler : newSchedule(),
          createdAt: old?.createdAt || new Date().toISOString(),
          origin: 'learner',
          suspended: false,
          contentVersion: cardVersion(input.front, input.back)
        }
        this.store.put('card', card)
        changed()
        return card
      }
      case 'importCards': {
        this.required<Conversation>('conversation', input.conversationId)
        const scope = this.vault.scope
        if (input.conceptId) {
          const concept = this.required<Concept>('concept', input.conceptId)
          if (
            concept.archived ||
            ![scope, `attachments:${input.conversationId}`].includes(concept.scope)
          )
            throw new Error('Choose a concept in the current vault or chat.')
        }
        const rows = cardRows(input.text, input.options)
        const seen = new Set(
          this.store
            .all<Flashcard>('card')
            .filter((card) => !card.suspended && card.scope === scope)
            .map((card) => card.contentVersion)
        )
        const now = new Date().toISOString()
        const fileHash = hash(input.text)
        const cards: Flashcard[] = []
        let skipped = 0
        for (const row of rows) {
          const contentVersion = cardVersion(row.front, row.back)
          if (input.skipDuplicates && seen.has(contentVersion)) {
            skipped++
            continue
          }
          seen.add(contentVersion)
          cards.push({
            id: randomUUID(),
            scope,
            conversationId: input.conversationId,
            conceptId: input.conceptId,
            front: row.front,
            back: row.back,
            sources: [],
            scheduler: newSchedule(),
            createdAt: now,
            origin: 'learner',
            suspended: false,
            contentVersion,
            importInfo: {
              fileName: input.fileName,
              row: row.row,
              importedAt: now,
              fileHash
            }
          })
        }
        this.store.transaction(() => {
          for (const card of cards) this.store.put('card', card)
        })
        changed()
        return { imported: cards.length, skipped }
      }
      case 'archiveCards': {
        const cards = [...new Set(input.cardIds)].map((cardId) =>
          this.required<Flashcard>('card', cardId)
        )
        this.store.transaction(() => {
          for (const card of cards) this.store.put('card', { ...card, suspended: input.suspended })
        })
        changed()
        return { updated: cards.length }
      }
      case 'deleteCard': {
        const card = this.required<Flashcard>('card', input.cardId)
        this.store.put('card', { ...card, suspended: true })
        changed()
        return null
      }
      case 'exerciseHelp': {
        const exercise = this.required<Exercise>('exercise', input.exerciseId)
        const progress = this.progress(exercise.id)
        if (input.kind === 'hint')
          progress.hintsShown = Math.min(exercise.hints.length, progress.hintsShown + 1)
        if (input.kind === 'solution') progress.solutionSeen = true
        if (input.kind === 'draft') progress.draft = input.draft || ''
        this.store.setMeta(`exercise-progress:${exercise.id}`, progress)
        changed()
        return progress
      }
      case 'answer': {
        if (input.gradeWithModel && this.pi.busy)
          throw new Error('Wait for the current response before checking this attempt.')
        const exercise = this.required<Exercise>('exercise', input.exerciseId)
        const progress = this.progress(exercise.id)
        const attempt: Attempt = {
          id: randomUUID(),
          exerciseId: exercise.id,
          answer: input.answer,
          assistance: Math.max(input.assistance, progress.hintsShown, progress.adviceCount || 0),
          solutionSeen: input.solutionSeen || progress.solutionSeen,
          at: new Date().toISOString(),
          feedback: null,
          outcome: 'ungraded',
          assessedBy: null,
          exerciseVersion: exercise.contentVersion || exerciseVersion(exercise),
          conditions: input.conditions,
          uncertainty: ''
        }
        this.store.put('attempt', attempt)
        updatePracticeSchedule(this.store, exercise, attempt)
        this.store.setMeta(`exercise-progress:${exercise.id}`, { ...progress, draft: input.answer })
        changed()
        if (input.gradeWithModel) await this.pi.grade(exercise, attempt)
        else {
          const result = checkExerciseAnswer(exercise, input.answer)
          if (result) this.store.put('attempt', { ...attempt, ...result, assessedBy: 'answer-key' })
        }
        updatePracticeSchedule(this.store, exercise, this.required<Attempt>('attempt', attempt.id))
        return this.store.get('attempt', attempt.id)
      }
      case 'assessAttempt': {
        const attempt = this.required<Attempt>('attempt', input.attemptId)
        this.store.put('assessmentRevision', { id: randomUUID(), before: attempt })
        const assessed = {
          ...attempt,
          outcome: input.outcome,
          assessedBy: 'learner' as const,
          criterionFeedback: [],
          uncertainty: 'Learner self-assessment; criteria are not separately assessed.'
        }
        this.store.put('attempt', assessed)
        updatePracticeSchedule(
          this.store,
          this.required<Exercise>('exercise', attempt.exerciseId),
          assessed
        )
        changed()
        return null
      }
      case 'level': {
        const concept = this.required<Concept>('concept', input.conceptId)
        this.store.put('levelEvent', {
          id: randomUUID(),
          conceptId: concept.id,
          previous: concept.level,
          level: input.level,
          at: new Date().toISOString(),
          origin: 'learner'
        })
        this.store.put('concept', {
          ...concept,
          level: input.level,
          levelOrigin: 'learner',
          updatedAt: new Date().toISOString()
        })
        changed()
        return null
      }
      case 'previewTag': {
        const concept = this.required<Concept>('concept', input.conceptId)
        if (concept.scope !== this.vault.scope || !this.store.settings.vaultPath || !concept.level)
          throw new Error('Select a level for a concept in the current Markdown vault first.')
        const original = await fs.readFile(
          await containedFile(this.store.settings.vaultPath, concept.path),
          'utf8'
        )
        return {
          original,
          updated: tagPatch(original, concept, concept.level),
          revision: hash(original),
          path: concept.path
        }
      }
      case 'writeTag': {
        const concept = this.required<Concept>('concept', input.conceptId)
        if (concept.scope !== this.vault.scope || !this.store.settings.vaultPath)
          throw new Error('This concept belongs to another vault.')
        if (this.vault.status.indexing)
          throw new Error('Wait for indexing to finish before writing a tag.')
        await writeTag(
          this.store.settings.vaultPath,
          concept,
          input.expectedRevision,
          path.join(this.dataDir, 'note-backups')
        )
        await this.vault.indexFile(
          concept.scope,
          concept.path,
          await containedFile(this.store.settings.vaultPath, concept.path)
        )
        changed()
        return { saved: true }
      }
      case 'export': {
        const file = await this.host.chooseExport()
        if (!file) return null
        const cards = this.store.all<Flashcard>('card').filter((card) => !card.suspended)
        const exercises = this.store.all<Exercise>('exercise')
        if (file.toLowerCase().endsWith('.md')) {
          const sources = (refs: Source[]) =>
            refs
              .map(
                (source) =>
                  `- ${source.path}${source.page ? `, page ${source.page}` : `:${source.startLine}–${source.endLine}`} (revision ${source.revision.slice(0, 8)})`
              )
              .join('\n')
          const markdown = `# Noctua learning activities\n\n${cards.map((card) => `#flashcard\n${card.front}\n---\n${card.back}\n---\n\n${sources(card.sources)}`).join('\n\n')}\n\n# Exercises\n\n${exercises.map((exercise) => `## ${exercise.title}\n\n${exercise.prompt}\n\n${exercise.hints.map((hint, i) => `Hint ${i + 1}: ${hint}`).join('\n\n')}\n\n<details><summary>Solution</summary>\n\n${exercise.solution}\n\n</details>\n\n${sources(exercise.sources)}`).join('\n\n')}\n`
          await fs.writeFile(file, markdown, 'utf8')
        } else {
          const sessions: Record<string, string> = {}
          for (const chat of this.store.all<Conversation>('conversation'))
            if (chat.sessionFile) {
              try {
                sessions[chat.id] = await fs.readFile(chat.sessionFile, 'utf8')
              } catch {
                /* Missing sessions are visible in the backup metadata. */
              }
            }
          const kinds = [
            'conversation',
            'chatReference',
            'message',
            'card',
            'exercise',
            'concept',
            'review',
            'attempt',
            'levelEvent',
            'cardRevision',
            'assessmentRevision',
            'edge',
            'goal',
            'guide',
            'bit',
            'noteProposal',
            'noteBackup',
            'handoff',
            'highlight',
            'practice',
            'noteIdentity',
            'resourceImport',
            'exerciseRevision',
            'studyMemory',
            'exerciseAdvice',
            'conceptFacetRevision',
            'noteProposalDecision'
          ]
          const records = Object.fromEntries(
            kinds.map((kind) => [
              kind,
              this.store.all<{ temporary?: boolean }>(kind).filter((record) => !record.temporary)
            ])
          )
          await fs.writeFile(
            file,
            JSON.stringify(
              {
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                records,
                exerciseProgress: this.snapshot().exerciseProgress,
                sessions,
                includesCredentials: false
              },
              null,
              2
            ),
            { mode: 0o600 }
          )
        }
        return file
      }
    }
  }
  close(): Promise<void> {
    return (this.closeWork ||= this.shutdown())
  }
  private async shutdown(): Promise<void> {
    this.closing = true
    this.vault.stopWatching()
    await this.providerSignIn.cancel()
    await this.pi.shutdown()
    await Promise.allSettled([...this.pending])
    await this.vault.whenIdle()
    this.store.close()
  }
}
