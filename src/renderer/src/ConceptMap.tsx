import { createPortal } from 'react-dom'
import { ConceptsPanel } from './Panels'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Edit3,
  FileText,
  Focus,
  GitBranch,
  List,
  LoaderCircle,
  MessageSquarePlus,
  Minus,
  Network,
  Plus,
  Search,
  X
} from 'lucide-react'
import type {
  Concept,
  ConceptEdge,
  LearningConcept,
  Level,
  Request,
  Snapshot,
  Source
} from '../../shared/types'
import { levels } from '../../shared/types'
import { Markdown } from './Markdown'
import './ecosystem.css'

type Call = <T = unknown>(request: Request) => Promise<T | null>
type Point = { x: number; y: number }
const relations: Record<ConceptEdge['relation'], string> = {
  'part-of': 'part of',
  prerequisite: 'prerequisite for',
  explains: 'explains',
  'applies-to': 'applies to',
  'contrasts-with': 'contrasts with',
  'analogous-to': 'analogous to'
}
const definitions: Record<Level, string> = {
  unknown: 'Substantial gaps observed',
  knowledge: 'Retrieve relevant information',
  comprehension: 'Explain meaning and relationships',
  application: 'Use ideas on relevant problems',
  transfer: 'Adapt ideas to substantially changed contexts'
}
function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}
function titleLines(title: string) {
  const words = title.split(/\s+/),
    lines: string[] = []
  for (const word of words) {
    if (!lines.length || (lines[lines.length - 1] + ' ' + word).length > 23) lines.push(word)
    else lines[lines.length - 1] += ' ' + word
  }
  return lines.length > 2 ? [lines[0], `${lines[1].slice(0, 20)}…`] : lines
}
function layout(ids: string[], selectedId: string | null): Record<string, Point> {
  const ordered =
    selectedId && ids.includes(selectedId)
      ? [selectedId, ...ids.filter((id) => id !== selectedId)]
      : ids
  return Object.fromEntries(
    ordered.map((id, index) => {
      if (index === 0) return [id, { x: 500, y: 355 }]
      const ring = Math.floor((index - 1) / 7),
        count = Math.min(7, ordered.length - 1 - ring * 7)
      const angle = (((index - 1) % 7) * Math.PI * 2) / count - Math.PI / 2
      return [
        id,
        {
          x: 500 + Math.cos(angle) * (275 + ring * 210),
          y: 355 + Math.sin(angle) * (220 + ring * 165)
        }
      ]
    })
  )
}

