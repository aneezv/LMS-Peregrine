'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { VolumeX } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import './VideoModule.plyr.css'
import { fetchWithRetry } from '@/lib/network-retry'
import { queryKeys } from '@/lib/query/query-keys'

const END_SECONDS_THRESHOLD = 10
const VEIL_FADE_OUT_MS = 480

export interface VideoModuleProps {
  moduleId?: string
  contentUrl: string
  className?: string
  autoplay?: boolean
}

import {
  extractYouTubeId,
  extractVimeoId,
  isValidDemoVideoUrl,
  isProbablyDirectVideo,
} from '@/lib/video-url'

export { extractYouTubeId, extractVimeoId, isValidDemoVideoUrl, isProbablyDirectVideo }


type SupportedOrientationLock = 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>
  unlock?: () => void
}

function getScreenOrientation(): ScreenOrientationWithLock | null {
  if (typeof window === 'undefined' || !('screen' in window)) return null
  return window.screen.orientation as ScreenOrientationWithLock | null
}

async function requestLandscapeOrientation() {
  const orientation = getScreenOrientation()
  if (!orientation?.lock) return
  try {
    await orientation.lock('landscape')
  } catch {
    // Some browsers require fullscreen to settle before locking orientation.
  }
}

function resetOrientationLock() {
  const orientation = getScreenOrientation()
  if (!orientation?.unlock) return
  try {
    orientation.unlock()
  } catch {
    // Ignore browsers that do not support orientation unlock.
  }
}

async function markVideoCompleteOnce(moduleId: string, doneRef: { current: boolean }): Promise<boolean> {
  if (doneRef.current) return true
  doneRef.current = true
  try {
    const res = await fetchWithRetry('/api/modules/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      throw new Error(data.error ?? 'Could not save lesson completion')
    }
    return true
  } catch (error) {
    console.error('Lesson completion error:', error)
    doneRef.current = false
    return false
  }
}

