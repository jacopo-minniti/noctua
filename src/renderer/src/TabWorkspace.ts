import { useEffect, useState, type SetStateAction } from 'react'
import type { ActivityKind, ChatReference, Source } from '../../shared/types'
import type { Panel } from './Panels'
interface TabWorkspace {
  draft: string
  activity?: ActivityKind
  panel: Panel
  sourceOpen: Source | null
  selectedSources: Source[]
  references: ChatReference[]
}
const empty: TabWorkspace = {
  draft: '',
  panel: 'sources',
  sourceOpen: null,
  selectedSources: [],
  references: []
}
export function useTabWorkspace(chatId: string | null) {
  const [tabs, setTabs] = useState<Record<string, TabWorkspace>>(() => {
    try {
      return JSON.parse(localStorage.getItem('noctua-tab-workspaces') || '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    localStorage.setItem('noctua-tab-workspaces', JSON.stringify(tabs))
  }, [tabs])
  const state = chatId ? { ...empty, ...tabs[chatId] } : empty
  if (String(state.panel) === 'concepts') state.panel = 'sources'
  function setter<K extends keyof TabWorkspace>(key: K) {
    return (value: SetStateAction<TabWorkspace[K]>) => {
      if (!chatId) return
      setTabs((previous) => {
        const old = { ...empty, ...previous[chatId] }
        return {
          ...previous,
          [chatId]: {
            ...old,
            [key]:
              typeof value === 'function'
                ? (value as (old: TabWorkspace[K]) => TabWorkspace[K])(old[key])
                : value
          }
        }
      })
    }
  }
  const addReference = (id: string, reference: ChatReference) =>
    setTabs((previous) => {
      const old = { ...empty, ...previous[id] }
      return {
        ...previous,
        [id]: { ...old, references: [...old.references, reference].slice(0, 12) }
      }
    })
  return {
    ...state,
    setDraft: setter('draft'),
    setActivity: setter('activity'),
    setPanel: setter('panel'),
    setSourceOpen: setter('sourceOpen'),
    setSelectedSources: setter('selectedSources'),
    setReferences: setter('references'),
    addReference,
    hasTabDraft: (id: string) => !!tabs[id]?.draft?.trim(),
    forgetTabs: (ids: string[]) => {
      setTabs((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id)))
      )
      for (const id of ids)
        for (const prefix of ['noctua-review:', 'noctua-revealed:', 'noctua-exercise:'])
          localStorage.removeItem(prefix + id)
    },
    canAddReference: (id: string) => (tabs[id]?.references?.length || 0) < 12
  }
}
