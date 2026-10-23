import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorSelection, EditorState, StateField, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  WidgetType,
  type DecorationSet
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import katex from 'katex'
import { Markdown } from './Markdown'

class RenderedWidget extends WidgetType {
  private root?: Root
  constructor(
    readonly text: string,
    readonly from: number,
    readonly math = false,
    readonly display = false
  ) {
    super()
  }
  eq(other: RenderedWidget) {
    return (
      this.text === other.text &&
      this.from === other.from &&
      this.math === other.math &&
      this.display === other.display
    )
  }
  toDOM(view: EditorView) {
    const element = document.createElement(this.display ? 'div' : 'span')
    element.className = 'composer-rendered'
    element.setAttribute('aria-label', this.math ? `Formula: ${this.text}` : 'Rendered Markdown')
    element.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({
        selection: EditorSelection.cursor(this.from + (this.math ? (this.display ? 2 : 1) : 1)),
        scrollIntoView: true
      })
      view.focus()
    })
    if (this.math)
      katex.render(this.text, element, {
        displayMode: this.display,
        throwOnError: false,
        strict: false
      })
    else {
      this.root = createRoot(element)
      this.root.render(<Markdown text={this.text} />)
    }
    return element
  }
  destroy() {
    const root = this.root
    if (root) queueMicrotask(() => root.unmount())
  }
  ignoreEvent() {
    return true
  }
}

function decorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const code: { from: number; to: number }[] = []
  const replaced: { from: number; to: number }[] = []
  const raw = state.doc.toString()
  const formulas = Array.from(
    raw.matchAll(/(?<![\\$])(\$\$)([\s\S]+?)\$\$|(?<![\\$])(\$)([^$\n]+?)\$/g)
  )
  const active = (from: number, to: number) =>
    state.selection.ranges.some((range) =>
      range.empty ? range.head > from && range.head < to : range.from < to && range.to > from
    )
  const hide = (from: number, to: number) => {
    if (to > from) ranges.push(Decoration.replace({}).range(from, to))
  }
  syntaxTree(state).iterate({
    enter(node) {
      const { from, to, name } = node
      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'InlineCode')
        code.push({ from, to })
      if (name === 'Table' && !active(from, to)) {
        ranges.push(
          Decoration.replace({
            widget: new RenderedWidget(state.sliceDoc(from, to), from, false, true),
            block: true
          }).range(from, to)
        )
        replaced.push({ from, to })
        return false
      }
      if (
        formulas.some((match) => from >= match.index! && to <= match.index! + match[0].length) &&
        !code.some((range) => from >= range.from && to <= range.to)
      )
        return false
      const heading = /^ATXHeading([1-6])$/.exec(name)
      if (heading)
        ranges.push(
          Decoration.line({ class: `composer-h${heading[1]}` }).range(state.doc.lineAt(from).from)
        )
      const style: Record<string, string> = {
        StrongEmphasis: 'composer-bold',
        Emphasis: 'composer-italic',
        Strikethrough: 'composer-strike',
        InlineCode: 'composer-code',
        Link: 'composer-link',
        Blockquote: 'composer-quote'
      }
      if (style[name]) ranges.push(Decoration.mark({ class: style[name] }).range(from, to))
      if (name === 'FencedCode' || name === 'CodeBlock') {
        for (
          let number = state.doc.lineAt(from).number;
          number <= state.doc.lineAt(to).number;
          number++
        )
          ranges.push(
            Decoration.line({ class: 'composer-code-line' }).range(state.doc.line(number).from)
          )
      }
      if (['EmphasisMark', 'CodeMark', 'HeaderMark', 'QuoteMark'].includes(name)) hide(from, to)
      if (name === 'CodeInfo') hide(from, to)
      if (name === 'Link') {
        const raw = state.sliceDoc(from, to)
        const match = /^\[([^\]]+)\]\([^\n]+\)$/.exec(raw)
        if (match && !active(from, to)) {
          hide(from, from + 1)
          hide(from + 1 + match[1].length, to)
        }
      }
    }
  })
  for (const match of formulas) {
    const from = match.index!,
      to = from + match[0].length
    if (
      code.some((range) => from < range.to && to > range.from) ||
      replaced.some((range) => from < range.to && to > range.from) ||
      active(from, to)
    )
      continue
    const display = !!match[1]
    ranges.push(
      Decoration.replace({
        widget: new RenderedWidget(match[2] || match[4], from, true, display),
        block: display
      }).range(from, to)
    )
  }
  return Decoration.set(ranges, true)
}
const liveMarkdown = StateField.define<DecorationSet>({
  create: decorations,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection ? decorations(transaction.state) : value
  },
  provide: (field) => EditorView.decorations.from(field)
})

