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
    lower.endsWith('.doc')
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
  return 'application/octet-stream'
}
