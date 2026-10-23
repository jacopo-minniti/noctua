import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  cardRows,
  parseCardCsv,
  maxCardCsvLength,
  type CardCsvOptions
} from '../../shared/card-csv'
import type { Request, Snapshot } from '../../shared/types'

export function CardImport({
  snapshot,
  chatId,
  call,
  onClose,
  onSaved
}: {
  snapshot: Snapshot
  chatId: string
  call: <T = unknown>(request: Request) => Promise<T | null>
  onClose: () => void
  onSaved: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('Pasted cards')
  const [options, setOptions] = useState<CardCsvOptions>({
    separator: '\t',
    header: false,
    frontColumn: 0,
    backColumn: 1
  })
  const [conceptId, setConceptId] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fileError, setFileError] = useState('')
  const preview = useMemo(() => {
    if (!text.trim()) return { rows: [], columns: [], error: '' }
    try {
      const records = parseCardCsv(text, options.separator)
      const columns = Array.from(
        { length: Math.min(100, Math.max(...records.map((row) => row.length), 2)) },
        (_, i) =>
          `${i + 1}${options.header && records[0]?.[i] ? ` · ${records[0][i].slice(0, 60)}` : ''}`
      )
      try {
        return { rows: cardRows(text, options), columns, error: '' }
      } catch (error) {
        return { rows: [], columns, error: (error as Error).message }
      }
    } catch (error) {
      return { rows: [], columns: [], error: (error as Error).message }
    }
  }, [text, options])
  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div
        className="modal card-editor card-import"
        role="dialog"
        aria-modal="true"
        aria-label="Add flashcards in batch"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">FLASHCARDS</span>
            <h2>Add cards in batch</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close card import"
            disabled={saving}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            disabled={saving}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setFileError('')
              if (file.size > maxCardCsvLength) {
                setFileError('Use a file smaller than 5 MB.')
                return
              }
              try {
                const value = await file.text()
                setText(value)
                setFileName(file.name)
                const candidates = [',', ';', '\t', '|']
                const separator = candidates
                  .map((separator) => {
                    try {
                      const rows = parseCardCsv(value, separator).slice(0, 10)
                      return {
                        separator,
                        score:
                          rows.length && rows.every((row) => row.length === rows[0].length)
                            ? rows[0].length
                            : 0
                      }
                    } catch {
                      return { separator, score: 0 }
                    }
                  })
                  .sort((a, b) => b.score - a.score)[0].separator
                const first = parseCardCsv(value, separator)[0] || []
                const question = first.findIndex((cell) =>
                  /^(front|question|prompt)$/i.test(cell.trim())
                )
                const answer = first.findIndex((cell) =>
                  /^(back|answer|response)$/i.test(cell.trim())
                )
                setOptions({
                  separator,
                  header: question >= 0 && answer >= 0,
                  frontColumn: question >= 0 ? question : 0,
                  backColumn: answer >= 0 ? answer : 1
                })
              } catch (error) {
                setFileError((error as Error).message)
              }
            }}
          />
        </label>
        <label>
          Or paste cards
          <textarea
            aria-label="Cards to import"
            rows={5}
            value={text}
            disabled={saving}
            placeholder={'Question\tAnswer\nAnother question\tAnother answer'}
            onChange={(event) => {
              setText(event.target.value)
              setFileName('Pasted cards')
              setFileError('')
            }}
          />
        </label>
        <div className="csv-options">
          <label>
            Separator
            <select
              aria-label="CSV separator"
              disabled={saving}
              value={
                [',', ';', '\t', '|'].includes(options.separator) ? options.separator : 'custom'
              }
              onChange={(event) =>
                setOptions({
                  ...options,
                  separator: event.target.value === 'custom' ? ':' : event.target.value
                })
              }
            >
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value={'\t'}>Tab</option>
              <option value="|">Pipe (|)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {![',', ';', '\t', '|'].includes(options.separator) && (
            <label>
              Custom separator
              <input
                aria-label="Custom separator"
                maxLength={1}
                value={options.separator}
                disabled={saving}
                onChange={(event) => setOptions({ ...options, separator: event.target.value })}
              />
            </label>
          )}
          <label className="csv-checkbox">
            <input
              type="checkbox"
              checked={options.header}
              disabled={saving}
              onChange={(event) => setOptions({ ...options, header: event.target.checked })}
            />
            First row is a header
          </label>
          {(['frontColumn', 'backColumn'] as const).map((key) => (
            <label key={key}>
              {key === 'frontColumn' ? 'Question column' : 'Answer column'}
              <select
                aria-label={key === 'frontColumn' ? 'Question column' : 'Answer column'}
                disabled={saving}
                value={options[key]}
                onChange={(event) => setOptions({ ...options, [key]: Number(event.target.value) })}
              >
                {(preview.columns.length ? preview.columns : ['1', '2']).map((column, i) => (
                  <option key={i} value={i}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          Concept for these cards
          <select
            disabled={saving}
            value={conceptId}
            onChange={(event) => setConceptId(event.target.value)}
          >
            <option value="">No concept assigned</option>
            {snapshot.concepts
              .filter(
                (concept) =>
                  !concept.archived &&
                  [snapshot.vaultScope, `attachments:${chatId}`].includes(concept.scope)
              )
              .map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.title}
                </option>
              ))}
          </select>
        </label>
        <label className="csv-checkbox">
          <input
            type="checkbox"
            checked={skipDuplicates}
            disabled={saving}
            onChange={(event) => setSkipDuplicates(event.target.checked)}
          />
          Skip identical question/answer pairs in this vault and batch
        </label>
        <p className="small-note">
          UTF-8 CSV. Markdown and LaTeX stay as written. Use double quotes around fields containing
          separators or newlines, and two quotes for a literal quote. Imports start as new cards,
          ready for recall.
        </p>
        {(fileError || preview.error) && <p role="alert">{fileError || preview.error}</p>}
        {!!preview.rows.length && (
          <div className="csv-preview">
            <strong>
              {preview.rows.length} cards · preview of first {Math.min(5, preview.rows.length)}
            </strong>
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Answer</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row) => (
                  <tr key={row.row}>
                    <td>{row.front}</td>
                    <td>{row.back}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary-button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={saving || !preview.rows.length || !!fileError}
            onClick={async () => {
              setSaving(true)
              try {
                const result = await call<{ imported: number; skipped: number }>({
                  action: 'importCards',
                  conversationId: chatId,
                  text,
                  fileName,
                  options,
                  conceptId: conceptId || null,
                  skipDuplicates
                })
                if (result)
                  await onSaved(
                    `${result.imported} cards added${result.skipped ? ` · ${result.skipped} duplicates skipped` : ''}.`
                  )
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Adding…' : `Add ${preview.rows.length} cards`}
          </button>
        </div>
      </div>
    </div>
  )
}
