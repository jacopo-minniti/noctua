import { useEffect, useState, type DragEvent } from 'react'
import {
  BookOpen,
  FileText,
  Layers,
  Plus,
  Target,
  X,
  PanelLeftOpen,
  PanelRightOpen,
  MessageSquare
} from 'lucide-react'

export const studyKinds = ['sources', 'cards', 'exercises', 'notes'] as const
export type StudyKind = (typeof studyKinds)[number]
export type Pane = 'main' | 'right'
export interface StudyTab {
  id: string
  kind: StudyKind | 'new'
  pane: Pane
}
export interface StudyTabsState {
  tabs: StudyTab[]
  main: string | null
  right: string | null
}
export type StudyTabsAction =
  | { type: 'new'; pane: Pane }
  | { type: 'open'; kind: StudyKind; pane?: Pane; replace?: string }
  | { type: 'select'; id: string }
  | { type: 'mainChat' }
  | { type: 'move'; id: string; pane: Pane }
  | { type: 'close'; id: string }
const blank = (pane: Pane): StudyTab => ({ id: `new-${pane}`, kind: 'new', pane })
export const emptyStudyTabs = (): StudyTabsState => ({
  tabs: [blank('right')],
  main: null,
  right: 'new-right'
})
export function updateStudyTabs(state: StudyTabsState, action: StudyTabsAction): StudyTabsState {
  let tabs = [...state.tabs],
    main = state.main,
    right = state.right
  if (action.type === 'mainChat') return { ...state, main: null }
  if (action.type === 'new') {
    const tab = tabs.find((t) => t.pane === action.pane && t.kind === 'new') || blank(action.pane)
    if (!tabs.some((t) => t.id === tab.id)) tabs.push(tab)
    if (action.pane === 'main') main = tab.id
    else right = tab.id
  } else if (action.type === 'open') {
    const existing = tabs.find((t) => t.kind === action.kind)
    const pane = action.pane || existing?.pane || 'right'
    tabs = tabs.filter((t) => t.id !== action.replace && t.id !== existing?.id)
    const tab = { id: action.kind, kind: action.kind, pane }
    tabs.push(tab)
    if (pane === 'main') main = tab.id
    else right = tab.id
  } else {
    const tab = tabs.find((t) => t.id === action.id)
    if (!tab) return state
    if (action.type === 'select') {
      if (tab.pane === 'main') main = tab.id
      else right = tab.id
    } else if (action.type === 'close') tabs = tabs.filter((t) => t.id !== tab.id)
    else {
      // Only activity tabs move; each pane owns its own empty chooser.
      if (tab.kind === 'new') return state
      tabs = tabs.map((t) => (t.id === tab.id ? { ...t, pane: action.pane } : t))
      if (action.pane === 'main') main = tab.id
      else right = tab.id
    }
  }
  if (!tabs.some((t) => t.pane === 'right')) tabs.push(blank('right'))
  if (!tabs.some((t) => t.id === main && t.pane === 'main')) main = null
  if (!tabs.some((t) => t.id === right && t.pane === 'right'))
    right = tabs.filter((t) => t.pane === 'right').at(-1)!.id
  return { tabs, main, right }
}
const storageKey = 'noctua-study-tabs-v1'
function readSaved(): Record<string, StudyTabsState> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return Object.fromEntries(
      Object.entries(saved).filter(([, value]) => {
        const state = value as StudyTabsState
        return (
          Array.isArray(state?.tabs) &&
          state.tabs.every(
            (t) =>
              t &&
              ['main', 'right'].includes(t.pane) &&
              [...studyKinds, 'new'].includes(t.kind) &&
              t.id === (t.kind === 'new' ? `new-${t.pane}` : t.kind)
          ) &&
          new Set(state.tabs.map((t) => t.id)).size === state.tabs.length &&
          (state.main === null ||
            state.tabs.some((t) => t.id === state.main && t.pane === 'main')) &&
          state.tabs.some((t) => t.id === state.right && t.pane === 'right')
        )
      })
    ) as Record<string, StudyTabsState>
  } catch {
    return {}
  }
}
export function useStudyTabs(chatId: string | null) {
  const [saved, setSaved] = useState(readSaved)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved))
    } catch {
      /* Layout remains usable without persistence. */
    }
  }, [saved])
  const state = chatId ? saved[chatId] || emptyStudyTabs() : emptyStudyTabs()
  const dispatch = (action: StudyTabsAction) => {
    if (chatId)
      setSaved((previous) => ({
        ...previous,
        [chatId]: updateStudyTabs(previous[chatId] || emptyStudyTabs(), action)
      }))
  }
  const selected = (pane: Pane) => state.tabs.find((t) => t.id === state[pane] && t.pane === pane)
  const forget = (ids: string[]) =>
    setSaved((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id)))
    )
  return { ...state, dispatch, selected, forget }
}
const labels = {
  sources: 'Sources',
  cards: 'Cards',
  exercises: 'Practice',
  notes: 'Notes',
  new: 'New tab'
}
const icons = { sources: FileText, cards: Layers, exercises: Target, notes: BookOpen, new: Plus }
const mime = 'application/x-noctua-study-tab'
export function acceptStudyDrop(
  event: DragEvent,
  pane: Pane,
  state: StudyTabsState,
  dispatch: (action: StudyTabsAction) => void
) {
  event.currentTarget.classList.remove('tab-drop-target')
  const id = event.dataTransfer.getData(mime)
  if (!state.tabs.some((t) => t.id === id && t.kind !== 'new')) return
  event.preventDefault()
  dispatch({ type: 'move', id, pane })
}
export function allowStudyDrop(event: DragEvent) {
  if (event.dataTransfer.types.includes(mime)) {
    event.preventDefault()
    event.currentTarget.classList.add('tab-drop-target')
    event.dataTransfer.dropEffect = 'move'
  }
}
export function StudyTabButtons({
  state,
  pane,
  dispatch,
  sourceTitle
}: {
  sourceTitle?: string
  state: StudyTabsState
  pane: Pane
  dispatch: (action: StudyTabsAction) => void
}) {
  return (
    <>
      {state.tabs
        .filter((t) => t.pane === pane)
        .map((tab) => {
          const Icon = icons[tab.kind]
          return (
            <div
              className={`chat-tab study-tab ${state[pane] === tab.id ? 'active' : ''}`}
              key={tab.id}
              draggable={tab.kind !== 'new'}
              onDragStart={(event) => {
                event.dataTransfer.setData(mime, tab.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
            >
              <button
                role="tab"
                aria-selected={state[pane] === tab.id}
                onClick={() => dispatch({ type: 'select', id: tab.id })}
              >
                <Icon size={14} />
                <span
                  className="study-tab-label"
                  title={tab.kind === 'sources' ? sourceTitle : undefined}
                >
                  {tab.kind === 'sources' && sourceTitle ? sourceTitle : labels[tab.kind]}
                </span>
              </button>
              {tab.kind !== 'new' && (
                <button
                  className="icon-button tab-move"
                  aria-label={`Move ${labels[tab.kind]} to ${pane === 'right' ? 'main workspace' : 'study desk'}`}
                  title={`Move to ${pane === 'right' ? 'main workspace' : 'study desk'}`}
                  onClick={() =>
                    dispatch({
                      type: 'move',
                      id: tab.id,
                      pane: pane === 'right' ? 'main' : 'right'
                    })
                  }
                >
                  {pane === 'right' ? <PanelLeftOpen size={12} /> : <PanelRightOpen size={12} />}
                </button>
              )}
              <button
                className="icon-button"
                aria-label={`Close ${labels[tab.kind]} study tab`}
                onClick={() => dispatch({ type: 'close', id: tab.id })}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
    </>
  )
}
export function StudyTabChooser({
  pane,
  onChoose,
  onChat
}: {
  pane: Pane
  onChoose: (kind: StudyKind) => void
  onChat: () => void
}) {
  return (
    <div className="study-tab-chooser">
      <h3>Open something to study</h3>
      <p>
        {pane === 'right'
          ? 'Keep it beside your chat, or drag its tab into the main workspace.'
          : 'Choose what to open in this tab.'}
      </p>
      <div className="study-choices">
        {pane === 'main' && (
          <button onClick={onChat}>
            <MessageSquare size={20} />
            <span>Chat</span>
          </button>
        )}
        {studyKinds.map((kind) => {
          const Icon = icons[kind]
          return (
            <button key={kind} onClick={() => onChoose(kind)}>
              <Icon size={20} />
              <span>{labels[kind]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
