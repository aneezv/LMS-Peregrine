function extractDriveFileId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  // https://drive.google.com/file/d/<id>/view
  const filePathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (filePathMatch?.[1]) return filePathMatch[1]

  // https://drive.google.com/open?id=<id> or ...?id=<id>
  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idQueryMatch?.[1]) return idQueryMatch[1]

  return null
}

/** Convert Google Drive share links into direct preview-friendly image URLs. */
export function toRenderableImageUrl(url: string | null | undefined, size = 1200): string {
  const raw = url?.trim()
  if (!raw) return ''

  const isDrive =
    raw.includes('drive.google.com') ||
    raw.includes('docs.google.com')

  if (!isDrive) return raw

  const fileId = extractDriveFileId(raw)
  if (!fileId) return raw

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`
}
