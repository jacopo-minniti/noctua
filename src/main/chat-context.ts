import type {
  ChatReference,
  Concept,
  Conversation,
  Exercise,
  Flashcard,
  Message,
  Source
} from '../shared/types'
import type { Store } from './store'

/** Explicit transfers may cross sibling tabs; automatic retrieval remains tab-scoped. */
export function resolveChatReferences(
  store: Store,
  conversation: Conversation,
  vaultScope: string,
  references: ChatReference[]
): ChatReference[] {
  const root = conversation.parentId || conversation.id
  const siblings = store
    .all<Conversation>('conversation')
    .filter((tab) => (tab.parentId || tab.id) === root)
  const scopes = new Set([vaultScope, ...siblings.map((tab) => `attachments:${tab.id}`)])
  return references.map((reference) => {
    const saved = store.get<ChatReference & { conversationId: string; sources?: Source[] }>(
      'chatReference',
      reference.id
    )
    if (saved) {
      if (saved.conversationId !== conversation.id)
        throw new Error('The selected passage belongs to another tab.')
      const { conversationId: _conversationId, sources: _sources, ...snapshot } = saved
      return snapshot
    }
    if (
      [
        reference.sourceId,
        reference.cardId,
        reference.exerciseId,
        reference.conceptId,
        reference.messageId
      ].filter(Boolean).length !== 1
    )
      throw new Error('Choose a source, activity or chat message for the selected passage.')
    if (reference.messageId) {
      const message = store.get<Message>('message', reference.messageId)
      const origin = siblings.find((tab) => tab.id === message?.conversationId)
      if (!message || !origin) throw new Error('This message is unavailable in this conversation.')
      const window = contextWindow(message.text, reference.text, reference.sourceLine)
      return {
        ...reference,
        label: `${message.role === 'assistant' ? 'Noctua' : 'You'} · ${origin.title}`,
        revision: message.createdAt,
        messageRole: message.role,
        originConversationId: message.conversationId,
        context: {
          ...window,
          revision: message.createdAt,
          kind: 'message',
          note:
            message.role === 'assistant'
              ? 'Quoted from a previous assistant reply, not an authoritative source or a new learner answer.'
              : 'Quoted from a previous learner message, not a new independent answer.'
        },
        relatedSources: message.sources.filter((source) => scopes.has(source.scope)).slice(0, 3)
      }
    }
    if (reference.conceptId) {
      const concept = store.get<Concept>('concept', reference.conceptId)
      if (!concept || concept.archived || !scopes.has(concept.scope))
        throw new Error('This concept is unavailable in this conversation.')
      const sources = store
        .chunks([concept.scope])
        .filter(
          (source) =>
            concept.sourceIds?.includes(source.id) ||
            (concept.path &&
              source.path === concept.path &&
              (!concept.anchor || source.anchor === concept.anchor))
        )
        .slice(0, 3)
      return {
        ...reference,
        text: concept.title,
        label: `Concept: ${concept.title}`,
        revision: concept.updatedAt,
        relatedSources: sources,
        context: {
          text: JSON.stringify({
            title: concept.title,
            description: concept.description,
            facets: concept.facets,
            recordedLevel: concept.level,
            levelOrigin: concept.levelOrigin,
            desiredLevel: concept.desiredLevel
          }),
          revision: concept.updatedAt,
          kind: 'activity'
        }
      }
    }
    if (reference.sourceId) {
      const source = store.resolveSource(reference.sourceId)
      if (!source || !scopes.has(source.scope))
        throw new Error('This source is unavailable in this conversation.')
      return {
        ...reference,
        source,
        label: `${source.title}${reference.page ? ` · page ${reference.page}` : ''}`
      }
    }
    const activity = reference.cardId
      ? store.get<Flashcard>('card', reference.cardId)
      : store.get<Exercise>('exercise', reference.exerciseId!)
    if (
      !activity ||
      (!siblings.some((tab) => tab.id === activity.conversationId) && activity.scope !== vaultScope)
    )
      throw new Error('This activity is unavailable in this conversation.')
    if (
      reference.cardId &&
      reference.revision &&
      reference.revision !== (activity as Flashcard).contentVersion
    )
      throw new Error('This flashcard changed. Select the passage again.')
    const body = reference.cardId
      ? `Question:\n${(activity as Flashcard).front}${reference.side === 'back' ? `\n\nRevealed answer:\n${(activity as Flashcard).back}` : ''}`
      : `Exercise: ${(activity as Exercise).title}\n\n${(activity as Exercise).prompt}`
    return {
      ...reference,
      context: {
        text:
          reference.cardId && reference.side === 'back'
            ? `Question:\n${(activity as Flashcard).front.slice(0, 1200)}\n\nRevealed answer context:\n${contextWindow((activity as Flashcard).back, reference.text).text}`
            : contextWindow(body, reference.text).text,
        revision: reference.cardId ? (activity as Flashcard).contentVersion : activity.createdAt,
        kind: 'activity'
      },
      relatedSources: activity.sources.filter((source) => scopes.has(source.scope)).slice(0, 3),
      label: reference.cardId ? 'Flashcard passage' : `Exercise: ${(activity as Exercise).title}`,
      revision: reference.cardId ? (activity as Flashcard).contentVersion : activity.createdAt
    }
  })
}

