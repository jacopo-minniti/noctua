export const levels = ['unknown', 'knowledge', 'comprehension', 'application', 'transfer'] as const
export type Level = (typeof levels)[number]
export type ActivityKind = 'flashcards' | 'exercises'
export type ExerciseKind = 'knowledge' | 'comprehension' | 'application' | 'transfer'
export type Rating = 1 | 2 | 3 | 4

export interface Source {
  id: string
  scope: string
  path: string
  title: string
  kind: 'markdown' | 'text' | 'pdf' | 'image'
  revision: string
  heading: string
  anchor?: string
  startLine?: number
  endLine?: number
  page?: number
  text: string
  score?: number
  historical?: boolean
  documentId?: string
  url?: string
}
export interface SourceDocument {
  text: string
  revision: string
  pages?: string[]
}
export interface SourceDetail {
  source: Source
  stale: boolean
  missing: boolean
  document: SourceDocument | null
  error?: string
}
export interface Concept {
  id: string
  scope: string
  path: string
  anchor: string
  title: string
  level: Level | null
  levelOrigin: 'vault' | 'learner' | null
  updatedAt: string
  archived: boolean
  aliases?: string[]
  description?: string
  sourceIds?: string[]
  sources?: Source[]
  facets?: ConceptFacet[]
  desiredLevel?: Level | null
  lineageIds?: string[]
}
export interface ConceptFacet {
  id: string
  title: string
  description?: string
  desiredLevel?: Level
  version?: string
}
export interface ConceptEdge {
  id: string
  scope: string
  fromId: string
  toId: string
  relation:
    'part-of' | 'prerequisite' | 'explains' | 'applies-to' | 'contrasts-with' | 'analogous-to'
  rationale: string
  context: string
  sources: Source[]
  origin: 'learner' | 'model' | 'source'
  status: 'proposed' | 'accepted' | 'rejected'
  createdAt: string
  updatedAt: string
}
export interface StudyGoal {
  id: string
  scope: string
  conversationId: string
  title: string
  description: string
  conceptIds: string[]
  desiredLevel: Level | null
  depth: 'orientation' | 'working' | 'deep'
  status: 'active' | 'paused' | 'done'
  createdAt: string
  updatedAt: string
}
export interface StudyGuide {
  id: string
  scope: string
  conversationId: string
  title: string
  goalId: string | null
  conceptIds: string[]
  questions: string[]
  sourceIds: string[]
  sources?: Source[]
  exerciseIds: string[]
  cardIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}
