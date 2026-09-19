export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/i,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function extractVimeoId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)
  return match?.[1] ?? null
}

export function isValidDemoVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  return Boolean(extractYouTubeId(url) || extractVimeoId(url))
}

export function isProbablyDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url.trim())
}
