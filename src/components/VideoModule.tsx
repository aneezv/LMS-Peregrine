'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import './VideoModule.plyr.css'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useModuleProgressStore } from '@/stores/module-progress.store'

const END_SECONDS_THRESHOLD = 10
const VEIL_FADE_OUT_MS = 480

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

async function markVideoCompleteOnce(moduleId: string, doneRef: { current: boolean }): Promise<boolean> {
  if (doneRef.current) return true
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  doneRef.current = true
  const { error } = await supabase.from('module_progress').upsert(
    {
      module_id: moduleId,
      learner_id: user.id,
      watch_pct: 100,
      is_completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'module_id,learner_id' },
  );

  if (error) {
    console.error("Supabase Error:", error);
    doneRef.current = false;
    return false
  }
  return true
}

export default function VideoModule({ moduleId, contentUrl }: VideoModuleProps) {
  const router = useRouter()
  const markCompleted = useModuleProgressStore((state) => state.markCompleted)
  const embedRef = useRef<HTMLDivElement>(null)
  const ytId = extractYouTubeId(contentUrl)
  const vimeoId = !ytId ? extractVimeoId(contentUrl) : null
  const direct = !ytId && !vimeoId && isProbablyDirectVideo(contentUrl)
  const embedId = ytId ?? vimeoId
  const provider = ytId ? 'youtube' : vimeoId ? 'vimeo' : null

  const doneRef = useRef(false)

  // Veil state managed in React so unmount cleans it up automatically.
  const [embedReady, setEmbedReady] = useState(false)
  const [paused, setPaused] = useState(true)
  const [ended, setEnded] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [hiding, setHiding] = useState(false)
  const hidingTimerRef = useRef<number | undefined>(undefined)

  const blackOverlay = embedReady && !ended && (paused || waiting)
  const showVeil = !embedReady || blackOverlay

  const prevShowVeilRef = useRef(showVeil)
  const prevBlackRef = useRef(blackOverlay)

  // Trigger fade-out when black overlay disappears (resume / buffering ends).
  useEffect(() => {
    const wasVisible = prevShowVeilRef.current
    const wasBlack = prevBlackRef.current
    prevShowVeilRef.current = showVeil
    prevBlackRef.current = blackOverlay

    if (wasVisible && wasBlack && !blackOverlay && !showVeil) {
      setHiding(true)
      window.clearTimeout(hidingTimerRef.current)
      hidingTimerRef.current = window.setTimeout(() => {
        setHiding(false)
      }, VEIL_FADE_OUT_MS)
    } else if (showVeil) {
      window.clearTimeout(hidingTimerRef.current)
      setHiding(false)
    }

    return () => window.clearTimeout(hidingTimerRef.current)
  }, [showVeil, blackOverlay])

  const onReachEnd = useCallback(() => {
    const run = async () => {
      const completed = await markVideoCompleteOnce(moduleId, doneRef)
      if (completed) {
        markCompleted(moduleId)
      }
      router.refresh()
    }
    void run()
  }, [markCompleted, moduleId, router])

  useEffect(() => {
    if (!provider || !embedId || !embedRef.current) return

    const el = embedRef.current
    let cancelled = false
    let pollId: number | undefined
    let mo: MutationObserver | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null

    const syncState = () => {
      if (cancelled || !player?.elements) return
      setPaused(Boolean(player.paused))
      setEnded(Boolean(player.ended))
    }

    const lockIframe = () => {
      if (cancelled || !player?.elements) return
      const c = player.elements?.container as HTMLElement | null
      const iframe = c?.querySelector('iframe') ?? player.elements?.wrapper?.querySelector('iframe')
      if (iframe) {
        iframe.style.setProperty('pointer-events', 'none', 'important')
      }
    }

    void (async () => {
      await import('plyr/dist/plyr.css')
      const { default: Plyr } = await import('plyr')
      if (cancelled || !embedRef.current) return

      player = new Plyr(el, {
        ratio: '16:9',
        fullscreen: {
          enabled: true,
          fallback: true,
          container: '.video-module-plyr-host',
        },
        youtube: {
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          customControls: true,
          controls: 0,
        },
        vimeo: {
          byline: false,
          portrait: false,
          title: false,
          speed: true,
          customControls: true,
        },
      })
      if (cancelled) {
        try { player.destroy() } catch { /* noop */ }
        return
      }

      player.on('playing', () => {
        if (cancelled) return
        const c = player.elements?.container as HTMLElement | null
        c?.classList.add('video-module-embed-ready')
        setEmbedReady(true)
        setWaiting(false)
        syncState()
      })
      player.on('pause', () => { if (!cancelled) syncState() })
      player.on('ended', () => {
        if (cancelled) return
        setWaiting(false)
        setEnded(true)
        onReachEnd()
      })
      player.on('seeked', () => { if (!cancelled) syncState() })
      player.on('waiting', () => { if (!cancelled) setWaiting(true) })
      player.on('stalled', () => { if (!cancelled) setWaiting(true) })
      player.on('canplay', () => { if (!cancelled) setWaiting(false) })
      player.on('canplaythrough', () => { if (!cancelled) setWaiting(false) })
      player.on('error', () => {
        if (cancelled) return
        const c = player.elements?.container as HTMLElement | null
        c?.classList.add('video-module-embed-ready')
        setEmbedReady(true)
      })

      player.on('timeupdate', () => {
        if (cancelled || doneRef.current) return
        const d = player.duration
        const t = player.currentTime
        if (Number.isFinite(d) && d > 0 && d - t <= END_SECONDS_THRESHOLD) {
          onReachEnd()
        }
      })

      lockIframe()
      pollId = window.setInterval(lockIframe, 200)

      const containerEl = player.elements?.container as HTMLElement | null
      if (containerEl) {
        mo = new MutationObserver(() => { if (!cancelled) lockIframe() })
        mo.observe(containerEl, { childList: true, subtree: true })
      }
    })()

    return () => {
      cancelled = true
      if (pollId !== undefined) window.clearInterval(pollId)
      mo?.disconnect()
      if (player) {
        try { player.destroy() } catch { /* noop */ }
      }
      setEmbedReady(false)
      setPaused(true)
      setEnded(false)
      setWaiting(false)
      setHiding(false)
    }
  }, [provider, embedId, moduleId, onReachEnd])

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

  if (provider && embedId) {
    const veilVisible = showVeil || hiding
    const veilClasses = [
      'video-module-full-veil',
      veilVisible ? 'video-module-full-veil--visible' : '',
      blackOverlay ? 'video-module-full-veil--buffering' : '',
      hiding ? 'video-module-full-veil--hiding' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className="video-module-plyr-host relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
        <div
          key={`${moduleId}-${embedId}`}
          ref={embedRef}
          className="h-full w-full"
          data-plyr-provider={provider}
          data-plyr-embed-id={embedId}
        />
        {/* Veil rendered in React — auto-cleaned on unmount, no stale DOM */}
        <div className={veilClasses} />
      </div>
    )
  }

  return (
    <div className="relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
      <iframe
        src={contentUrl}
        title="Video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