export default function VideoModule({
  moduleId,
  contentUrl,
  className = '',
  autoplay = false,
}: VideoModuleProps) {
  const queryClient = useQueryClient()
  const embedRef = useRef<HTMLDivElement>(null)
  const directVideoRef = useRef<HTMLVideoElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const desiredMutedRef = useRef<boolean>(Boolean(autoplay))
  const [isMuted, setIsMuted] = useState(Boolean(autoplay))

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
    if (!moduleId) return
    const run = async () => {
      const completed = await markVideoCompleteOnce(moduleId, doneRef)
      if (completed) {
        queryClient.setQueryData(queryKeys.moduleProgress({ moduleId }), { completed: true })
      } else {
        toast.error('Could not save lesson completion', {
          description:
            'Check your connection and try again. We will retry the next time the lesson completion event fires.',
        })
      }
    }
    void run()
  }, [moduleId, queryClient])

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (playerRef.current) {
      try {
        const currentMuted = Boolean(playerRef.current.muted)
        const targetMuted = !currentMuted
        desiredMutedRef.current = targetMuted
        playerRef.current.muted = targetMuted
        if (!targetMuted) {
          const vol = Number(playerRef.current.volume)
          if (!Number.isFinite(vol) || vol <= 0) {
            playerRef.current.volume = 1
          }
        }
        setIsMuted(targetMuted)
      } catch (err) {
        console.warn('Could not toggle mute on player:', err)
      }
    } else if (directVideoRef.current) {
      const targetMuted = !directVideoRef.current.muted
      desiredMutedRef.current = targetMuted
      directVideoRef.current.muted = targetMuted
      if (!targetMuted && directVideoRef.current.volume === 0) {
        directVideoRef.current.volume = 1
      }
      setIsMuted(targetMuted)
    } else {
      desiredMutedRef.current = !desiredMutedRef.current
      setIsMuted(desiredMutedRef.current)
    }
  }, [])

  useEffect(() => {
    if (!provider || !embedId || !embedRef.current) return

    let cancelled = false
    let pollId: number | undefined
    let mo: MutationObserver | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null

    const syncState = () => {
      if (cancelled || !player?.elements) return
      setPaused(Boolean(player.paused))
      setEnded(Boolean(player.ended))
      setIsMuted(Boolean(player.muted))
    }

    const lockIframe = () => {
      if (cancelled || !player?.elements) return
      const c = player.elements?.container as HTMLElement | null
      const iframe = c?.querySelector('iframe') ?? player.elements?.wrapper?.querySelector('iframe')
      if (iframe) {
        iframe.style.setProperty('pointer-events', 'none', 'important')
      }
    }

    const plyrEl = document.createElement('div')
    plyrEl.className = 'h-full w-full'
    plyrEl.dataset.plyrProvider = provider
    plyrEl.dataset.plyrEmbedId = embedId
    
    // Clean up any existing children and append the new element
    if (embedRef.current) {
      embedRef.current.innerHTML = ''
      embedRef.current.appendChild(plyrEl)
    }

    void (async () => {
      await import('plyr/dist/plyr.css')
      const { default: Plyr } = await import('plyr')
      if (cancelled || !embedRef.current) return

      const initialMuted = desiredMutedRef.current

      player = new Plyr(plyrEl, {

        ratio: '16:9',
        autoplay: Boolean(autoplay),
        muted: initialMuted,
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
          autoplay: autoplay ? 1 : 0,
          mute: initialMuted ? 1 : 0,
        },
        vimeo: {
          byline: false,
          portrait: false,
          title: false,
          speed: true,
          customControls: true,
          autoplay: Boolean(autoplay),
          muted: initialMuted,
        },
      })
      playerRef.current = player

      if (cancelled) {
        try { player.destroy() } catch { /* noop */ }
        return
      }

      player.on('ready', () => {
        if (cancelled) return
        setIsMuted(Boolean(player.muted))
      })
      player.on('volumechange', () => {
        if (cancelled) return
        setIsMuted(Boolean(player.muted))
      })
      player.on('playing', () => {
        if (cancelled) return
        const c = player.elements?.container as HTMLElement | null
        c?.classList.add('video-module-embed-ready')
        setEmbedReady(true)
        setWaiting(false)
        setIsMuted(Boolean(player.muted))
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
      player.on('enterfullscreen', () => {
        if (cancelled) return
        void requestLandscapeOrientation()
      })
      player.on('exitfullscreen', () => {
        if (cancelled) return
        resetOrientationLock()
      })
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

      const syncPoll = () => {
        lockIframe()
        if (player) {
          setIsMuted(Boolean(player.muted))
        }
      }
      lockIframe()
      pollId = window.setInterval(syncPoll, 200)

      const containerEl = player.elements?.container as HTMLElement | null
      if (containerEl) {
        mo = new MutationObserver(() => { if (!cancelled) lockIframe() })
        mo.observe(containerEl, { childList: true, subtree: true })
      }
    })()

    return () => {
      cancelled = true
      playerRef.current = null
      if (pollId !== undefined) window.clearInterval(pollId)
      mo?.disconnect()
      if (player) {
        try { player.destroy() } catch { /* noop */ }
      }
      resetOrientationLock()
      setEmbedReady(false)
      setPaused(true)
      setEnded(false)
      setWaiting(false)
      setHiding(false)
    }
  }, [provider, embedId, moduleId, onReachEnd, autoplay])

  const renderUnmuteButton = () => {
    // Hide when audio is unmuted or when video has ended
    if (ended || !isMuted) return null

    return (
      <button
        type="button"
        onClick={handleToggleMute}
        aria-label="Tap to unmute"
        className="pointer-events-auto absolute right-3 top-3 z-30 flex cursor-pointer select-none items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md ring-1 ring-white/25 transition-all hover:bg-black/95 hover:ring-white/45 active:scale-95 sm:right-4 sm:top-4"
      >
        <VolumeX className="size-4 shrink-0 text-white animate-pulse" />
        <span>Tap to unmute</span>
      </button>
    )
  }

  if (direct) {
    return (
      <div
        className={`relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black ${className}`.trim()}
      >
        <video
          ref={directVideoRef}
          src={contentUrl}
          controls
          autoPlay={autoplay}
          muted={isMuted}
          playsInline
          className="size-full object-contain"
          onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (!v.duration || Number.isNaN(v.duration)) return
            const left = v.duration - v.currentTime
            if (left <= END_SECONDS_THRESHOLD) onReachEnd()
          }}
          onEnded={() => {
            setEnded(true)
            onReachEnd()
          }}
        />
        {renderUnmuteButton()}
      </div>
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
      <div
        className={`video-module-plyr-host relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black ${className}`.trim()}
      >
        <div ref={embedRef} className="h-full w-full" />
        {/* Veil rendered in React — auto-cleaned on unmount, no stale DOM */}
        <div className={veilClasses} />
        {renderUnmuteButton()}
      </div>
    )
  }

  return (
    <div
      className={`relative aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black ${className}`.trim()}
    >
      <iframe
        src={
          autoplay
            ? `${contentUrl}${contentUrl.includes('?') ? '&' : '?'}autoplay=1&mute=1`
            : contentUrl
        }
        title="Video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
      {renderUnmuteButton()}
    </div>
  )
}
