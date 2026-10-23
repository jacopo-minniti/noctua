import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Copy,
  GitBranch,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  Layers,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Target,
  Trash2,
  X,
  Download,
  Compass,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react'
import type {
  ActivityKind,
  Conversation,
  ChatReference,
  Event,
  Message,
  ModelOption,
  Request,
  Snapshot,
  Source,
  StudyHandoff
} from '../../shared/types'
import { modelFamily, modelsForPicker } from '../../shared/model-picker'
import logo from '../../../logo-simple.png'
import { ReasoningPicker } from './ReasoningPicker'
import { Markdown } from './Markdown'
import { SelectionToChat } from './SelectionToChat'
import { MarkdownComposer } from './MarkdownComposer'
import { useTabWorkspace } from './TabWorkspace'
import { SourceReader } from './SourceReader'
import { AttachmentPreview } from './AttachmentPreview'
import { ResizeHandle, useWorkspaceLayout } from './WorkspaceLayout'
import { CardsPanel, ExercisesPanel, SettingsDialog } from './Panels'
import { ConceptMap } from './ConceptMap'
import { ActivityTrace } from './ActivityTrace'
import type { ResponseWork } from '../../shared/types'
import { StudyPanels } from './StudyPanels'
import {
  useStudyTabs,
  studyKinds,
  StudyTabButtons,
  StudyTabChooser,
  allowStudyDrop,
  acceptStudyDrop,
  type StudyKind,
  type StudyTabsAction
} from './StudyTabs'

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [baseMainView, setBaseMainView] = useState<'chat' | 'map'>('chat')
  const studyTabs = useStudyTabs(chatId)
  const mainView = studyTabs.main || baseMainView
  const setMainView = (view: 'chat' | 'map') => {
    studyTabs.dispatch({ type: 'mainChat' })
    setBaseMainView(view)
  }
  const [mapOpen, setMapOpen] = useState(false)
  const [focusedActivity, setFocusedActivity] = useState<{
    kind: 'cards' | 'exercises'
    id: string
  } | null>(null)
  const openedHandoff = useRef<string | null>(null)
  const studyDesk = useRef<HTMLDivElement>(null)
  const [webUrl, setWebUrl] = useState('')
  const [cardDraft, setCardDraft] = useState<{
    front: string
    back: string
    conceptId: string | null
  } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const {
    draft,
    setDraft,
    activity,
    setActivity,
    sourceOpen,
    setSourceOpen: setSourceOpenState,
    selectedSources,
    setSelectedSources,
    references,
    setReferences,
    addReference,
    hasTabDraft,
    canAddReference,
    forgetTabs: forgetChatWorkspaces
  } = useTabWorkspace(chatId)
  const forgetTabs = (ids: string[]) => {
    forgetChatWorkspaces(ids)
    studyTabs.forget(ids)
  }
  const [referencePreview, setReferencePreview] = useState<ChatReference | null>(null)
  const [renamingTab, setRenamingTab] = useState<{ id: string; title: string } | null>(null)
  const workspace = useWorkspaceLayout()
  const showPanel = workspace.layout.showRight
  const setShowPanel = (visible: boolean) => workspace.setVisible('right', visible)
  const dispatchStudyTab = (action: StudyTabsAction) => {
    studyTabs.dispatch(action)
    if (action.type === 'close' && action.id === 'new-right') setShowPanel(false)
    if (action.type === 'move') {
      if (action.pane === 'right') setShowPanel(true)
      else if (
        !studyTabs.tabs.some(
          (tab) => tab.pane === 'right' && tab.kind !== 'new' && tab.id !== action.id
        )
      )
        setShowPanel(false)
    }
  }
  const setPanel = (kind: StudyKind) => studyTabs.dispatch({ type: 'open', kind })
  const studyVisible = (kind: StudyKind) =>
    studyTabs.tabs.some(
      (tab) =>
        tab.kind === kind &&
        (tab.pane === 'main' ? studyTabs.main === tab.id : showPanel && studyTabs.right === tab.id)
    )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busyChat, setBusyChat] = useState<string | null>(null)
  const [stream, setStream] = useState('')
  const [liveWork, setLiveWork] = useState<Record<string, ResponseWork>>({})
  const [forkingMessage, setForkingMessage] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [deleteChat, setDeleteChat] = useState<Conversation | null>(null)
  const [sourceQuery, setSourceQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Source[] | null>(null)
  const [working, setWorking] = useState('')
  const sourceReturnTab = useRef<string | null>(null)
  useEffect(() => {
    sourceReturnTab.current = null
  }, [chatId])
  const closeSource = () => {
    setSourceOpenState(null)
    if (sourceReturnTab.current) studyTabs.dispatch({ type: 'select', id: sourceReturnTab.current })
    sourceReturnTab.current = null
  }
  const [citationSourceId, setCitationSourceId] = useState<string | null>(null)
  const setSourceOpen = (source: Source | null) => {
    setCitationSourceId(null)
    setSourceOpenState(source)
    if (source) {
      if (!sourceOpen) {
        const previous = studyTabs.selected('right')
        sourceReturnTab.current =
          previous?.kind !== 'sources' && previous?.kind !== 'new' ? previous?.id || null : null
      }
      setPanel('sources')
      if (!studyTabs.tabs.some((tab) => tab.kind === 'sources' && tab.pane === 'main'))
        setShowPanel(true)
    }
  }
  const openCitedSource = (source: Source) => {
    setSourceOpen(source)
    setCitationSourceId(source.id)
  }
  const openAttachment = (source: Source) => {
    const previous = studyTabs.selected('right')
    sourceReturnTab.current =
      previous?.kind !== 'sources' && previous?.kind !== 'new' ? previous?.id || null : null
    setCitationSourceId(null)
    setSourceOpenState(source)
    studyTabs.dispatch({
      type: 'open',
      kind: 'sources',
      pane: source.kind === 'image' ? 'main' : 'right'
    })
    setShowPanel(true)
  }
  const openStudySource = (kind: StudyKind, source: Source) => {
    openCitedSource(source)
    sourceReturnTab.current = kind
  }
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null)
  const modelFlyout = useRef<HTMLDivElement>(null)
  const [flyoutTop, setFlyoutTop] = useState(0)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const [pickerPosition, setPickerPosition] = useState({ left: 0, bottom: 0 })
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepPickerOpen = () => {
    if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current)
    if (!pickerOpen) setHoveredFamily(null)
    const anchor = pickerAnchor.current?.getBoundingClientRect()
    if (anchor)
      setPickerPosition({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 354)),
        bottom: window.innerHeight - anchor.top + 6
      })
    setPickerOpen(true)
  }
  useEffect(
    () => () => {
      if (pickerCloseTimer.current) clearTimeout(pickerCloseTimer.current)
    },
    []
  )
  useLayoutEffect(() => {
    const flyout = modelFlyout.current
    const family = pickerAnchor.current?.querySelector('.model-families button.active')
    const popup = pickerAnchor.current?.querySelector('.model-popover')
    if (!flyout || !family || !popup) return
    const familyBounds = family.getBoundingClientRect()
    const popupBounds = popup.getBoundingClientRect()
    const height = flyout.getBoundingClientRect().height
    const center = familyBounds.top + familyBounds.height / 2
    setFlyoutTop(
      Math.max(8, Math.min(center - height / 2, window.innerHeight - height - 8)) - popupBounds.top
    )
  }, [pickerOpen, hoveredFamily, pickerPosition, snapshot?.models])
  const chatScroll = useRef<HTMLDivElement>(null)
  const followResponse = useRef(true)
  const lastScrollTop = useRef(0)
  const liveResponses = useRef<Record<string, string>>({})
  const composer = useRef<{ focus: () => void }>(null)
  const chatRef = useRef<string | null>(null)
  const initial = useRef(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const call = useCallback(async <T,>(request: Request): Promise<T | null> => {
    try {
      return await window.noctua.request<T>(request)
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : 'Could not complete this action.'
      )
      return null
    }
  }, [])
  const refresh = useCallback(async () => {
    const data = await call<Snapshot>({ action: 'snapshot' })
    if (data) setSnapshot(data)
    if (chatRef.current) {
      const id = chatRef.current
      const history = await call<Message[]>({ action: 'messages', conversationId: id })
      if (history && chatRef.current === id) setMessages(history)
    }
  }, [call])
  useEffect(() => {
    let scanning = false
    const scan = async () => {
      if (busyChat || scanning) return
      scanning = true
      try {
        await call({ action: 'models' })
        await refresh()
      } finally {
        scanning = false
      }
    }
    const interval = setInterval(
      () => {
        void scan()
      },
      5 * 60 * 1000
    )
    const onFocus = () => {
      void scan()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [busyChat, call, refresh])
  useEffect(() => {
    if (!initial.current) {
      initial.current = true
      void call<Snapshot>({ action: 'snapshot' }).then(async (data) => {
        if (!data) return
        setSnapshot(data)
        const saved = localStorage.getItem('noctua-current-chat')
        let chat: Conversation | undefined =
          data.conversations.find((chat) => chat.id === saved) || data.conversations[0]
        if (!chat) chat = (await call<Conversation>({ action: 'newChat' })) || undefined
        if (chat) setChatId(chat.id)
      })
    }
    const unsubscribe = window.noctua.onEvent((event: Event) => {
      if (event.type === 'changed') {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          void refresh()
        }, 100)
      }
      if (event.type === 'index')
        setSnapshot((data) => (data ? { ...data, index: event.status } : data))
      if (event.type === 'busy') {
        setBusyChat(event.conversationId)
        if (event.conversationId)
          setLiveWork((previous) => {
            const next = { ...previous }
            delete next[event.conversationId!]
            return next
          })
        if (!event.conversationId) {
          setStream('')
        }
      }
      if (event.type === 'delta') {
        liveResponses.current[event.conversationId] = event.text
        if (event.conversationId === chatRef.current) setStream(event.text)
      }
      if (event.type === 'work')
        setLiveWork((previous) => ({ ...previous, [event.conversationId]: event.work }))
      if (event.type === 'focus')
        setSnapshot((data) =>
          data
            ? {
                ...data,
                handoffs: [...data.handoffs.filter((h) => h.id !== event.handoff.id), event.handoff]
              }
            : data
        )
    })
    return () => {
      unsubscribe()
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [call, refresh])
  useEffect(() => {
    chatRef.current = chatId
    followResponse.current = true
    setStream(chatId ? liveResponses.current[chatId] || '' : '')
    setMessages([])

    setSearchResults(null)
    if (chatId) {
      localStorage.setItem('noctua-current-chat', chatId)
      void call<Message[]>({ action: 'messages', conversationId: chatId }).then((data) => {
        if (data && chatRef.current === chatId) setMessages(data)
      })
    }
  }, [chatId, call])
  useLayoutEffect(() => {
    const container = chatScroll.current
    if (container && followResponse.current) {
      container.scrollTop = container.scrollHeight
      lastScrollTop.current = container.scrollTop
    }
  }, [messages, stream, busyChat])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 7000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const chat = snapshot?.conversations.find((chat) => chat.id === chatId)
    const hasDraft = !!draft.trim()
    if (!chatId || !chat || hasDraft === !!chat.hasDraft) return
    void call({ action: 'updateTab', conversationId: chatId, hasDraft }).then(refresh)
  }, [draft, chatId, snapshot?.conversations, call, refresh])
  const run = async (label: string, request: Request) => {
    setWorking(label)
    const result = await call(request)
    await refresh()
    setWorking('')
    return result
  }
  const startChat = async () => {
    setMainView('chat')
    const chat = await call<Conversation>({ action: 'newChat' })
    if (chat) {
      setChatId(chat.id)
      setMessages([])
      setDraft('')
      await refresh()
    }
  }
  const connectVault = () => {
    void run('Connecting vault', { action: 'chooseVault' })
  }
  const [draggingFiles, setDraggingFiles] = useState(false)
  const attach = async (files?: File[]) => {
    if (!chatId) return
    setWorking('Reading resources')
    let sources: Source[] | null = null
    try {
      sources = files
        ? await window.noctua.attachFiles(chatId, files)
        : await call<Source[]>({ action: 'attach', conversationId: chatId })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not attach files.')
    }
    if (sources) {
      const unique = sources.filter(
        (source, index) => sources.findIndex((other) => other.path === source.path) === index
      )
      setSelectedSources((previous) => [...previous, ...unique].slice(0, 12))
      setPanel('sources')
      setShowPanel(true)
    }
    await refresh()
    setWorking('')
  }
  const send = async (forcedActivity?: ActivityKind, forcedText?: string) => {
    if (!chatId || busyChat || snapshot?.providerLogin.status === 'waiting') return
    const kind = forcedActivity || activity
    const text =
      forcedText ||
      (draft.trim() ? draft : '') ||
      (kind
        ? `Create a small set of ${kind} for the concepts in the selected sources or our current conversation.`
        : '')
    if (!text) return
    if (!snapshot?.models.find((model) => model.key === snapshot.settings.modelKey)?.ready) {
      setSettingsOpen(true)
      return
    }
    followResponse.current = true
    liveResponses.current[chatId] = ''
    setDraft('')
    setActivity(undefined)
    setReferences([])
    setSelectedSources((previous) =>
      previous.filter((source) => !source.scope.startsWith('attachments:'))
    )
    setStream('')

    setPickerOpen(false)
    if (kind) {
      setPanel(kind === 'flashcards' ? 'cards' : 'exercises')
      setShowPanel(true)
    }
    setBusyChat(chatId)
    const result = await call({
      action: 'send',
      conversationId: chatId,
      text,
      sourceIds: selectedSources.map((source) => source.id),
      activity: kind,
      references: references.map((reference) => ({
        ...reference,
        text: reference.text.slice(0, 8000)
      }))
    })
    if (result === null) {
      setDraft(text)
      setActivity(kind)
      setReferences(references)
      setSelectedSources(selectedSources)
    }
    setBusyChat(null)
    await refresh()
  }
  const toggleSource = (source: Source) =>
    setSelectedSources((previous) =>
      previous.some((item) => item.id === source.id)
        ? previous.filter((item) => item.id !== source.id)
        : [...previous, source].slice(0, 12)
    )
  const addDocument = async (relative: string) => {
    const sources = await call<Source[]>({ action: 'document', path: relative })
    if (sources)
      setSelectedSources((previous) =>
        previous.some((source) => source.path === relative && source.scope.startsWith('vault:'))
          ? previous.filter(
              (source) => source.path !== relative || !source.scope.startsWith('vault:')
            )
          : [...previous, ...sources].slice(0, 12)
      )
  }
  const openDocument = async (path: string, external = false) => {
    const sources = await call<Source[]>({ action: 'document', path })
    if (!sources?.[0]) return
    if (external) await call({ action: 'openOriginal', source: sources[0] })
    else setSourceOpen(sources[0])
  }
  const selectModel = async (model: ModelOption) => {
    if (!snapshot) return
    if (!model.ready) {
      setPickerOpen(false)
      setSettingsOpen(true)
      return
    }
    const updated = await call<Snapshot>({
      action: 'settings',
      settings: {
        ...snapshot.settings,
        modelKey: model.key,
        reasoningEffort: model.reasoningEfforts.includes(snapshot.settings.reasoningEffort || 'off')
          ? snapshot.settings.reasoningEffort || 'off'
          : model.reasoningEfforts[0]
      }
    })
    if (updated) setSnapshot(updated)
    setPickerOpen(false)
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void startChat()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key === 'Escape') {
        setSettingsOpen(false)
        setSourceOpen(null)
        setPickerOpen(false)
        setDeleteChat(null)
        setReferencePreview(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  const handoff = snapshot?.handoffs
    ?.filter(
      (h) =>
        h.conversationId === chatId &&
        (h.status === 'active' || (h.status === 'completed' && !h.resumedAt))
    )
    .at(-1)
  useEffect(() => {
    if (!handoff || openedHandoff.current === handoff.id) return
    openedHandoff.current = handoff.id
    studyDesk.current?.scrollTo({ top: 0 })
    setShowPanel(true)
    setFocusedActivity(null)
    setPanel(
      handoff.kind === 'exercise'
        ? 'exercises'
        : handoff.kind === 'cards'
          ? 'cards'
          : handoff.kind === 'guide'
            ? 'notes'
            : 'sources'
    )
    setSourceOpen(null)
    if (handoff.kind === 'source' && handoff.sourceId && chatId) {
      const id = chatId
      void call<Source[]>({
        action: 'resolveSources',
        conversationId: id,
        sourceIds: [handoff.sourceId]
      }).then((sources) => {
        if (chatRef.current === id && sources?.[0]) setSourceOpen(sources[0])
      })
    }
  }, [handoff?.id, chatId, call])
  if (!snapshot)
    return (
      <div className="boot">
        <img src={logo} alt="" />
        <LoaderCircle className="spin" size={20} />
        <span>Opening your workspace…</span>
        {toast && <p>{toast}</p>}
      </div>
    )
  const model = snapshot.models.find((model) => model.key === snapshot.settings.modelKey)
  const due = snapshot.cards.filter(
    (card) => new Date(card.scheduler.due).getTime() <= Date.now()
  ).length
  const modelOptions = modelsForPicker(snapshot.models).filter(
    (option) => option.ready || ['openai', 'openai-codex'].includes(option.provider)
  )
  const families = [...new Set(modelOptions.map(modelFamily))].sort((a, b) => {
    const order = ['Qwen', 'GPT']
    return (
      (order.includes(a) ? order.indexOf(a) : 2) - (order.includes(b) ? order.indexOf(b) : 2) ||
      a.localeCompare(b)
    )
  })
  const activeFamily = families.includes(hoveredFamily || '') ? hoveredFamily : null
  const familyModels = modelOptions.filter((option) => modelFamily(option) === activeFamily)
  const currentChat = snapshot.conversations.find((chat) => chat.id === chatId)
  const rootId = currentChat?.parentId || chatId
  const tabs = snapshot.conversations
    .filter((chat) => (chat.parentId || chat.id) === rootId)
    .sort((a, b) =>
      a.id === rootId ? -1 : b.id === rootId ? 1 : a.createdAt.localeCompare(b.createdAt)
    )
  const openTabs = tabs.filter((tab) => !tab.closed || tab.id === chatId)
  const newTab = async () => {
    if (!rootId) return null
    const tab = await call<Conversation>({ action: 'newChat', parentId: rootId })
    if (tab) {
      await refresh()
      setChatId(tab.id)
    }
    return tab
  }
  const chatTargets = tabs.map((tab, index) => ({
    id: tab.id,
    label: `Chat ${index + 1}`,
    title: `${tab.title}${tab.closed ? ' · reopen closed tab' : ''}`,
    disabled: !canAddReference(tab.id)
  }))
  const addToTab = async (selection: ChatReference, targetId: string | null): Promise<boolean> => {
    const tab = targetId ? tabs.find((tab) => tab.id === targetId) : await newTab()
    if (!tab) return false
    if (!canAddReference(tab.id)) {
      setToast('This tab already has twelve selected passages. Remove one before adding another.')
      return false
    }
    if (tab.closed) await call({ action: 'updateTab', conversationId: tab.id, closed: false })
    const reference = await call<ChatReference>({
      action: 'addChatReference',
      conversationId: tab.id,
      reference: selection
    })
    if (!reference) return false
    addReference(tab.id, reference)
    setToast(`Added to ${tab.title === 'New conversation' ? 'new chat' : tab.title}`)
    await refresh()
    return true
  }
  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast('Markdown copied.')
    } catch {
      setToast('Could not copy the message. Try selecting and copying its text.')
    }
  }
  const forkMessage = async (messageId: string) => {
    if (forkingMessage) return
    setForkingMessage(messageId)
    try {
      const result = await call<{ conversation: Conversation; reference: ChatReference }>({
        action: 'forkMessage',
        messageId
      })
      if (!result) return
      addReference(result.conversation.id, result.reference)
      setChatId(result.conversation.id)
      setMainView('chat')
      await refresh()
      setToast('Reply quoted in a new chat. Add your follow-up.')
      composer.current?.focus()
    } finally {
      setForkingMessage(null)
    }
  }
  const addConcept = async (id: string) => {
    if (!chatId) return
    const concept = snapshot.concepts.find((c) => c.id === id)
    if (
      concept &&
      (await addToTab(
        { id: crypto.randomUUID(), conceptId: id, text: concept.title, label: concept.title },
        chatId
      ))
    ) {
      setMainView('chat')
      composer.current?.focus()
    }
  }
  const openActivity = (kind: 'cards' | 'exercises', id: string) => {
    studyDesk.current?.scrollTo({ top: 0 })
    setFocusedActivity({ kind, id })
    setPanel(kind)
    setSourceOpen(null)
    setShowPanel(true)
  }
  const completeStep = async (resume = true, itemId?: string) => {
    if (!handoff || busyChat) return
    setMainView('chat')
    await call({ action: 'completeHandoff', handoffId: handoff.id, resume, itemId })
    await refresh()
  }
  const captureSelection = async (reference: ChatReference) => {
    if (!chatId) return false
    const result = await call({
      action: 'captureBit',
      conversationId: chatId,
      text: reference.text,
      origin: 'quotation',
      sourceId: reference.sourceId
    })
    if (result) {
      await refresh()
      setToast('Saved to your bits inbox.')
      return true
    }
    return false
  }
  const vaultName = snapshot.settings.vaultPath?.split(/[\/\\]/).at(-1)
  return (
    <div
      className={`app ${workspace.resizing ? 'resizing' : ''} ${!workspace.layout.showLeft ? 'navigation-hidden' : ''}`}
      style={workspace.style}
    >
      <aside className="sidebar" data-compact={!workspace.layout.showLeft}>
        <div className="mac-title-space">
          <button
            className="icon-button sidebar-close"
            title={workspace.layout.showLeft ? 'Hide navigation' : 'Show navigation'}
            aria-label={workspace.layout.showLeft ? 'Hide navigation' : 'Show navigation'}
            aria-expanded={workspace.layout.showLeft}
            onClick={() => workspace.setVisible('left', !workspace.layout.showLeft)}
          >
            {workspace.layout.showLeft ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>
        </div>
        <div className="brand">
          <img src={logo} alt="Noctua owl" />
          <div>
            <strong>Noctua</strong>
            <span>A place to understand.</span>
          </div>
        </div>
        <button
          className="new-chat map-navigation"
          title="Concept map"
          aria-label="Concept map"
          onClick={() => {
            setMapOpen(true)
            setMainView('map')
          }}
        >
          <Compass size={17} />
          <span className="nav-label">Concept map</span>
        </button>
        <button
          className="new-chat"
          title="New conversation"
          aria-label="New conversation"
          onClick={() => {
            void startChat()
          }}
        >
          <Plus size={17} />
          <span className="nav-label">New conversation</span>
          <span className="shortcut">⌘ N</span>
        </button>
        <div className="section-label">CONVERSATIONS</div>
        <div className="conversation-list">
          {snapshot.conversations
            .filter((chat) => !chat.parentId && !chat.temporary)
            .map((chat) => (
              <div
                key={chat.id}
                className={`conversation-row ${chat.id === rootId ? 'active' : ''}`}
              >
                <button
                  title={chat.title}
                  aria-label={chat.title}
                  onClick={() => {
                    setChatId(chat.id)
                    setMainView('chat')
                    if (chat.closed)
                      void call({ action: 'updateTab', conversationId: chat.id, closed: false })
                  }}
                >
                  <MessageSquare size={14} />
                  <span>{chat.title}</span>
                </button>
                <button
                  className="icon-button delete-conversation"
                  title="Delete conversation"
                  onClick={() => setDeleteChat(chat)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className="vault-button"
            title="Connect a vault"
            aria-label="Connect a vault"
            onClick={connectVault}
            disabled={!!working || snapshot.index.indexing}
          >
            <span className="vault-icon">
              <FolderOpen size={19} />
            </span>
            <span>
              <strong>{vaultName || 'Connect your vault'}</strong>
              <small>
                {vaultName
                  ? `${snapshot.index.documents} resources · Markdown & PDF`
                  : 'Bring your knowledge with you'}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button
            className="sidebar-settings"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={17} />
            <span className="nav-label">Settings</span>
            <span className="shortcut">⌘ ,</span>
          </button>
          <div className="sidebar-footer">
            <span className="status-dot" />
            Experimental · v0.1
          </div>
        </div>
      </aside>
      {workspace.layout.showLeft && (
        <ResizeHandle
          side="left"
          width={workspace.widths.left}
          max={workspace.limits.left}
          onResize={(width) => workspace.resize('left', width)}
          onDragging={workspace.setResizing}
        />
      )}
      <main className="chat-area">
        <div
          className="chat-tabs"
          role="tablist"
          aria-label="Conversation chats"
          onDragOver={allowStudyDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              event.currentTarget.classList.remove('tab-drop-target')
          }}
          onDrop={(event) => acceptStudyDrop(event, 'main', studyTabs, dispatchStudyTab)}
        >
          {openTabs.map((tab, index) => (
            <div
              className={`chat-tab ${tab.id === chatId && mainView === 'chat' ? 'active' : ''}`}
              key={tab.id}
            >
              {renamingTab?.id === tab.id ? (
                <input
                  autoFocus
                  aria-label="Tab name"
                  value={renamingTab.title}
                  onChange={(event) => setRenamingTab({ id: tab.id, title: event.target.value })}
                  onBlur={() => {
                    if (renamingTab.title.trim())
                      void run('Renaming tab', {
                        action: 'updateTab',
                        conversationId: tab.id,
                        title: renamingTab.title
                      })
                    setRenamingTab(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setRenamingTab(null)
                    }
                  }}
                />
              ) : (
                <button
                  role="tab"
                  aria-selected={tab.id === chatId && mainView === 'chat'}
                  title={`${tab.title}${tab.titleGeneration?.status === 'failed' ? ' · Automatic naming unavailable. Choose a naming model in Settings → Models, or rename this tab.' : tab.titleGeneration?.status === 'pending' ? ' · Naming chat…' : ''}`}
                  onClick={() => {
                    setChatId(tab.id)
                    setMainView('chat')
                  }}
                  onDoubleClick={() => setRenamingTab({ id: tab.id, title: tab.title })}
                >
                  {busyChat === tab.id && <LoaderCircle size={12} className="spin" />}
                  {tab.title === 'New conversation' ? `Chat ${tabs.indexOf(tab) + 1}` : tab.title}
                </button>
              )}
              {openTabs.length > 1 && (
                <button
                  className="icon-button"
                  aria-label={`Close tab ${tabs.indexOf(tab) + 1}`}
                  title="Close tab"
                  onClick={async () => {
                    await call({
                      action: 'updateTab',
                      conversationId: tab.id,
                      closed: true,
                      hasDraft: hasTabDraft(tab.id)
                    })
                    const data = await call<Snapshot>({ action: 'snapshot' })
                    if (!data) return
                    setSnapshot(data)
                    const closed = data.conversations.find((chat) => chat.id === tab.id)
                    if (closed && !closed.closed) return
                    if (!closed) forgetTabs([tab.id])
                    if (tab.id === chatId)
                      setChatId(openTabs.find((other) => other.id !== tab.id)!.id)
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {mapOpen && (
            <div className={`chat-tab ${mainView === 'map' ? 'active' : ''}`}>
              <button
                role="tab"
                aria-selected={mainView === 'map'}
                onClick={() => setMainView('map')}
              >
                <Compass size={14} />
                Concept map
              </button>
              <button
                className="icon-button"
                aria-label="Close concept map tab"
                onClick={() => {
                  setMapOpen(false)
                  setMainView('chat')
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}
          <StudyTabButtons
            state={studyTabs}
            pane="main"
            dispatch={dispatchStudyTab}
            sourceTitle={
              sourceOpen
                ? `${sourceOpen.title}${sourceOpen.kind === 'pdf' ? '.pdf' : ''}`
                : undefined
            }
          />
          <button
            className="icon-button"
            title="New tab"
            aria-label="New tab"
            onClick={() => studyTabs.dispatch({ type: 'new', pane: 'main' })}
          >
            <Plus size={16} />
          </button>
          {tabs.some((tab) => tab.closed) && (
            <select
              aria-label="Reopen closed tab"
              value=""
              onChange={(event) => {
                const id = event.target.value
                void call({ action: 'updateTab', conversationId: id, closed: false }).then(() => {
                  setChatId(id)
                  void refresh()
                })
              }}
            >
              <option value="">Closed tabs</option>
              {tabs
                .filter((tab) => tab.closed)
                .map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.title}
                  </option>
                ))}
            </select>
          )}
          {!showPanel && (
            <button
              className="icon-button reopen-desk"
              title="Show study desk"
              aria-label="Show study desk"
              onClick={() => setShowPanel(true)}
            >
              <PanelRightOpen size={19} />
            </button>
          )}
        </div>
        {mapOpen && (
          <div className="main-map-surface" hidden={mainView !== 'map'}>
            <ConceptMap
              snapshot={snapshot}
              chatId={chatId}
              call={call}
              refresh={refresh}
              onSource={openCitedSource}
              onAddConcept={addConcept}
              onOpenActivity={openActivity}
            />
          </div>
        )}
        <div className="chat-surface" hidden={mainView !== 'chat'}>
          <div
            className="chat-scroll"
            ref={chatScroll}
            onScroll={(event) => {
              const container = event.currentTarget
              const nearBottom =
                container.scrollHeight - container.scrollTop - container.clientHeight < 48
              if (container.scrollTop < lastScrollTop.current - 1) followResponse.current = false
              if (nearBottom) followResponse.current = true
              lastScrollTop.current = container.scrollTop
            }}
          >
            {!messages.length && !busyChat && (
              <div className="welcome">
                <div className="welcome-mark">
                  <img src={logo} alt="" />
                </div>
                <h1>
                  A place to
                  <br />
                  <em>understand.</em>
                </h1>
                <div className="start-options">
                  <button
                    onClick={() => {
                      setActivity(undefined)
                      setDraft('Help me understand ')
                      composer.current?.focus()
                    }}
                  >
                    <BookOpen size={20} />
                    <span>
                      <strong>Understand an idea</strong>
                      <small>Work through the why</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setActivity('exercises')
                      setDraft('Give me exercises on ')
                      composer.current?.focus()
                    }}
                  >
                    <Target size={20} />
                    <span>
                      <strong>Put it into practice</strong>
                      <small>Try, reason, get feedback</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setPanel('cards')
                      setShowPanel(true)
                      setActivity('flashcards')
                      setDraft('Create flashcards on ')
                      composer.current?.focus()
                    }}
                  >
                    <Layers size={20} />
                    <span>
                      <strong>Make it memorable</strong>
                      <small>Retrieve and revisit</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() => {
                      void attach()
                    }}
                  >
                    <FileText size={20} />
                    <span>
                      <strong>Explore a resource</strong>
                      <small>Bring a note or textbook</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </div>
                {!snapshot.settings.vaultPath && (
                  <button className="welcome-vault" onClick={connectVault}>
                    <FolderOpen size={15} />
                    Connect an Obsidian vault or Markdown folder
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="messages">
              {messages
                .filter((message) => !(busyChat === chatId && message.id === liveWork[chatId!]?.id))
                .map((message) => (
                  <article className={`message ${message.role} ${message.status}`} key={message.id}>
                    <div className="message-avatar">
                      {message.role === 'assistant' ? (
                        <img src={logo} alt="" />
                      ) : snapshot.settings.profile?.picture ? (
                        <img src={snapshot.settings.profile.picture} alt="Your profile" />
                      ) : (
                        <GraduationCap size={17} />
                      )}
                    </div>
                    <div className="message-body">
                      <div
                        className={`message-heading ${message.role === 'user' ? 'learner-heading' : ''}`}
                      >
                        <div className="message-meta">
                          <strong>{message.role === 'assistant' ? 'Noctua' : 'You'}</strong>
                          <span>
                            {message.role === 'assistant'
                              ? message.model?.split('/').slice(1).join('/')
                              : new Date(message.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                          </span>
                          {message.status !== 'complete' && (
                            <span className="message-status">{message.status}</span>
                          )}
                        </div>
                        {!!message.references?.length && (
                          <div className="message-references">
                            {message.references.map((reference) => (
                              <button
                                key={reference.id}
                                className="reference-chip"
                                onClick={() => setReferencePreview(reference)}
                              >
                                {reference.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="message-content">
                        {message.role === 'user' &&
                          message.sources.some(
                            (source) => source.kind === 'pdf' || source.kind === 'image'
                          ) && (
                            <div className="message-attachments">
                              {message.sources
                                .filter(
                                  (source, index, all) =>
                                    (source.kind === 'pdf' || source.kind === 'image') &&
                                    all.findIndex(
                                      (item) =>
                                        item.scope === source.scope && item.path === source.path
                                    ) === index
                                )
                                .map((source) => (
                                  <AttachmentPreview
                                    key={source.id}
                                    source={source}
                                    call={call}
                                    onOpen={openAttachment}
                                  />
                                ))}
                            </div>
                          )}
                        {message.work && <ActivityTrace work={message.work} />}
                        <SelectionToChat
                          origin={{ messageId: message.id, label: '' }}
                          chatTargets={chatTargets}
                          onAdd={addToTab}
                        >
                          <Markdown
                            text={message.text}
                            sources={message.sources}
                            onSource={openCitedSource}
                          />
                        </SelectionToChat>
                      </div>
                      <div className="message-actions">
                        <button
                          title="Copy Markdown"
                          aria-label="Copy message as Markdown"
                          onClick={() => void copyMessage(message.text)}
                        >
                          <Copy size={14} />
                        </button>
                        {message.role === 'assistant' && (
                          <button
                            title="Fork reply to a new chat"
                            aria-label="Fork reply to a new chat"
                            disabled={!!forkingMessage || !message.text.trim()}
                            onClick={() => void forkMessage(message.id)}
                          >
                            {forkingMessage === message.id ? (
                              <LoaderCircle size={14} className="spin" />
                            ) : (
                              <GitBranch size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              {busyChat === chatId && (
                <article className="message assistant">
                  <div className="message-avatar">
                    <img src={logo} alt="" />
                  </div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>Noctua</strong>
                      <span>
                        <LoaderCircle size={12} className="spin" />
                        Working
                      </span>
                    </div>
                    {liveWork[chatId!] && <ActivityTrace work={liveWork[chatId!]} />}
                    {stream ? (
                      <Markdown text={stream} />
                    ) : (
                      <div className="thinking-dots">
                        <i />
                        <i />
                        <i />
                      </div>
                    )}
                  </div>
                </article>
              )}
            </div>
          </div>
          <div className="composer-zone">
            <div
              className={`composer ${draggingFiles ? 'file-drop-active' : ''}`}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setDraggingFiles(true)
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDraggingFiles(false)
              }}
              onDropCapture={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return
                event.preventDefault()
                event.stopPropagation()
                setDraggingFiles(false)
                const files = Array.from(event.dataTransfer.files)
                if (files.length) void attach(files)
              }}
            >
              {draggingFiles && <div className="file-drop-hint">Drop PDFs or images to attach</div>}
              {!!references.length && (
                <div className="reference-chips">
                  {references.map((reference) => (
                    <span className="reference-chip" key={reference.id}>
                      <button title={reference.text} onClick={() => setReferencePreview(reference)}>
                        {reference.label}
                      </button>
                      <button
                        aria-label="Remove quoted passage"
                        onClick={() =>
                          setReferences((old) => old.filter((item) => item.id !== reference.id))
                        }
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {selectedSources.length > 0 && (
                <div className="selected-sources">
                  {selectedSources
                    .filter(
                      (source, index, all) =>
                        all.findIndex(
                          (item) => item.scope === source.scope && item.path === source.path
                        ) === index
                    )
                    .map((source) => (
                      <span
                        key={source.id}
                        className={
                          source.kind === 'pdf' || source.kind === 'image'
                            ? 'pdf-context'
                            : undefined
                        }
                      >
                        {source.kind === 'pdf' || source.kind === 'image' ? (
                          <AttachmentPreview source={source} call={call} onOpen={openAttachment} />
                        ) : (
                          <>
                            <FileText size={12} />
                            <button className="source-title" onClick={() => setSourceOpen(source)}>
                              {source.title}
                            </button>
                          </>
                        )}
                        <button
                          title="Remove from selected context"
                          onClick={() =>
                            setSelectedSources((previous) =>
                              previous.filter(
                                (item) => item.scope !== source.scope || item.path !== source.path
                              )
                            )
                          }
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  <button className="clear-context" onClick={() => setSelectedSources([])}>
                    Clear
                  </button>
                </div>
              )}
              {activity && (
                <div className="composer-tool-chip">
                  <span
                    className={`level-badge ${activity === 'flashcards' ? 'knowledge' : 'application'}`}
                  >
                    /{activity}
                    <button aria-label="Remove study tool" onClick={() => setActivity(undefined)}>
                      <X size={12} />
                    </button>
                  </span>
                </div>
              )}
              <MarkdownComposer
                ref={composer}
                value={draft}
                onChange={setDraft}
                documents={snapshot.documents}
                concepts={snapshot.concepts.filter((c) => !c.archived)}
                onConcept={(id) => {
                  void addConcept(id)
                }}
                onTool={setActivity}
                onDocument={(path) => {
                  void call<Source[]>({ action: 'document', path }).then((sources) => {
                    if (sources)
                      setSelectedSources((previous) =>
                        [
                          ...previous,
                          ...sources
                            .filter((source) => !previous.some((item) => item.id === source.id))
                            .slice(0, 3)
                        ].slice(0, 12)
                      )
                  })
                }}
                onSend={() => {
                  void send()
                }}
                prompt={
                  activity === 'flashcards'
                    ? 'What should these flashcards help you remember?'
                    : activity === 'exercises'
                      ? 'What would you like to practice?'
                      : 'Ask a question, bring an idea, or work through a problem…'
                }
              />
              <div className="composer-toolbar">
                <div className="composer-left">
                  <button
                    className="icon-button"
                    title="Attach Markdown, text, PDF, or image sources"
                    onClick={() => {
                      void attach()
                    }}
                    disabled={!!working}
                  >
                    <Paperclip size={18} />
                  </button>
                </div>
                <div className="composer-right">
                  <ReasoningPicker
                    levels={model?.reasoningEfforts || ['off']}
                    labels={model?.reasoningLabels}
                    disabled={
                      !!busyChat ||
                      !model ||
                      model.reasoningEfforts.length < 2 ||
                      snapshot.providerLogin.status === 'waiting'
                    }
                    value={
                      model?.reasoningEfforts.includes(snapshot.settings.reasoningEffort || 'off')
                        ? snapshot.settings.reasoningEffort || 'off'
                        : model?.reasoningEfforts[0] || 'off'
                    }
                    onChange={(effort) => {
                      void call<Snapshot>({
                        action: 'settings',
                        settings: { ...snapshot.settings, reasoningEffort: effort }
                      }).then((updated) => {
                        if (updated) setSnapshot(updated)
                      })
                    }}
                  />
                  <div
                    className="model-picker-wrap"
                    ref={pickerAnchor}
                    onMouseEnter={() => {
                      if (!busyChat && snapshot.providerLogin.status !== 'waiting') keepPickerOpen()
                    }}
                    onMouseLeave={() => {
                      pickerCloseTimer.current = setTimeout(() => setPickerOpen(false), 180)
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                        setPickerOpen(false)
                    }}
                  >
                    <button
                      className="model-button"
                      aria-label="Choose model"
                      aria-expanded={pickerOpen}
                      onClick={keepPickerOpen}
                      disabled={!!busyChat || snapshot.providerLogin.status === 'waiting'}
                    >
                      <span className={`model-dot ${model?.ready ? 'ready' : ''}`} />
                      {model?.name || 'Choose a model'}
                      <ChevronDown size={13} />
                    </button>
                    {pickerOpen && (
                      <div className="model-popover" style={pickerPosition}>
                        <div className="model-families" aria-label="Model families">
                          {families.map((family) => (
                            <button
                              key={family}
                              aria-expanded={activeFamily === family}
                              className={activeFamily === family ? 'active' : ''}
                              onMouseEnter={() => setHoveredFamily(family)}
                              onFocus={() => setHoveredFamily(family)}
                              onClick={() => setHoveredFamily(family)}
                            >
                              {family}
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                        {activeFamily && (
                          <div
                            className="model-list model-flyout"
                            ref={modelFlyout}
                            style={{ top: flyoutTop }}
                            aria-label={activeFamily ? `${activeFamily} models` : 'Models'}
                          >
                            {familyModels.map((option) => (
                              <button
                                key={option.key}
                                onClick={() => {
                                  void selectModel(option)
                                }}
                              >
                                <span>
                                  <strong
                                    title={
                                      option.local ? 'Local · Ollama / LM Studio' : option.provider
                                    }
                                  >
                                    {option.name}
                                  </strong>
                                  {!option.ready && <small>Connect in Settings</small>}
                                </span>
                                {option.key === model?.key && <Check size={15} />}
                              </button>
                            ))}
                          </div>
                        )}
                        {!modelOptions.length && (
                          <div className="picker-empty">Connect a model in Settings.</div>
                        )}
                        <button
                          className="picker-settings"
                          onClick={() => {
                            setSettingsOpen(true)
                            setPickerOpen(false)
                          }}
                        >
                          <Settings2 size={14} />
                          Providers
                        </button>
                      </div>
                    )}
                  </div>
                  {busyChat ? (
                    <button
                      className="send-button stop"
                      title="Stop response"
                      onClick={() => {
                        void call({ action: 'stop' })
                      }}
                    >
                      <Square size={15} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      title="Send message"
                      aria-label="Send message"
                      disabled={
                        (!draft.trim() && !activity) ||
                        !!working ||
                        snapshot.providerLogin.status === 'waiting'
                      }
                      onClick={() => {
                        void send()
                      }}
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {showPanel && (
        <ResizeHandle
          side="right"
          width={workspace.widths.right}
          max={workspace.limits.right}
          onResize={(width) => workspace.resize('right', width)}
          onDragging={workspace.setResizing}
        />
      )}
      <aside
        className="study-desk"
        data-collapsed={!showPanel}
        aria-hidden={!showPanel}
        inert={!showPanel}
      >
        <header className="desk-header">
          <button
            className="icon-button desk-close"
            title="Hide study desk"
            aria-label="Hide study desk"
            onClick={() => setShowPanel(false)}
          >
            <PanelRightClose size={19} />
          </button>
        </header>
        <div
          className="desk-tabs chat-tabs"
          role="tablist"
          aria-label="Study desk tabs"
          onDragOver={allowStudyDrop}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              event.currentTarget.classList.remove('tab-drop-target')
          }}
          onDrop={(event) => acceptStudyDrop(event, 'right', studyTabs, dispatchStudyTab)}
        >
          <StudyTabButtons
            state={studyTabs}
            pane="right"
            dispatch={dispatchStudyTab}
            sourceTitle={
              sourceOpen
                ? `${sourceOpen.title}${sourceOpen.kind === 'pdf' ? '.pdf' : ''}`
                : undefined
            }
          />
          <button
            className="icon-button"
            title="New study tab"
            aria-label="New study tab"
            onClick={() => studyTabs.dispatch({ type: 'new', pane: 'right' })}
          >
            <Plus size={16} />
          </button>
        </div>
      </aside>
      {(['main', 'right'] as const).map((pane) => {
        const tab = studyTabs.selected(pane)
        return (
          <section
            key={pane}
            className="study-surface desk-content"
            data-pane={pane}
            hidden={tab?.kind !== 'new' || (pane === 'right' && !showPanel)}
          >
            <StudyTabChooser
              pane={pane}
              onChoose={(kind) =>
                studyTabs.dispatch({ type: 'open', kind, pane, replace: tab?.id })
              }
              onChat={() => {
                if (tab) studyTabs.dispatch({ type: 'close', id: tab.id })
                setMainView('chat')
                void newTab()
              }}
            />
          </section>
        )
      })}
      {studyKinds.map((kind) => {
        const tab = studyTabs.tabs.find((tab) => tab.kind === kind)
        const visible = studyVisible(kind)
        return (
          <section
            key={kind}
            className={`study-surface ${kind === 'sources' && sourceOpen ? 'reading-source' : ''}`}
            data-pane={tab?.pane || 'right'}
            data-study-kind={kind}
            hidden={!visible}
            aria-label={`${kind === 'exercises' ? 'Practice' : kind} workspace`}
          >
            {handoff &&
              visible &&
              kind ===
                (handoff.kind === 'cards'
                  ? 'cards'
                  : handoff.kind === 'exercise'
                    ? 'exercises'
                    : handoff.kind === 'guide'
                      ? 'notes'
                      : 'sources') && (
                <div className="study-handoff" role="status">
                  <span className="eyebrow">TUTOR SUGGESTION</span>
                  <p>{handoff.reason}</p>
                  {handoff.quote && <blockquote>{handoff.quote}</blockquote>}
                  <div>
                    <button
                      className="primary-button"
                      disabled={!!busyChat}
                      onClick={() => {
                        void completeStep()
                      }}
                    >
                      {handoff.status === 'completed' ? 'Resume chat' : 'Done · continue chat'}
                    </button>
                    {handoff.status === 'active' && (
                      <button
                        className="text-button"
                        disabled={!!busyChat}
                        onClick={() => {
                          void completeStep(false)
                        }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              )}
            <div
              ref={visible ? studyDesk : undefined}
              className={`desk-content ${kind === 'sources' && sourceOpen ? 'reading-source' : ''}`}
            >
              {kind === 'sources' && sourceOpen && (
                <SourceReader
                  hasCitedPassage={sourceOpen.id === citationSourceId}
                  key={chatId}
                  onAdd={addToTab}
                  chatTargets={chatTargets}
                  source={sourceOpen}
                  call={call}
                  highlights={snapshot.highlights}
                  refresh={refresh}
                  onCapture={captureSelection}
                  focusQuote={
                    handoff?.kind === 'source' && handoff.sourceId === sourceOpen.id
                      ? handoff.quote
                      : undefined
                  }
                  onClose={closeSource}
                  onSource={openCitedSource}
                  onSelect={() => {
                    toggleSource(sourceOpen)
                    setSourceOpen(null)
                  }}
                />
              )}
              <div className="desk-panels" hidden={kind === 'sources' && !!sourceOpen}>
                {kind === 'sources' && (
                  <div className="sources-panel">
                    <div className="panel-title">
                      <div>
                        <h3>Your knowledge, close by.</h3>
                        <p>Select passages to guide this conversation.</p>
                      </div>
                    </div>
                    <form
                      className="search-field source-search"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (chatId && sourceQuery.trim()) {
                          setWorking('Searching')
                          void call<Source[]>({
                            action: 'search',
                            query: sourceQuery,
                            conversationId: chatId
                          }).then((results) => {
                            setSearchResults(results)
                            setWorking('')
                          })
                        }
                      }}
                    >
                      <Search size={15} />
                      <input
                        placeholder="Search your sources…"
                        value={sourceQuery}
                        onChange={(event) => {
                          setSourceQuery(event.target.value)
                          if (!event.target.value) setSearchResults(null)
                        }}
                        aria-label="Search sources"
                      />
                      {sourceQuery && (
                        <button type="submit" title="Search">
                          <ArrowUp size={14} />
                        </button>
                      )}
                    </form>
                    {searchResults !== null ? (
                      <>
                        <div className="section-label">{searchResults.length} PASSAGES FOUND</div>
                        {searchResults.map((source) => (
                          <div
                            className={`source-result ${selectedSources.some((item) => item.id === source.id) ? 'selected' : ''}`}
                            key={source.id}
                          >
                            <button
                              className="source-result-heading"
                              onClick={() => setSourceOpen(source)}
                            >
                              <FileText size={15} />
                              <span>
                                <strong>{source.heading || source.title}</strong>
                                <small>
                                  {source.path}
                                  {source.page
                                    ? ` · p. ${source.page}`
                                    : ` · lines ${source.startLine}–${source.endLine}`}
                                </small>
                              </span>
                            </button>
                            <p>{source.text.slice(0, 180)}…</p>
                            <button className="text-button" onClick={() => toggleSource(source)}>
                              {selectedSources.some((item) => item.id === source.id) ? (
                                <>
                                  <Check size={12} />
                                  Selected
                                </>
                              ) : (
                                <>
                                  <Plus size={12} />
                                  Use in chat
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                        {!searchResults.length && (
                          <p className="empty-text">
                            Try the name of a concept or a phrase from a source.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {!!snapshot.attachments[chatId || '']?.length && (
                          <>
                            <div className="section-label">ATTACHED TO THIS CHAT</div>
                            {snapshot.attachments[chatId!].map((source) => (
                              <div className="document-row" key={source.id}>
                                <button onClick={() => setSourceOpen(source)}>
                                  <span className="file-icon">
                                    <FileText size={16} />
                                  </span>
                                  <span>
                                    <strong>{source.title.replace(/^[a-f0-9]{8}-/, '')}</strong>
                                    <small>
                                      {source.kind.toUpperCase()} · available for retrieval
                                    </small>
                                  </span>
                                </button>
                                <button
                                  className="icon-button"
                                  title="Use attachment in chat"
                                  onClick={() => toggleSource(source)}
                                >
                                  {selectedSources.some((item) => item.id === source.id) ? (
                                    <Check size={15} />
                                  ) : (
                                    <Plus size={15} />
                                  )}
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                        <div className="section-label">
                          {vaultName ? vaultName.toUpperCase() : 'YOUR VAULT'}
                        </div>
                        {snapshot.documents.length ? (
                          <div className="document-list">
                            {snapshot.documents.map((document) => (
                              <div
                                key={document.path}
                                className={`document-row ${selectedSources.some((source) => source.path === document.path && source.scope.startsWith('vault:')) ? 'selected' : ''}`}
                              >
                                <button
                                  onClick={() => {
                                    void openDocument(document.path)
                                  }}
                                >
                                  <span className="file-icon">
                                    <FileText size={16} />
                                  </span>
                                  <span>
                                    <strong>{document.title}</strong>
                                    <small>{document.path}</small>
                                  </span>
                                </button>
                                <button
                                  className="icon-button"
                                  title="Open source in Obsidian"
                                  aria-label={`Open ${document.title} in Obsidian`}
                                  onClick={() => {
                                    void openDocument(document.path, true)
                                  }}
                                >
                                  <ExternalLink size={14} />
                                </button>
                                <button
                                  className="icon-button"
                                  title="Select note"
                                  onClick={() => {
                                    void addDocument(document.path)
                                  }}
                                >
                                  {selectedSources.some(
                                    (source) =>
                                      source.path === document.path &&
                                      source.scope.startsWith('vault:')
                                  ) ? (
                                    <Check size={15} />
                                  ) : (
                                    <Plus size={15} />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-resource">
                            <div className="empty-icon">
                              <FolderOpen size={29} strokeWidth={1.3} />
                            </div>
                            <h3>A home for what you know.</h3>
                            <p>
                              Connect your vault to ask questions
                              <br />
                              and build activities from your notes.
                            </p>
                            <button className="secondary-button" onClick={connectVault}>
                              Connect a vault
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                        <button
                          className="attach-resource"
                          onClick={() => {
                            void attach()
                          }}
                          disabled={!!working}
                        >
                          <Plus size={15} />
                          Add a PDF, Markdown, or text source
                        </button>
                      </>
                    )}
                    <form
                      className="web-import"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!chatId || !webUrl.trim()) return
                        setWorking('Importing resource')
                        void call<Source[]>({
                          action: 'importWeb',
                          conversationId: chatId,
                          url: webUrl.trim()
                        }).then(async (sources) => {
                          if (sources?.[0]) {
                            setSourceOpen(sources[0])
                            setWebUrl('')
                          }
                          await refresh()
                          setWorking('')
                        })
                      }}
                    >
                      <label>
                        Import a PDF or text link
                        <input
                          type="url"
                          aria-label="Resource URL"
                          placeholder="https://…/paper.pdf"
                          value={webUrl}
                          onChange={(event) => setWebUrl(event.target.value)}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        disabled={!!working || !webUrl.trim()}
                        type="submit"
                      >
                        Import resource
                      </button>
                    </form>
                    {snapshot.settings.vaultPath && (
                      <div className="index-card">
                        <div>
                          <span
                            className={`status-dot ${snapshot.index.indexing ? 'indexing' : ''}`}
                          />
                          <strong>
                            {snapshot.index.indexing
                              ? 'Updating your index'
                              : snapshot.index.mode === 'semantic'
                                ? 'Semantic retrieval ready'
                                : snapshot.index.mode === 'partial'
                                  ? 'Partial semantic index'
                                  : 'Text search ready'}
                          </strong>
                          <button
                            className="icon-button"
                            title="Refresh vault index"
                            disabled={snapshot.index.indexing || !!working}
                            onClick={() => {
                              void run('Indexing', { action: 'index' })
                            }}
                          >
                            <RefreshCw
                              size={14}
                              className={snapshot.index.indexing ? 'spin' : ''}
                            />
                          </button>
                        </div>
                        <button
                          className="text-button"
                          disabled={snapshot.index.indexing || !!working}
                          onClick={() => {
                            void run('Indexing', { action: 'index' })
                          }}
                        >
                          <RefreshCw size={14} />
                          Chunk & cache notes
                        </button>
                        <p>
                          {snapshot.index.chunks} passages · {snapshot.index.vectors} cached vectors
                        </p>
                        <small>{snapshot.index.message}</small>
                      </div>
                    )}
                  </div>
                )}
                {kind === 'cards' && chatId && (
                  <CardsPanel
                    key={chatId}
                    onAdd={addToTab}
                    chatTargets={chatTargets}
                    active={visible && !referencePreview}
                    snapshot={snapshot}
                    chatId={chatId}
                    call={call}
                    refresh={refresh}
                    onGenerate={() => {
                      void send('flashcards')
                    }}
                    onSource={(source) => openStudySource('cards', source)}
                    busy={!!busyChat}
                    notify={setToast}
                    initialFront={cardDraft?.front}
                    initialBack={cardDraft?.back}
                    initialConceptId={cardDraft?.conceptId}
                    onDraftOpened={() => setCardDraft(null)}
                    focusedId={
                      focusedActivity?.kind === 'cards'
                        ? focusedActivity.id
                        : handoff?.kind === 'cards'
                          ? handoff.itemIds.find((id) => !handoff.completedItemIds?.includes(id))
                          : undefined
                    }
                    onActivityDone={
                      handoff?.kind === 'cards' && handoff.status === 'active' && !focusedActivity
                        ? (id) => {
                            if (handoff.itemIds.includes(id)) void completeStep(true, id)
                          }
                        : undefined
                    }
                  />
                )}
                {kind === 'exercises' && chatId && (
                  <ExercisesPanel
                    chatId={chatId}
                    key={chatId}
                    onAdd={addToTab}
                    chatTargets={chatTargets}
                    snapshot={snapshot}
                    call={call}
                    refresh={refresh}
                    onGenerate={() => {
                      void send('exercises')
                    }}
                    onSource={(source) => openStudySource('exercises', source)}
                    busy={!!busyChat}
                    focusedId={
                      focusedActivity?.kind === 'exercises'
                        ? focusedActivity.id
                        : handoff?.kind === 'exercise'
                          ? handoff.itemIds[0]
                          : undefined
                    }
                    onActivityDone={
                      handoff?.kind === 'exercise' &&
                      handoff.status === 'active' &&
                      !focusedActivity
                        ? (id) => {
                            if (handoff.itemIds.includes(id)) void completeStep()
                          }
                        : undefined
                    }
                  />
                )}
                {kind === 'notes' && chatId && (
                  <StudyPanels
                    key={chatId}
                    snapshot={snapshot}
                    chatId={chatId}
                    call={call}
                    refresh={refresh}
                    onSource={(source) => openStudySource('notes', source)}
                    notify={setToast}
                    onOpenActivity={openActivity}
                    onCreateCard={(text, conceptId) => {
                      setCardDraft({ front: '', back: text, conceptId: conceptId || null })
                      setPanel('cards')
                      setShowPanel(true)
                    }}
                  />
                )}
              </div>
            </div>
          </section>
        )
      })}
      {referencePreview && (
        <div className="modal-backdrop" onClick={() => setReferencePreview(null)}>
          <div className="modal excerpt-dialog" onClick={(event) => event.stopPropagation()}>
            <h2>{referencePreview.label}</h2>
            <blockquote>{referencePreview.text}</blockquote>
            {referencePreview.context && (
              <details>
                <summary>Source context included</summary>
                <blockquote>{referencePreview.context.text}</blockquote>
                {referencePreview.context.note && (
                  <p className="small-note">{referencePreview.context.note}</p>
                )}
              </details>
            )}
            {referencePreview.revision && (
              <p className="small-note">
                Selected revision {referencePreview.revision.slice(0, 10)}
              </p>
            )}
            {referencePreview.source && (
              <button
                className="text-button"
                onClick={() => {
                  openCitedSource(referencePreview.source!)
                  setReferencePreview(null)
                }}
              >
                Open source
              </button>
            )}
            <button className="secondary-button" onClick={() => setReferencePreview(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsDialog
          snapshot={snapshot}
          call={call}
          refresh={refresh}
          onClose={() => setSettingsOpen(false)}
          onConnect={connectVault}
        />
      )}
      {deleteChat && (
        <div className="modal-backdrop" onClick={() => setDeleteChat(null)}>
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Delete this conversation?</h2>
            <p>
              “{deleteChat.title}” and all its tabs will be removed from your chat history. Cards,
              exercises, and learning evidence remain in your study desk.
            </p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setDeleteChat(null)}>
                Keep conversation
              </button>
              <button
                className="danger-button"
                onClick={async () => {
                  const deleting = deleteChat.id
                  const result = await call({ action: 'deleteChat', conversationId: deleting })
                  if (!result) return
                  forgetTabs(
                    snapshot.conversations
                      .filter((tab) => tab.id === deleting || tab.parentId === deleting)
                      .map((tab) => tab.id)
                  )
                  setDeleteChat(null)
                  if (deleting === rootId || deleting === chatId) await startChat()
                  else await refresh()
                }}
              >
                Delete conversation
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button className="icon-button" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
