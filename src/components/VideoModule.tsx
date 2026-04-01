'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

/** Fire completion when this many seconds remain (typical LMS “almost finished”). */
const END_SECONDS_THRESHOLD = 10

interface VideoModuleProps {
  moduleId: string
  contentUrl: string
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? match[1] : null
}

function isProbablyDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url.trim())
}

let ytApiLoading: Promise<void> | null = null

function ensureYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (!ytApiLoading) {
    ytApiLoading = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev?.()
        } finally {
          resolve()
        }
      }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(tag)
    })
  }
  return ytApiLoading
}

async function markVideoCompleteOnce(moduleId: string, doneRef: { current: boolean }) {
  if (doneRef.current) return
  doneRef.current = true
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('module_progress').upsert(
    {
      module_id: moduleId,
      learner_id: user.id,
      watch_pct: 100,
      is_completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'module_id,learner_id' },
  )
}

export default function VideoModule({ moduleId, contentUrl }: VideoModuleProps) {
  const router = useRouter()
  const playerContainerId = `yt-${useId().replace(/:/g, '')}`
  const ytId = extractYouTubeId(contentUrl)
  const vimeoId = !ytId ? extractVimeoId(contentUrl) : null
  const direct = !ytId && !vimeoId && isProbablyDirectVideo(contentUrl)

  const doneRef = useRef(false)

  const onReachEnd = useCallback(() => {
    const run = async () => {
      await markVideoCompleteOnce(moduleId, doneRef)
      router.refresh()
    }
    void run()
  }, [moduleId, router])

  // YouTube: IFrame API — complete when ≤5s left or ended
  useEffect(() => {
    if (!ytId) return
    let player: { getDuration: () => number; getCurrentTime: () => number; destroy: () => void } | undefined
    let interval: ReturnType<typeof setInterval> | undefined

    const start = async () => {
      await ensureYouTubeIframeApi()
      if (!window.YT?.Player) return
      player = new window.YT!.Player(playerContainerId, {
        videoId: ytId,
        playerVars: { rel: 0 },
        events: {
          onStateChange: (ev: { data: number }) => {
            if (ev.data === window.YT!.PlayerState.ENDED) onReachEnd()
          },
        },
      })
      interval = setInterval(() => {
        try {
          const d = player!.getDuration()
          const t = player!.getCurrentTime()
          if (d > 0 && t >= 0 && d - t <= END_SECONDS_THRESHOLD) {
            clearInterval(interval)
            onReachEnd()
          }
        } catch {
          /* not ready */
        }
      }, 400)
    }

    void start()
    return () => {
      if (interval) clearInterval(interval)
      try {
        player?.destroy()
      } catch {
        /* noop */
      }
    }
  }, [ytId, playerContainerId, onReachEnd])

  // Vimeo / generic embed: completion on end via postMessage (best-effort)
  useEffect(() => {
    if (ytId || direct) return
    const embedUrl = vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}`
      : contentUrl

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      if (event.origin !== 'https://player.vimeo.com') return
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'ended') onReachEnd()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [ytId, vimeoId, contentUrl, direct, onReachEnd])

  if (direct) {
    return (
      <video
        src={contentUrl}
        controls
        className="w-full rounded-xl shadow-lg bg-black max-h-[70vh]"
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (!v.duration || Number.isNaN(v.duration)) return
          const left = v.duration - v.currentTime
          if (left <= END_SECONDS_THRESHOLD) onReachEnd()
        }}
        onEnded={() => onReachEnd()}
      />
    )
  }

  if (ytId) {
    return (
      <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
        <div id={playerContainerId} className="absolute inset-0 w-full h-full" />
      </div>
    )
  }

  const iframeSrc = vimeoId ? `https://player.vimeo.com/video/${vimeoId}` : contentUrl

  return (
    <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
      <iframe
        src={iframeSrc}
        title="Video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elId: string,
        config: {
          videoId?: string
          playerVars?: Record<string, number | string>
          events?: { onStateChange?: (ev: { data: number }) => void }
        },
      ) => {
        getDuration: () => number
        getCurrentTime: () => number
        destroy: () => void
      }
      PlayerState: { ENDED: number; PLAYING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}
