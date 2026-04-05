/**
 * Parse instructor-exported CSV for bulk MCQ import.
 * Expected headers (case-insensitive): Question Text, Correct Answer, Option A, Option B, ...
 */

export type ParsedQuizRow = {
  prompt: string
  options: { label: string; is_correct: boolean }[]
}

export type ParseQuizCsvResult = {
  questions: ParsedQuizRow[]
  warnings: string[]
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Split CSV text into rows; cells support "quoted, commas" */
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const flushField = () => {
    row.push(field)
    field = ''
  }
  const flushRow = () => {
    flushField()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      flushField()
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++
      flushRow()
    } else if (c === '\n') {
      flushRow()
    } else {
      field += c
    }
  }
  flushField()
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function resolveCorrectIndex(
  correctRaw: string,
  optionLabels: string[],
): { index: number | null; note?: string } {
  const t = correctRaw.trim()
  if (!t) return { index: null, note: 'empty correct answer' }

  if (/^[a-z]$/i.test(t)) {
    const ord = t.toUpperCase().charCodeAt(0) - 65
    if (ord >= 0 && ord < optionLabels.length) return { index: ord }
    return { index: null, note: `letter ${t.toUpperCase()} out of range for options` }
  }

  const lower = t.toLowerCase()
  for (let i = 0; i < optionLabels.length; i++) {
    if (optionLabels[i].trim().toLowerCase() === lower) return { index: i }
  }
  for (let i = 0; i < optionLabels.length; i++) {
    if (optionLabels[i].toLowerCase().includes(lower) || lower.includes(optionLabels[i].toLowerCase())) {
      return { index: i }
    }
  }

  return { index: null, note: 'could not match Correct Answer to an option' }
}

export function parseQuizCsv(text: string): ParseQuizCsvResult {
  const warnings: string[] = []
  const rows = splitCsvRows(text.trim().replace(/^\uFEFF/, ''))
  if (rows.length < 2) {
    warnings.push('Need a header row and at least one data row.')
    return { questions: [], warnings }
  }

  const headerCells = rows[0].map((c) => normalizeHeader(c))
  const qIdx = headerCells.findIndex((h) => h === 'question text' || h === 'question')
  const cIdx = headerCells.findIndex((h) => h === 'correct answer' || h === 'correct answer option')

  const optionIndices: { letter: string; idx: number }[] = []
  headerCells.forEach((h, idx) => {
    const m = /^option ([a-z])$/i.exec(h)
    if (m) optionIndices.push({ letter: m[1].toUpperCase(), idx })
  })
  optionIndices.sort((a, b) => a.letter.localeCompare(b.letter))

  if (qIdx < 0) {
    warnings.push('Missing column "Question Text".')
    return { questions: [], warnings }
  }
  if (cIdx < 0) {
    warnings.push('Missing column "Correct Answer".')
    return { questions: [], warnings }
  }
  if (optionIndices.length < 2) {
    warnings.push('Need at least two columns like "Option A", "Option B".')
    return { questions: [], warnings }
  }

  const questions: ParsedQuizRow[] = []

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const prompt = (cells[qIdx] ?? '').trim()
    const correctCell = (cells[cIdx] ?? '').trim()
    const optionLabels = optionIndices.map(({ idx }) => (cells[idx] ?? '').trim()).filter((lbl) => lbl.length > 0)

    if (!prompt) {
      warnings.push(`Row ${r + 1}: skipped (empty question).`)
      continue
    }
    if (optionLabels.length < 2) {
      warnings.push(`Row ${r + 1}: skipped (need at least two non-empty options).`)
      continue
    }

    const resolved = resolveCorrectIndex(correctCell, optionLabels)
    if (resolved.index === null) {
      warnings.push(
        `Row ${r + 1}: skipped (${resolved.note ?? 'invalid correct answer'}).`,
      )
      continue
    }

    const opts = optionLabels.map((label, i) => ({
      label,
      is_correct: i === resolved.index,
    }))
    questions.push({ prompt, options: opts })
  }

  return { questions, warnings }
}
