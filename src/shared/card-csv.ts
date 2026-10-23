export interface CardCsvOptions {
  separator: string
  header: boolean
  frontColumn: number
  backColumn: number
}
export interface ParsedCardRow {
  front: string
  back: string
  row: number
}
export const maxCardCsvLength = 5_000_000

/** CSV quotes escape separators, newlines and doubled quotes; backslashes stay literal. */
export function parseCardCsv(text: string, separator: string): string[][] {
  if (text.length > maxCardCsvLength) throw new Error('Use a file smaller than 5 MB.')
  if (separator.length !== 1 || /["\r\n]/.test(separator))
    throw new Error('Choose a single separator other than a quote or newline.')
  text = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false
  const cell = () => {
    row.push(field)
    field = ''
    closed = false
  }
  const record = () => {
    cell()
    if (row.some((value) => value.trim())) rows.push(row)
    row = []
    if (rows.length > 10001) throw new Error('Import at most 10,000 cards at a time.')
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else field += char
    } else if (char === separator) cell()
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      record()
    } else if (char === '"' && !field && !closed) quoted = true
    else {
      if (closed || char === '"')
        throw new Error(`Invalid CSV quoting near record ${rows.length + 1}.`)
      field += char
    }
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.')
  record()
  return rows
}

export function cardRows(text: string, options: CardCsvOptions): ParsedCardRow[] {
  const { separator, header, frontColumn, backColumn } = options
  if (
    ![frontColumn, backColumn].every(
      (value) => Number.isInteger(value) && value >= 0 && value < 100
    )
  )
    throw new Error('Choose valid question and answer columns.')
  if (frontColumn === backColumn) throw new Error('Choose different question and answer columns.')
  const rows = parseCardCsv(text, separator)
  const result = rows.slice(header ? 1 : 0).map((values, index) => {
    const row = index + (header ? 2 : 1)
    const front = values[frontColumn]?.trim() || '',
      back = values[backColumn]?.trim() || ''
    if (!front || !back) throw new Error(`Record ${row} needs both a question and an answer.`)
    if (front.length > 6000 || back.length > 12000)
      throw new Error(
        `Record ${row} exceeds the question (6,000) or answer (12,000) character limit.`
      )
    return { front, back, row }
  })
  if (!result.length)
    throw new Error('No cards found. Check the separator, columns and header setting.')
  if (result.length > 10000) throw new Error('Import at most 10,000 cards at a time.')
  return result
}