/** Deterministic source window: retain original text and boundaries, not a generated summary. */
export function contextWindow(text: string, quote: string, lineHint = 1) {
  const normalized = (value: string) =>
    value
      .replace(/[*_`#$]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const needle = normalized(quote).slice(0, 160)
  // Locate the quote in raw or rendered-like text, retaining raw offsets for provenance.
  const hintOffset = text
    .split('\n')
    .slice(0, Math.max(0, lineHint - 1))
    .join('\n').length
  let at = -1
  for (
    let match = text.indexOf(quote);
    quote && match >= 0;
    match = text.indexOf(quote, match + 1)
  ) {
    if (at < 0 || Math.abs(match - hintOffset) < Math.abs(at - hintOffset)) at = match
    if (match > hintOffset) break
  }
  if (at < 0 && needle) {
    let plain = ''
    const offsets: number[] = []
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if ('*_`#$'.includes(char)) continue
      if (/\s/.test(char)) {
        if (!plain || plain.endsWith(' ')) continue
        plain += ' '
      } else plain += char
      offsets.push(i)
    }
    for (let match = plain.indexOf(needle); match >= 0; match = plain.indexOf(needle, match + 1)) {
      const offset = offsets[match]
      if (at < 0 || Math.abs(offset - hintOffset) < Math.abs(at - hintOffset)) at = offset
      if (offset > hintOffset) break
    }
  }
  const matched = at >= 0
  if (!matched)
    at = text
      .split('\n')
      .slice(0, Math.max(0, lineHint - 1))
      .join('\n').length
  const start = Math.max(0, at - 1000)
  const end = Math.min(text.length, at + Math.min(quote.length, 1200) + 1000)
  const startLine = text.slice(0, start).split('\n').length
  const endLine = text.slice(0, end).split('\n').length
  const heading = text
    .slice(0, at)
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .at(-1)
    ?.replace(/^#{1,6}\s+/, '')
  return { text: text.slice(start, end), startLine, endLine, heading, matched }
}

export function enrichReferenceContext(
  reference: ChatReference,
  document?: import('../shared/types').SourceDocument
): ChatReference {
  if (!reference.source) return reference
  const source = reference.source
  if (reference.view === 'document' && document && document.revision === reference.revision) {
    const body = document.pages
      ? document.pages[(reference.page || source.page || 1) - 1]
      : document.text
    if (body === undefined) throw new Error('The selected PDF page is unavailable.')
    const window = contextWindow(
      body,
      reference.text,
      document.pages ? 1 : reference.sourceLine || source.startLine || 1
    )
    return {
      ...reference,
      context: {
        ...window,
        revision: document.revision,
        kind: 'surrounding',
        page: document.pages ? reference.page || source.page || 1 : undefined,
        note: window.matched
          ? document.revision !== source.revision
            ? 'Surrounding text is the displayed revision; read_source points to an older indexed passage.'
            : undefined
          : 'Selection formatting could not be matched exactly; context is near the displayed block location.'
      }
    }
  }
  return {
    ...reference,
    context: {
      text: contextWindow(source.text, reference.text).text,
      revision: source.revision,
      kind: 'saved-passage',
      page: source.page,
      heading: source.heading,
      startLine: source.startLine,
      endLine: source.endLine,
      note:
        reference.view === 'document'
          ? 'Displayed revision could not be verified; context is the saved indexed passage, which may differ from the selection.'
          : undefined
    }
  }
}