export interface StudyBit {
  id: string
  scope: string
  conversationId: string
  text: string
  origin: 'learner' | 'quotation' | 'model'
  conceptIds: string[]
  source: Source | null
  status: 'inbox' | 'linked' | 'proposed' | 'placed'
  createdAt: string
  updatedAt: string
}
export interface NoteProposal {
  appliedBy?: 'learner' | 'model'
  id: string
  scope: string
  conversationId: string
  conceptIds: string[]
  bitIds: string[]
  path: string
  anchor: string
  expectedRevision: string
  operation: 'append' | 'replace'
  before: string
  after: string
  rationale: string
  origin: 'learner' | 'model'
  status: 'pending' | 'accepted' | 'rejected' | 'conflict'
  createdAt: string
  updatedAt: string
}
export interface RubricCriterion {
  id: string
  title: string
  description?: string
  level: Exclude<Level, 'unknown'>
  conceptId?: string
  edgeId?: string
  facetId?: string
  facetVersion?: string
  essential?: boolean
}
export interface CriterionFeedback {
  criterionId: string
  outcome: 'met' | 'partial' | 'not-met' | 'unobserved'
  feedback: string
  evidence?: string
  start?: number
  end?: number
  uncertainty?: string
}
export interface EvidenceFacetSummary {
  id: string
  title: string
  observations: number
  independentSuccesses: number
  assistedSuccesses: number
  gaps: number
  families: string[]
  contexts: string[]
  levels: Level[]
  lastObservedAt: string | null
}
export interface ConceptEvidenceSummary {
  facets: EvidenceFacetSummary[]
  independentSuccesses: number
  assistedSuccesses: number
  ungraded: number
  lastObservedAt: string | null
  source: 'unassessed' | 'self-reported' | 'observed'
  reasons: string[]
  uncertainty: string[]
  candidateLevel: Level | null
}
export interface PracticeReadiness {
  recommendedLevel: Exclude<Level, 'unknown'>
  desiredLevel: Level | null
  rationale: string
  prerequisiteConceptIds: string[]
  cautions: string[]
}
export interface PracticeSchedule {
  id: string
  exerciseId: string
  contentVersion: string
  dueAt: string
  independentSuccesses: number
  lastOutcome: Attempt['outcome']
  lastAttemptId: string
  updatedAt: string
}
export interface StudyHandoff {
  id: string
  conversationId: string
  kind: 'cards' | 'exercise' | 'source' | 'guide'
  itemIds: string[]
  completedItemIds?: string[]
  sourceId?: string
  quote?: string
  reason: string
  status: 'active' | 'completed' | 'dismissed'
  createdAt: string
  completedAt?: string
  resumedAt?: string
}
export interface SourceHighlight {
  id: string
  sourceId: string
  documentId?: string
  scope: string
  path: string
  revision: string
  page?: number
  quote: string
  rects: { x: number; y: number; width: number; height: number }[]
  createdAt: string
}
export interface RecallSummary {
  cards: number
  reviewed: number
  reviews: number
  recall: number | null
  successfulDays: number
  suggestedLevel: Level | null
}
export interface LearningConcept extends Concept {
  recall: RecallSummary
  attempts: number
  independentSuccesses: number
  suggestedLevel: Level | null
  evidence?: ConceptEvidenceSummary
  readiness?: PracticeReadiness
}
export interface SchedulerState {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}
export interface Flashcard {
  id: string
  scope: string
  conversationId: string
  conceptId: string | null
  front: string
  back: string
  sources: Source[]
  scheduler: SchedulerState
  createdAt: string
  origin: 'model' | 'learner' | 'vault'
  suspended: boolean
  importInfo?: { fileName: string; row: number; importedAt: string; fileHash: string }
  contentVersion: string
  facetId?: string
  facetVersion?: string
  taskFamily?: string
  level?: Exclude<Level, 'unknown'>
}
export interface Review {
  id: string
  cardId: string
  rating: Rating
  at: string
  before: SchedulerState
  after: SchedulerState
  schedulerVersion: string
  contentVersion: string
  log: unknown
}
export interface Exercise {
  id: string
  scope: string
  conversationId: string
  conceptId: string | null
  title: string
  prompt: string
  kind: ExerciseKind
  hints: string[]
  solution: string
  criteria: string[]
  sources: Source[]
  createdAt: string
  origin: 'model' | 'learner'
  rubric?: RubricCriterion[]
  taskFamily?: string
  context?: string
  transferDescription?: string
  contentVersion?: string
  dueAt?: string
  format?: 'open' | 'short-answer' | 'multiple-choice' | 'numeric'
  choices?: string[]
  answerKey?: string
  tolerance?: number
}
export interface Attempt {
  id: string
  exerciseId: string
  answer: string
  assistance: number
  solutionSeen: boolean
  at: string
  feedback: string | null
  outcome: 'correct' | 'partial' | 'incorrect' | 'ungraded'
  assessedBy: 'model' | 'learner' | 'answer-key' | null
  exerciseVersion?: string
  criterionFeedback?: CriterionFeedback[]
  conditions?: { resourcesUsed: boolean; helpDescription: string }
  uncertainty?: string
}
export interface ExerciseProgress {
  draft: string
  hintsShown: number
  solutionSeen: boolean
  adviceCount?: number
}
export interface Conversation {
  temporary?: boolean
  hasDraft?: boolean
  id: string
  title: string
  createdAt: string
  updatedAt: string
  sessionFile?: string
  titleOrigin?: 'manual' | 'question' | 'model'
  titleGeneration?: {
    status: 'pending' | 'complete' | 'failed'
    modelKey: string
    requestedAt: string
  }
  parentId?: string
  closed?: boolean
  studyMode?: 'free' | 'guided'
  buildNotes?: boolean
  goalId?: string | null
}
export interface ReferenceContext {
  text: string
  revision: string
  kind: 'surrounding' | 'saved-passage' | 'activity' | 'message'
  startLine?: number
  endLine?: number
  page?: number
  heading?: string
  note?: string
}
export interface ChatReference {
  source?: Source
  id: string
  text: string
  label: string
  sourceId?: string
  context?: ReferenceContext
  relatedSources?: Source[]
  side?: 'front' | 'back' | 'prompt'
  view?: 'document' | 'passage'
  sourceLine?: number
  cardId?: string
  exerciseId?: string
  revision?: string
  page?: number
  conceptId?: string
  messageId?: string
  messageRole?: 'user' | 'assistant'
  originConversationId?: string
}
export interface WorkItem {
  id: string
  kind: 'tool' | 'thinking'
  name?: string
  label: string
  status: 'running' | 'complete' | 'error' | 'stopped'
  input?: string
  output?: string
  startedAt: string
  completedAt?: string
}
export interface ResponseWork {
  id: string
  startedAt: string
  completedAt?: string
  items: WorkItem[]
}
export interface Message {
  work?: ResponseWork
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  references?: ChatReference[]
  text: string
  sources: Source[]
  createdAt: string
  status: 'complete' | 'stopped' | 'error'
  model?: string
}
export type ReasoningEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export interface ModelOption {
  key: string
  id: string
  provider: string
  name: string
  local: boolean
  ready: boolean
  contextWindow: number
  reasoningLabels?: Partial<Record<ReasoningEffort, string>>
  reasoningEfforts: ReasoningEffort[]
}
export interface LearnerProfile {
  name: string
  about: string
  instructions: string
  picture?: string
}
export interface Settings {
  profile?: LearnerProfile
  vaultPath: string | null
  modelKey: string
  reasoningEffort?: ReasoningEffort
  usePiCredentials: boolean
  localBaseUrl: string
  localModelIds: string[]
  embeddings: { enabled: boolean; baseUrl: string; model: string }
  openaiAuthMode?: 'api' | 'subscription'
  apiProvider: string
  roleModels?: { chatTitle?: string; organizer?: string; evaluator?: string }
  webSearch?: { enabled: boolean; provider?: string }
}
export interface IndexStatus {
  documents: number
  chunks: number
  vectors: number
  mode: 'semantic' | 'partial' | 'lexical'
  indexing: boolean
  message: string
  lastIndexedAt: string | null
}
export interface ProviderLogin {
  status: 'idle' | 'waiting' | 'connected' | 'error'
  message: string
  url?: string
  prompt?: { message: string; placeholder?: string }
}
export interface Snapshot {
  vaultScope: string
  settings: Settings
  providerLogin: ProviderLogin
  subscriptionConnected: boolean
  keyProviders: string[]
  models: ModelOption[]
  modelDiscoveryStatus?: string
  conversations: Conversation[]
  cards: Flashcard[]
  exercises: Exercise[]
  attempts: Attempt[]
  exerciseProgress: Record<string, ExerciseProgress>
  concepts: LearningConcept[]
  documents: { path: string; title: string; chunks: number; kind: Source['kind'] }[]
  attachments: Record<string, Source[]>
  index: IndexStatus
  dataPath: string
  edges: ConceptEdge[]
  goals: StudyGoal[]
  guides: StudyGuide[]
  bits: StudyBit[]
  noteProposals: NoteProposal[]
  handoffs: StudyHandoff[]
  highlights: SourceHighlight[]
  practiceSchedules: PracticeSchedule[]
}
export type Request =
  | { action: 'resolveSources'; conversationId: string; sourceIds: string[] }
  | { action: 'snapshot' }
  | { action: 'settings'; settings: Settings; apiKey?: string; clearProviderKey?: string }
  | { action: 'models' }
  | { action: 'providerLogin' }
  | { action: 'providerLoginReply'; text: string }
  | { action: 'providerLoginCancel' }
  | { action: 'providerLogout' }
  | { action: 'chooseVault' }
  | { action: 'index' }
  | { action: 'clearVaultCache' }
  | { action: 'newChat'; parentId?: string }
  | { action: 'forkMessage'; messageId: string }
  | {
      action: 'updateTab'
      conversationId: string
      closed?: boolean
      title?: string
      hasDraft?: boolean
    }
  | { action: 'addChatReference'; conversationId: string; reference: ChatReference }
  | { action: 'messages'; conversationId: string }
  | { action: 'deleteChat'; conversationId: string }
  | { action: 'attach'; conversationId: string; paths?: string[] }
  | { action: 'search'; query: string; conversationId: string }
  | { action: 'document'; path: string }
  | { action: 'openLink'; url: string }
  | { action: 'source'; source: Source }
  | { action: 'sourceDocument'; source: Source }
  | { action: 'sourceBytes'; source: Source }
  | { action: 'sourceAsset'; source: Source; reference: string }
  | { action: 'sourceLink'; source: Source; reference: string }
  | { action: 'openOriginal'; source: Source }
  | {
      action: 'send'
      conversationId: string
      text: string
      sourceIds: string[]
      activity?: ActivityKind
      references?: ChatReference[]
    }
  | { action: 'stop' }
  | { action: 'review'; cardId: string; rating: Rating; expectedReps: number }
  | {
      action: 'saveCard'
      front: string
      back: string
      conceptId: string | null
      conversationId: string
      cardId?: string
    }
  | { action: 'deleteCard'; cardId: string }
  | {
      action: 'importCards'
      conversationId: string
      text: string
      fileName: string
      options: import('./card-csv').CardCsvOptions
      conceptId: string | null
      skipDuplicates: boolean
    }
  | { action: 'archiveCards'; cardIds: string[]; suspended: boolean }
  | { action: 'saveConcept'; concept: Partial<Concept> & { title: string } }
  | {
      action: 'saveEdge'
      edge: Partial<ConceptEdge> & {
        fromId: string
        toId: string
        relation: ConceptEdge['relation']
        rationale: string
      }
    }
  | { action: 'decideEdge'; edgeId: string; status: ConceptEdge['status'] }
  | { action: 'saveGoal'; conversationId: string; goal: Partial<StudyGoal> & { title: string } }
  | { action: 'saveGuide'; conversationId: string; guide: Partial<StudyGuide> & { title: string } }
  | {
      action: 'captureBit'
      conversationId: string
      text: string
      origin?: StudyBit['origin']
      conceptIds?: string[]
      sourceId?: string
    }
  | {
      action: 'updateBit'
      bitId: string
      text?: string
      conceptIds?: string[]
      status?: StudyBit['status']
    }
  | {
      action: 'proposeNote'
      conversationId: string
      proposal: Partial<NoteProposal> & { path: string; after: string; rationale: string }
    }
  | { action: 'reviewNotes'; proposalIds: string[]; decision: 'accept' | 'reject' }
  | { action: 'undoNote'; proposalId: string }
  | { action: 'suggestPlacement'; conversationId: string; text: string }
  | {
      action: 'saveExercise'
      conversationId: string
      exercise: Partial<Exercise> & {
        title: string
        prompt: string
        kind: ExerciseKind
        solution: string
        criteria: string[]
      }
    }
  | { action: 'exerciseAdvice'; conversationId: string; exerciseId: string; answer: string }
  | {
      action: 'updateStudy'
      conversationId: string
      studyMode?: 'free' | 'guided'
      buildNotes?: boolean
      goalId?: string | null
    }
  | { action: 'completeHandoff'; handoffId: string; resume?: boolean; itemId?: string }
  | {
      action: 'highlight'
      sourceId: string
      revision: string
      quote: string
      page?: number
      rects?: SourceHighlight['rects']
    }
  | { action: 'deleteHighlight'; highlightId: string }
  | { action: 'importWeb'; conversationId: string; url: string; title?: string }
  | {
      action: 'answer'
      exerciseId: string
      answer: string
      assistance: number
      solutionSeen: boolean
      gradeWithModel: boolean
      conditions?: Attempt['conditions']
    }
  | {
      action: 'exerciseHelp'
      exerciseId: string
      kind: 'hint' | 'solution' | 'draft'
      draft?: string
    }
  | { action: 'assessAttempt'; attemptId: string; outcome: Attempt['outcome'] }
  | { action: 'level'; conceptId: string; level: Level }
  | { action: 'previewTag'; conceptId: string }
  | { action: 'writeTag'; conceptId: string; expectedRevision: string }
  | { action: 'export' }
export type Event =
  | { type: 'changed' }
  | { type: 'index'; status: IndexStatus }
  | { type: 'delta'; conversationId: string; text: string }
  | { type: 'tool'; conversationId: string; label: string }
  | { type: 'work'; conversationId: string; work: ResponseWork }
  | { type: 'busy'; conversationId: string | null }
  | { type: 'focus'; conversationId: string; handoff: StudyHandoff }
export interface Bridge {
  attachFiles(conversationId: string, files: File[]): Promise<Source[]>
  request<T = unknown>(request: Request): Promise<T>
  onEvent(callback: (event: Event) => void): () => void
}
