/** Classroom-style attachment rules (server + client). */

export const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB per file
export const MAX_FILES_PER_SUBMISSION = 15

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  // Spreadsheets
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
])

export function isAllowedAssignmentMime(mime: string, fileName: string): boolean {
  if (mime && ALLOWED.has(mime)) return true
  const lower = fileName.toLowerCase()
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls')
  )
}

export function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  return 'application/octet-stream'
}