export function MarkdownComposer({
  value,
  onChange,
  onSend,
  prompt,
  documents,
  concepts = [],
  onTool,
  onDocument,
  onConcept,
  ref
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  prompt: string
  documents: { path: string; title: string }[]
  concepts?: { id: string; title: string; aliases?: string[] }[]
  onTool: (tool: 'flashcards' | 'exercises') => void
  onDocument: (path: string) => void
  onConcept?: (id: string) => void
  ref: Ref<{ focus: () => void }>
}) {
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const [query, setQuery] = useState<{
    kind: '/' | '@'
    text: string
    from: number
    to: number
  } | null>(null)
  const [highlight, setHighlight] = useState(0)
  const choices =
    query?.kind === '/'
      ? [
          {
            id: 'flashcards',
            label: 'Flashcards',
            detail: 'Create cards from your question and sources'
          },
          { id: 'exercises', label: 'Exercises', detail: 'Create problems to work through' }
        ].filter((item) => item.label.toLowerCase().includes(query.text.toLowerCase()))
      : query
        ? [
            ...concepts
              .filter((item) =>
                `${item.title} ${item.aliases?.join(' ') || ''}`
                  .toLowerCase()
                  .includes(query.text.toLowerCase())
              )
              .slice(0, 10)
              .map((item) => ({
                id: `concept:${item.id}`,
                label: item.title,
                detail: 'Concept · include its learning context'
              })),
            ...documents
              .filter((item) =>
                `${item.title} ${item.path}`.toLowerCase().includes(query.text.toLowerCase())
              )
              .slice(0, 20)
              .map((item) => ({ id: item.path, label: item.title, detail: item.path }))
          ]
        : []
  const choose = (index: number) => {
    const view = editor.current,
      item = choices[index]
    if (!view || !query || !item) return
    view.dispatch({
      changes: { from: query.from, to: query.to, insert: '' },
      selection: EditorSelection.cursor(query.from)
    })
    if (query.kind === '/') onTool(item.id as 'flashcards' | 'exercises')
    else if (item.id.startsWith('concept:')) onConcept?.(item.id.slice(8))
    else onDocument(item.id)
    setQuery(null)
    view.focus()
  }
  const callbacks = useRef({ onChange, onSend, query, choices, highlight, choose })
  callbacks.current = { onChange, onSend, query, choices, highlight, choose }
  useImperativeHandle(ref, () => ({ focus: () => editor.current?.focus() }), [])
  useEffect(() => {
    if (!container.current) return
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ base: markdownLanguage }),
          history(),
          liveMarkdown,
          EditorView.lineWrapping,
          placeholder(prompt),
          EditorView.contentAttributes.of({
            'aria-label': 'Message Noctua',
            role: 'textbox',
            'aria-multiline': 'true',
            spellcheck: 'true'
          }),
          keymap.of([
            {
              key: 'Enter',
              run: (view) => {
                if (view.composing) return false
                if (callbacks.current.query) {
                  callbacks.current.choose(callbacks.current.highlight)
                  return true
                }
                callbacks.current.onSend()
                return true
              }
            },
            {
              key: 'Shift-Enter',
              run: (view) => {
                view.dispatch(view.state.replaceSelection('\n'))
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main
              const line = update.state.doc.lineAt(cursor.head)
              const prefix = update.state.sliceDoc(line.from, cursor.head)
              const match = /(?:^|\s)([/@])([^/@\n]*)$/.exec(prefix)
              let node = syntaxTree(update.state).resolveInner(Math.max(0, cursor.head - 1))
              let code = false
              while (node) {
                if (['InlineCode', 'CodeBlock', 'FencedCode'].includes(node.name)) code = true
                if (!node.parent) break
                node = node.parent
              }
              setQuery(
                match && cursor.empty && !code
                  ? {
                      kind: match[1] as '/' | '@',
                      text: match[2],
                      from: cursor.head - match[2].length - 1,
                      to: cursor.head
                    }
                  : null
              )
              setHighlight(0)
            }
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            keydown(event) {
              const current = callbacks.current
              if (!current.query || event.isComposing) return false
              if (event.key === 'Escape') {
                setQuery(null)
                event.preventDefault()
                return true
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                setHighlight((index) =>
                  Math.max(
                    0,
                    Math.min(
                      current.choices.length - 1,
                      index + (event.key === 'ArrowDown' ? 1 : -1)
                    )
                  )
                )
                event.preventDefault()
                return true
              }
              if (event.key === 'Tab') {
                current.choose(current.highlight)
                event.preventDefault()
                return true
              }
              return false
            },
            blur() {
              setQuery(null)
            },
            copy(event, view) {
              const selection = view.state.selection.main
              if (selection.empty) return false
              event.clipboardData?.setData(
                'text/plain',
                view.state.sliceDoc(selection.from, selection.to)
              )
              event.preventDefault()
              return true
            }
          })
        ]
      })
    })
    editor.current = view
    return () => {
      editor.current = null
      view.destroy()
    }
  }, [prompt])
  useEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: EditorSelection.cursor(value.length)
      })
  }, [value])
  return (
    <div className="composer-editor-wrap">
      {query && (
        <div
          className="composer-suggestions"
          role="listbox"
          aria-label={query.kind === '/' ? 'Study tools' : 'Concepts and vault files'}
        >
          <small>{query.kind === '/' ? 'Study tools' : 'Concepts and vault files'}</small>
          {choices.length ? (
            choices.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </button>
            ))
          ) : (
            <p>
              {query.kind === '@' && !documents.length
                ? 'Connect and index a vault to link files.'
                : 'No matches'}
            </p>
          )}
        </div>
      )}
      <div className="markdown-composer" ref={container} />
    </div>
  )
}