export function ConceptMap({
  snapshot,
  chatId,
  call,
  refresh,
  onSource,
  onAddConcept,
  onOpenActivity
}: {
  snapshot: Snapshot
  chatId?: string | null
  call: Call
  refresh: () => Promise<void>
  onSource: (source: Source) => void
  onAddConcept: (id: string) => void | Promise<void>
  onOpenActivity?: (kind: 'cards' | 'exercises', id: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readStored('noctua-map-concept', null)
  )
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [listQuery, setListQuery] = useState('')
  const [neighborhood, setNeighborhood] = useState(true)
  const [positions, setPositions] = useState<Record<string, Point>>(() =>
    readStored('noctua-map-layout', {})
  )
  const [view, setView] = useState(() => readStored('noctua-map-camera', { x: 0, y: 0, z: 1 }))
  const [editing, setEditing] = useState<LearningConcept | 'new' | null>(null)
  const [editingEdge, setEditingEdge] = useState<ConceptEdge | 'new' | null>(null)
  const [status, setStatus] = useState('')
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{
    id: string | null
    x: number
    y: number
    point: Point
    scale: number
    moved: boolean
  } | null>(null)
  const concepts = snapshot.concepts.filter((concept) => !concept.archived)
  const selected = concepts.find((concept) => concept.id === selectedId) || concepts[0]
  const edges = snapshot.edges.filter((edge) => edge.status !== 'rejected')
  const activeEdge = edges.find((edge) => edge.id === edgeId)
  const selectedRelations = edges.filter(
    (edge) => edge.fromId === selected?.id || edge.toId === selected?.id
  )
  const matches = concepts.filter((concept) =>
    `${concept.title} ${concept.aliases?.join(' ') || ''} ${concept.description || ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  const visible =
    query || !neighborhood
      ? matches.slice(0, 35)
      : selected
        ? concepts
            .filter(
              (concept) =>
                concept.id === selected.id ||
                selectedRelations.some(
                  (edge) => edge.fromId === concept.id || edge.toId === concept.id
                )
            )
            .slice(0, 22)
        : []
  const visibleIds = visible.map((concept) => concept.id)
  const automatic = useMemo(
    () => layout(visibleIds, selected?.id || null),
    [visibleIds.join('|'), selected?.id]
  )
  const point = (id: string) => positions[id] || automatic[id] || { x: 500, y: 355 }
  const visibleEdges = edges.filter(
    (edge) => visibleIds.includes(edge.fromId) && visibleIds.includes(edge.toId)
  )
  useEffect(
    () => localStorage.setItem('noctua-map-concept', JSON.stringify(selectedId)),
    [selectedId]
  )
  useEffect(() => localStorage.setItem('noctua-map-layout', JSON.stringify(positions)), [positions])
  useEffect(() => localStorage.setItem('noctua-map-camera', JSON.stringify(view)), [view])
  const camera = useRef(view)
  camera.current = view
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const old = camera.current
      const z = Math.max(0.35, Math.min(2.5, old.z * Math.exp(-event.deltaY * 0.0015)))
      const matrix = element.getScreenCTM()
      if (!matrix) return
      const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      setView({ x: x - ((x - old.x) * z) / old.z, y: y - ((y - old.y) * z) / old.z, z })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    if (!listOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setListOpen(false)
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [listOpen])
  const fit = (resetPositions = false) => {
    const locations = visible.map((concept) =>
      resetPositions ? automatic[concept.id] : point(concept.id)
    )
    if (!locations.length) return setView({ x: 0, y: 0, z: 1 })
    const left = Math.min(...locations.map((location) => location.x)) - 130
    const right = Math.max(...locations.map((location) => location.x)) + 130
    const top = Math.min(...locations.map((location) => location.y)) - 85
    const bottom = Math.max(...locations.map((location) => location.y)) + 85
    const z = Math.max(0.2, Math.min(1.4, 1000 / (right - left), 710 / (bottom - top)))
    setView({ x: 500 - ((left + right) / 2) * z, y: 355 - ((top + bottom) / 2) * z, z })
  }
  useEffect(() => {
    if (visible.length > 8) fit()
  }, [visibleIds.join('|')])
  const select = (id: string) => {
    setSelectedId(id)
    setEdgeId(null)
  }
  const openMaterial = async (concept: LearningConcept) => {
    const known = [
      ...(concept.sources || []),
      ...snapshot.cards.flatMap((card) => card.sources),
      ...snapshot.exercises.flatMap((exercise) => exercise.sources),
      ...Object.values(snapshot.attachments).flat()
    ]
    const source = known.find(
      (item) =>
        concept.sourceIds?.includes(item.id) ||
        (item.scope === concept.scope &&
          item.path === concept.path &&
          (!concept.anchor || item.anchor === concept.anchor))
    )
    if (source) return onSource(source)
    if (concept.sourceIds?.length && chatId) {
      const found = await call<Source[]>({
        action: 'resolveSources',
        conversationId: chatId,
        sourceIds: concept.sourceIds.slice(0, 40)
      })
      if (found?.[0]) return onSource(found[0])
    }
    if (concept.path && concept.scope.startsWith('vault:')) {
      const found = await call<Source[]>({ action: 'document', path: concept.path })
      const material = found?.find((item) => item.anchor === concept.anchor) || found?.[0]
      if (material) onSource(material)
    }
  }
  return (
    <div className="concept-map-workspace">
      <div className="concept-map-heading">
        <div>
          <span className="eyebrow">YOUR KNOWLEDGE, CONNECTED</span>
          <h2>Concept map</h2>
          <p>Explore the ideas, their connections, and the work behind them.</p>
        </div>
        <button className="secondary-button" onClick={() => setEditing('new')}>
          <Plus size={14} />
          New concept
        </button>
      </div>
      <div className="map-toolbar">
        <label className="map-search">
          <Search size={14} />
          <input
            aria-label="Search concepts"
            placeholder="Find a concept…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="map-view-switch" role="group" aria-label="Concept view">
          <button title="Interactive map" aria-pressed={true} onClick={() => setListOpen(false)}>
            <Network size={15} />
          </button>
          <button title="Concept list" aria-expanded={listOpen} onClick={() => setListOpen(true)}>
            <List size={15} />
          </button>
        </div>
        <button
          className="secondary-button"
          onClick={() => setEditingEdge('new')}
          disabled={concepts.length < 2}
        >
          <GitBranch size={13} />
          Connect
        </button>
      </div>
      <div className="map-body">
        <div className="map-stage">
          {
            <>
              <div className="map-scope">
                <label>
                  <input
                    type="checkbox"
                    checked={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.checked)}
                  />
                  Focus on nearby ideas
                </label>
                <span>
                  {visible.length} concepts
                  {visible.length < (query || !neighborhood ? matches.length : concepts.length)
                    ? ' · choose a concept to explore further'
                    : ''}
                </span>
              </div>
              <svg
                ref={svg}
                className="concept-map-canvas"
                viewBox="0 0 1000 710"
                role="group"
                tabIndex={0}
                aria-label="Interactive concept map. Drag to move, scroll to zoom. Use the concept list for keyboard navigation."
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (['+', '=', '-'].includes(event.key)) {
                    event.preventDefault()
                    setView((old) => ({
                      ...old,
                      z: Math.max(0.35, Math.min(2.5, old.z * (event.key === '-' ? 0.85 : 1.15)))
                    }))
                  }
                  const direction = {
                    ArrowLeft: [30, 0],
                    ArrowRight: [-30, 0],
                    ArrowUp: [0, 30],
                    ArrowDown: [0, -30]
                  }[event.key]
                  if (direction) {
                    event.preventDefault()
                    setView((old) => ({ ...old, x: old.x + direction[0], y: old.y + direction[1] }))
                  }
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  const scale = event.currentTarget.getScreenCTM()?.a || 1
                  drag.current = {
                    id: null,
                    x: event.clientX,
                    y: event.clientY,
                    point: { x: view.x, y: view.y },
                    scale: 1 / scale,
                    moved: false
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  const state = drag.current
                  if (!state) return
                  const dx = (event.clientX - state.x) * state.scale,
                    dy = (event.clientY - state.y) * state.scale
                  if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true
                  if (state.id)
                    setPositions((old) => ({
                      ...old,
                      [state.id!]: {
                        x: state.point.x + dx / view.z,
                        y: state.point.y + dy / view.z
                      }
                    }))
                  else setView((old) => ({ ...old, x: state.point.x + dx, y: state.point.y + dy }))
                }}
                onPointerUp={() => {
                  drag.current = null
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
              >
                <defs>
                  <pattern id="map-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="#dce4d6" />
                  </pattern>
                  <marker
                    id="map-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="none" stroke="#9aac98" strokeWidth="1.2" />
                  </marker>
                </defs>
                <rect width="1000" height="710" fill="url(#map-dots)" />
                <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
                  {visibleEdges.map((edge) => {
                    const from = point(edge.fromId),
                      to = point(edge.toId),
                      angle = Math.atan2(to.y - from.y, to.x - from.x)
                    const x1 = from.x + Math.cos(angle) * 99,
                      y1 = from.y + Math.sin(angle) * 37,
                      x2 = to.x - Math.cos(angle) * 99,
                      y2 = to.y - Math.sin(angle) * 37
                    const text = relations[edge.relation],
                      middle = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
                      width = text.length * 6 + 18
                    return (
                      <g
                        key={edge.id}
                        className={`map-edge ${edge.status} ${edgeId === edge.id ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${concepts.find((concept) => concept.id === edge.fromId)?.title} ${text} ${concepts.find((concept) => concept.id === edge.toId)?.title}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setEdgeId(edge.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setEdgeId(edge.id)
                          }
                        }}
                      >
                        <path className="map-edge-hit" d={`M${x1},${y1} L${x2},${y2}`} />
                        <path
                          className="map-edge-line"
                          d={`M${x1},${y1} L${x2},${y2}`}
                          markerEnd={
                            ['contrasts-with', 'analogous-to'].includes(edge.relation)
                              ? undefined
                              : 'url(#map-arrow)'
                          }
                        />
                        <rect
                          x={middle.x - width / 2}
                          y={middle.y - 11}
                          width={width}
                          height="22"
                          rx="11"
                        />
                        <text x={middle.x} y={middle.y + 4} textAnchor="middle">
                          {text}
                        </text>
                      </g>
                    )
                  })}
                  {visible.map((concept) => {
                    const location = point(concept.id),
                      lines = titleLines(concept.title)
                    return (
                      <g
                        key={concept.id}
                        transform={`translate(${location.x - 98} ${location.y - 41})`}
                        className={`map-node ${concept.level || 'unassessed'} ${selected?.id === concept.id ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${concept.title}, ${concept.level ? `#${concept.level}` : 'not assessed'}`}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          if (event.button !== 0) return
                          const scale = svg.current!.getScreenCTM()?.a || 1
                          drag.current = {
                            id: concept.id,
                            x: event.clientX,
                            y: event.clientY,
                            point: location,
                            scale: 1 / scale,
                            moved: false
                          }
                          svg.current!.setPointerCapture(event.pointerId)
                          select(concept.id)
                        }}
                        onClick={() => select(concept.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            select(concept.id)
                          }
                        }}
                      >
                        <title>{concept.title}</title>
                        <rect className="map-node-paper" width="196" height="82" rx="13" />
                        <rect
                          className="map-node-accent"
                          width="4"
                          height="32"
                          x="0"
                          y="25"
                          rx="2"
                        />
                        {lines.map((line, index) => (
                          <text
                            className="map-node-title"
                            key={index}
                            x="16"
                            y={lines.length === 1 ? 33 : 25 + index * 17}
                          >
                            {line}
                          </text>
                        ))}
                        <circle className="map-level-dot" cx="20" cy="63" r="3" />
                        <text className="map-node-level" x="29" y="67">
                          {concept.level ? `#${concept.level}` : 'not assessed'}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
              {!visible.length && (
                <div className="map-empty">
                  <Network size={34} strokeWidth={1} />
                  <h3>{query ? 'No matching ideas yet.' : 'Make room for your ideas.'}</h3>
                  <p>
                    {query
                      ? 'Try a different name or alias.'
                      : 'Create a concept or connect a vault to begin.'}
                  </p>
                </div>
              )}
              <div className="map-zoom-controls">
                <button
                  title="Zoom out"
                  onClick={() => setView((old) => ({ ...old, z: Math.max(0.35, old.z / 1.2) }))}
                >
                  <Minus size={15} />
                </button>
                <span>{Math.round(view.z * 100)}%</span>
                <button
                  title="Zoom in"
                  onClick={() => setView((old) => ({ ...old, z: Math.min(2.5, old.z * 1.2) }))}
                >
                  <Plus size={15} />
                </button>
                <button title="Fit concepts in view" onClick={() => fit()}>
                  <Focus size={15} />
                </button>
                <button
                  title="Arrange concepts"
                  onClick={() => {
                    setPositions((old) =>
                      Object.fromEntries(
                        Object.entries(old).filter(([id]) => !visibleIds.includes(id))
                      )
                    )
                    fit(true)
                  }}
                >
                  <Network size={15} />
                </button>
              </div>
            </>
          }
        </div>
        <aside
          className="map-inspector"
          aria-label={activeEdge ? 'Connection details' : 'Selected concept details'}
        >
          {activeEdge ? (
            <>
              <div className="map-inspector-header">
                <span className="eyebrow">CONNECTION</span>
                <button
                  className="icon-button"
                  title="Back to concept"
                  onClick={() => setEdgeId(null)}
                >
                  <X size={15} />
                </button>
              </div>
              <h3>{relations[activeEdge.relation]}</h3>
              <div className="edge-endpoints">
                <button onClick={() => select(activeEdge.fromId)}>
                  {concepts.find((concept) => concept.id === activeEdge.fromId)?.title}
                </button>
                <span>→</span>
                <button onClick={() => select(activeEdge.toId)}>
                  {concepts.find((concept) => concept.id === activeEdge.toId)?.title}
                </button>
              </div>
              <Markdown text={activeEdge.rationale} />
              {activeEdge.context && <p className="small-note">Conditions: {activeEdge.context}</p>}
              <p className="edge-provenance">
                {activeEdge.status === 'proposed' ? 'Suggested connection' : 'Accepted connection'}{' '}
                ·{' '}
                {activeEdge.origin === 'model'
                  ? 'AI proposal'
                  : activeEdge.origin === 'source'
                    ? 'Source supported'
                    : 'Your connection'}
              </p>
              <p className="small-note">
                A connection in the material is separate from evidence that you can explain it.
              </p>
              {activeEdge.sources.map((source) => (
                <button className="map-material" key={source.id} onClick={() => onSource(source)}>
                  <FileText size={13} />
                  {source.title}
                </button>
              ))}
              <div className="map-inspector-actions">
                <button className="secondary-button" onClick={() => setEditingEdge(activeEdge)}>
                  <Edit3 size={13} />
                  Edit
                </button>
                {activeEdge.status === 'proposed' && (
                  <button
                    className="primary-button"
                    onClick={async () => {
                      await call({
                        action: 'decideEdge',
                        edgeId: activeEdge.id,
                        status: 'accepted'
                      })
                      await refresh()
                    }}
                  >
                    <Check size={13} />
                    Accept
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={async () => {
                    await call({ action: 'decideEdge', edgeId: activeEdge.id, status: 'rejected' })
                    setEdgeId(null)
                    await refresh()
                  }}
                >
                  Remove
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <div className="map-inspector-header">
                <span className="eyebrow">CONCEPT</span>
                <button
                  className="icon-button"
                  title="Edit concept"
                  onClick={() => setEditing(selected)}
                >
                  <Edit3 size={14} />
                </button>
              </div>
              <h3>{selected.title}</h3>
              {selected.description && <Markdown text={selected.description} />}
              <select
                className={`concept-level ${selected.level || 'unassessed'}`}
                aria-label={`Map level for ${selected.title}`}
                value={selected.level || ''}
                onChange={async (event) => {
                  if (event.target.value) {
                    await call({
                      action: 'level',
                      conceptId: selected.id,
                      level: event.target.value as Level
                    })
                    await refresh()
                  }
                }}
              >
                <option value="" disabled>
                  Not assessed
                </option>
                {levels.map((level) => (
                  <option key={level} value={level}>
                    #{level} · {definitions[level]}
                  </option>
                ))}
              </select>
              <button
                className="map-chat-action"
                onClick={() => {
                  void onAddConcept(selected.id)
                }}
              >
                <MessageSquarePlus size={15} />
                Add concept to chat<span>@</span>
              </button>
              {Boolean(selected.path || selected.sourceIds?.length) && (
                <button
                  className="map-material"
                  onClick={() => {
                    void openMaterial(selected)
                  }}
                >
                  <FileText size={14} />
                  <span>
                    {selected.path || 'Linked source'}
                    {selected.anchor ? ` · ${selected.anchor}` : ''}
                  </span>
                  <ChevronRight size={12} />
                </button>
              )}
              <div className="inspector-section">
                <h4>Evidence &amp; scope</h4>
                <div className="map-evidence-summary">
                  <span>
                    <strong>
                      {selected.evidence?.independentSuccesses ?? selected.independentSuccesses}
                    </strong>
                    independent successes
                  </span>
                  <span>
                    <strong>{selected.evidence?.assistedSuccesses ?? 0}</strong>assisted successes
                  </span>
                  <span>
                    <strong>
                      {selected.recall.reviewed}/{selected.recall.cards}
                    </strong>
                    cards reviewed
                  </span>
                </div>
                {selected.evidence?.lastObservedAt && (
                  <p className="small-note">
                    Last observed {new Date(selected.evidence.lastObservedAt).toLocaleDateString()}
                  </p>
                )}
                <p className="small-note">
                  Each observation covers only what the activity actually tested. Repeated tasks do
                  not establish wider coverage.
                </p>
                {selected.evidence?.facets.map((facet) => (
                  <div className="map-facet" key={facet.id}>
                    <strong>{facet.title}</strong>
                    <small>
                      {facet.observations
                        ? `${facet.independentSuccesses} independent · ${facet.assistedSuccesses} assisted · ${facet.gaps} gaps`
                        : 'Not assessed'}
                      {facet.lastObservedAt
                        ? ` · ${new Date(facet.lastObservedAt).toLocaleDateString()}`
                        : ''}
                    </small>
                    <span>{facet.levels.map((level) => `#${level}`).join(' · ')}</span>
                  </div>
                ))}
                {selected.evidence?.uncertainty.map((uncertainty) => (
                  <p className="small-note" key={uncertainty}>
                    {uncertainty}
                  </p>
                ))}
              </div>
              <div className="inspector-section">
                <h4>Connected work</h4>
                <p className="small-note">
                  {snapshot.cards.filter((card) => card.conceptId === selected.id).length} cards ·{' '}
                  {
                    snapshot.exercises.filter((exercise) => exercise.conceptId === selected.id)
                      .length
                  }{' '}
                  exercises · {selected.attempts} attempts
                </p>
                {snapshot.cards
                  .filter((card) => card.conceptId === selected.id)
                  .map((card) => (
                    <button
                      key={card.id}
                      className="map-material"
                      disabled={!onOpenActivity}
                      onClick={() => onOpenActivity?.('cards', card.id)}
                    >
                      <FileText size={12} />
                      <span>Card · {card.front.slice(0, 85)}</span>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                {snapshot.exercises
                  .filter((exercise) => exercise.conceptId === selected.id)
                  .map((exercise) => (
                    <button
                      key={exercise.id}
                      className="map-material"
                      disabled={!onOpenActivity}
                      onClick={() => onOpenActivity?.('exercises', exercise.id)}
                    >
                      <Edit3 size={12} />
                      <span>{exercise.title}</span>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                {selected.readiness && <p className="small-note">{selected.readiness.rationale}</p>}
              </div>
              <div className="inspector-section">
                <h4>Connections</h4>
                {selectedRelations.length ? (
                  selectedRelations.map((edge) => {
                    const otherId = edge.fromId === selected.id ? edge.toId : edge.fromId
                    return (
                      <button
                        className="map-connection-row"
                        key={edge.id}
                        onClick={() => setEdgeId(edge.id)}
                      >
                        <small>
                          {edge.fromId === selected.id ? '' : '← '}
                          {relations[edge.relation]}
                          {edge.fromId === selected.id ? ' →' : ''}
                          {edge.status === 'proposed' ? ' · suggested' : ''}
                        </small>
                        <strong>{concepts.find((concept) => concept.id === otherId)?.title}</strong>
                        <ChevronRight size={12} />
                      </button>
                    )
                  })
                ) : (
                  <p className="small-note">No connections recorded yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="map-inspector-placeholder">
              <Network size={28} strokeWidth={1.2} />
              <p>Select an idea to inspect its material and evidence.</p>
            </div>
          )}
        </aside>
      </div>
      <div className="map-footer">
        <span>Drag nodes to arrange · scroll to zoom · select a connection to inspect it</span>
        <button
          className="text-button"
          disabled={!visible.length}
          onClick={async () => {
            const nodeNames = Object.fromEntries(
              visible.map((concept, index) => [concept.id, `n${index}`])
            )
            const text = [
              'flowchart LR',
              ...visible.map(
                (concept) => `  ${nodeNames[concept.id]}["${concept.title.replace(/["\n]/g, ' ')}"]`
              ),
              ...visibleEdges.map(
                (edge) =>
                  `  ${nodeNames[edge.fromId]} -->|${relations[edge.relation]}| ${nodeNames[edge.toId]}`
              )
            ].join('\n')
            try {
              await navigator.clipboard.writeText(text)
              setStatus('Map copied as Mermaid.')
            } catch {
              setStatus('Could not access the clipboard.')
            }
          }}
        >
          Copy Mermaid
        </button>
      </div>
      {status && (
        <p className="map-status" role="status">
          {status}
        </p>
      )}
      {listOpen &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setListOpen(false)}>
            <div
              className="modal concept-list-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="All concepts"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-heading">
                <h2>All concepts</h2>
                <button
                  className="icon-button"
                  aria-label="Close concept list"
                  onClick={() => setListOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <label>
                Find a concept
                <input
                  autoFocus
                  value={listQuery}
                  onChange={(event) => setListQuery(event.target.value)}
                  placeholder="Search by name or note…"
                />
              </label>
              <div className="concept-list-content">
                <ConceptsPanel
                  snapshot={{
                    ...snapshot,
                    concepts: concepts.filter((concept) =>
                      `${concept.title} ${concept.path}`
                        .toLowerCase()
                        .includes(listQuery.toLowerCase())
                    )
                  }}
                  call={call}
                  refresh={refresh}
                  onSource={(source) => {
                    setListOpen(false)
                    onSource(source)
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
      {editing && (
        <ConceptEditor
          concept={editing}
          snapshot={snapshot}
          call={call}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null)
            select(id)
            await refresh()
          }}
        />
      )}
      {editingEdge && (
        <EdgeEditor
          edge={editingEdge}
          selectedId={selected?.id}
          concepts={concepts}
          call={call}
          onClose={() => setEditingEdge(null)}
          onSaved={async () => {
            setEditingEdge(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function ConceptEditor({
  concept,
  snapshot,
  call,
  onClose,
  onSaved
}: {
  concept: LearningConcept | 'new'
  snapshot: Snapshot
  call: Call
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const source = concept === 'new' ? undefined : concept
  const [title, setTitle] = useState(source?.title || ''),
    [description, setDescription] = useState(source?.description || ''),
    [aliases, setAliases] = useState(source?.aliases?.join(', ') || ''),
    [path, setPath] = useState(source?.path || ''),
    [facets, setFacets] = useState(source?.facets?.map((facet) => facet.title).join('\n') || ''),
    [desired, setDesired] = useState<Level | ''>(source?.desiredLevel || '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal concept-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CONCEPT</span>
            <h2>{source ? 'Refine the idea.' : 'An idea to connect.'}</h2>
          </div>
          <button className="icon-button" aria-label="Close concept editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Name
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          Meaning and scope
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="What belongs to this concept, and what does not?"
          />
        </label>
        <label>
          Other names
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="Comma separated aliases"
          />
        </label>
        <label>
          Related note
          <select value={path} onChange={(event) => setPath(event.target.value)}>
            <option value="">No note selected</option>
            {source?.path &&
              !snapshot.documents.some((document) => document.path === source.path) && (
                <option value={source.path}>{source.path}</option>
              )}
            {snapshot.documents.map((document) => (
              <option key={document.path} value={document.path}>
                {document.title} · {document.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Facets to explore · one per line
          <textarea
            rows={3}
            value={facets}
            onChange={(event) => setFacets(event.target.value)}
            placeholder="Important subtopics or capabilities; these stay unassessed until observed."
          />
        </label>
        <label>
          Depth you need
          <select
            value={desired}
            onChange={(event) => setDesired(event.target.value as Level | '')}
          >
            <option value="">Follow the current goal</option>
            {levels
              .filter((level) => level !== 'unknown')
              .map((level) => (
                <option key={level} value={level}>
                  #{level} · {definitions[level]}
                </option>
              ))}
          </select>
        </label>
        <p className="small-note">
          Creating or expanding a concept does not establish understanding.
        </p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={saving || !title.trim()}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<Concept>({
                  action: 'saveConcept',
                  concept: {
                    id: source?.id,
                    title,
                    description,
                    aliases: aliases
                      .split(',')
                      .map((alias) => alias.trim())
                      .filter(Boolean),
                    path,
                    scope: source?.scope,
                    anchor: source?.anchor || '',
                    desiredLevel: desired || null,
                    facets: facets
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map(
                        (item) =>
                          source?.facets?.find((facet) => facet.title === item) || {
                            id: crypto.randomUUID(),
                            title: item
                          }
                      )
                  }
                })
                if (result) await onSaved(result.id)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Save concept
          </button>
        </div>
      </div>
    </div>
  )
}

function EdgeEditor({
  edge,
  selectedId,
  concepts,
  call,
  onClose,
  onSaved
}: {
  edge: ConceptEdge | 'new'
  selectedId?: string
  concepts: LearningConcept[]
  call: Call
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const source = edge === 'new' ? undefined : edge
  const [fromId, setFromId] = useState(source?.fromId || selectedId || concepts[0]?.id || ''),
    [toId, setToId] = useState(
      source?.toId ||
        concepts.find((concept) => concept.id !== (selectedId || concepts[0]?.id))?.id ||
        ''
    ),
    [relation, setRelation] = useState<ConceptEdge['relation']>(source?.relation || 'explains'),
    [rationale, setRationale] = useState(source?.rationale || ''),
    [context, setContext] = useState(source?.context || '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal edge-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CONNECTION</span>
            <h2>How do the ideas connect?</h2>
          </div>
          <button className="icon-button" aria-label="Close connection editor" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          From
          <select value={fromId} onChange={(event) => setFromId(event.target.value)}>
            {concepts.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            value={relation}
            onChange={(event) => setRelation(event.target.value as ConceptEdge['relation'])}
          >
            {Object.entries(relations).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={toId} onChange={(event) => setToId(event.target.value)}>
            {concepts
              .filter((concept) => concept.id !== fromId)
              .map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Why this connection matters
          <textarea
            rows={4}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="Explain the relationship rather than simply linking similar words."
          />
        </label>
        <label>
          Conditions or limits
          <textarea
            rows={2}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="When is this prerequisite needed? Where does this analogy break down?"
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={saving || !fromId || !toId || fromId === toId || !rationale.trim()}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<ConceptEdge>({
                  action: 'saveEdge',
                  edge: {
                    id: source?.id,
                    fromId,
                    toId,
                    relation,
                    rationale,
                    context,
                    origin: source?.origin || 'learner',
                    status: source?.status || 'accepted',
                    sources: source?.sources || []
                  }
                })
                if (result) await onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? <LoaderCircle size={14} className="spin" /> : <GitBranch size={14} />}Save
            connection
          </button>
        </div>
      </div>
    </div>
  )
}
