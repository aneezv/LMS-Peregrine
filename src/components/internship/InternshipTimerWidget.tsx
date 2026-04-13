'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CLIENT_INACTIVITY_MS,
  HEARTBEAT_INTERVAL_MS_TAB_HIDDEN_THROTTLE,
  HEARTBEAT_INTERVAL_MS_VISIBLE,
  MAX_DAILY_ACTIVE_SECONDS,
  PING_CHALLENGE_MAX_MS,
  PING_CHALLENGE_MIN_MS,
} from '@/lib/internship/constants'
import { Play, Square, Coffee, Clock } from 'lucide-react'

type Session = {
  id: string
  course_id: string | null
  course_title?: string | null
  status: 'ACTIVE' | 'ON_BREAK' | 'INACTIVE_AUTO' | 'ENDED'
  active_seconds: number
  break_seconds: number
  start_time: string
}

function extractCourseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/courses\/([0-9a-f-]{36})(?:\/|$)/i)
  return m?.[1] ?? null
}

function pickPrimarySession(sessions: Session[], contextCourseId: string | null): Session | null {
  if (sessions.length === 0) return null
  if (contextCourseId) {
    const match = sessions.find(
      (s) => s.course_id && s.course_id.toLowerCase() === contextCourseId.toLowerCase(),
    )
    if (match) return match
  }
  return sessions[0]
}

function sessionMatchesTrackedCourse(s: Session | null, pathname: string): boolean {
  if (!s?.course_id) return true
  const m = pathname.match(/^\/courses\/([0-9a-f-]{36})(?:\/|$)/i)
  return m != null && m[1].toLowerCase() === s.course_id.toLowerCase()
}

function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

function statusLabel(s: Session['status'] | null) {
  if (!s) return '—'
  switch (s) {
    case 'ACTIVE':
      return 'Active'
    case 'ON_BREAK':
      return 'On break'
    case 'INACTIVE_AUTO':
      return 'Inactive'
    case 'ENDED':
      return 'Ended'
    default:
      return s
  }
}

function statusBadgeClass(s: Session['status'] | null) {
  if (!s) return 'bg-slate-100 text-slate-600'
  if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-800'
  if (s === 'ON_BREAK') return 'bg-amber-100 text-amber-900'
  if (s === 'INACTIVE_AUTO') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-600'
}

/** Smooth UI: increment every second between server heartbeats; re-sync when server numbers change. */
type DisplayBaseline = {
  sessionId: string | null
  lastServerKey: string
  active: number
  breakSec: number
  daily: number
  syncedAt: number
}

function buildServerKey(s: Session) {
  return `${s.id}|${s.active_seconds}|${s.break_seconds}|${s.status}`
}

export default function InternshipTimerWidget() {
  const IDLE_FADE_MS = 3500
  const pathname = usePathname() ?? ''
  const contextCourseId = useMemo(() => extractCourseIdFromPath(pathname), [pathname])

  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [dailyActive, setDailyActive] = useState(0)
  const [dailyRemaining, setDailyRemaining] = useState(MAX_DAILY_ACTIVE_SECONDS)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showInactivityModal, setShowInactivityModal] = useState(false)
  const [inactivityModalKind, setInactivityModalKind] = useState<'idle' | 'away' | null>(null)
  const [showPingModal, setShowPingModal] = useState(false)
  const [widgetEmphasis, setWidgetEmphasis] = useState(false)

  /** Bumps once per second while a session exists so displayed seconds tick smoothly. */
  const [displayTick, setDisplayTick] = useState(0)
  /** Re-render when tab visibility changes so local extrapolation stops/starts immediately. */
  const [visibilityEpoch, setVisibilityEpoch] = useState(0)

  const displayBaselineRef = useRef<DisplayBaseline>({
    sessionId: null,
    lastServerKey: '',
    active: 0,
    breakSec: 0,
    daily: 0,
    syncedAt: Date.now(),
  })

  const tabVisibleRef = useRef(typeof document !== 'undefined' ? !document.hidden : true)
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const widgetFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshRef = useRef(async () => {})
  const sessionRef = useRef<Session | null>(null)
  /** Must not be a hook dependency on session—heartbeat updates session every ~12s and would reset the idle timer. */
  const sendHeartbeatRef = useRef<() => Promise<void>>(async () => {})

  const readOnTrackedCoursePage = useCallback(() => {
    const p = typeof window !== 'undefined' ? window.location.pathname : ''
    return sessionMatchesTrackedCourse(sessionRef.current, p)
  }, [])

  const scheduleIdleTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    const elapsed = Date.now() - lastActivityRef.current
    const remaining = Math.max(0, CLIENT_INACTIVITY_MS - elapsed)
    inactivityTimerRef.current = setTimeout(() => {
      const sid = sessionRef.current?.course_id
      const p = window.location.pathname
      let away = false
      if (sid) {
        const m = p.match(/^\/courses\/([0-9a-f-]{36})(?:\/|$)/i)
        away = m == null || m[1].toLowerCase() !== sid.toLowerCase()
      }
      setInactivityModalKind(away ? 'away' : 'idle')
      setShowInactivityModal(true)
      void (async () => {
        try {
          await fetch('/api/session/activity', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientInactivity: true,
              tabVisible: tabVisibleRef.current,
              sessionId: sessionRef.current?.id,
            }),
          })
          await refreshRef.current()
        } catch {
          /* still show modal */
        }
      })()
    }, remaining)
  }, [])

  const bumpActivity = useCallback(() => {
    if (!readOnTrackedCoursePage()) return
    lastActivityRef.current = Date.now()
    scheduleIdleTimer()
  }, [readOnTrackedCoursePage, scheduleIdleTimer])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const currentUrl = contextCourseId ? `/api/session/current?courseId=${contextCourseId}` : '/api/session/current'
      const res = await fetch(currentUrl, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load session')
      const list = (data.sessions ?? []) as Session[]
      setSessions(list)
      const primary = pickPrimarySession(list, contextCourseId)
      setSession(primary)
      setDailyActive(data.dailyActiveSeconds ?? 0)
      setDailyRemaining(data.dailyRemainingActive ?? MAX_DAILY_ACTIVE_SECONDS)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }, [contextCourseId])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  /** Keep baseline in sync with server during render so the first paint after an update is correct. */
  {
    const b = displayBaselineRef.current
    if (!session) {
      b.sessionId = null
      b.lastServerKey = ''
    } else {
      const key = buildServerKey(session)
      if (key !== b.lastServerKey) {
        b.lastServerKey = key
        b.sessionId = session.id
        b.active = session.active_seconds
        b.breakSec = session.break_seconds
        b.daily = dailyActive
        b.syncedAt = Date.now()
      } else {
        b.daily = dailyActive
      }
    }
  }

  useEffect(() => {
    if (!session || session.status === 'ENDED') return
    const id = window.setInterval(() => {
      setDisplayTick((n) => n + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [session?.id, session?.status])

  const { displayActive, displayBreak, displayDaily } = (() => {
    void displayTick
    void visibilityEpoch
    void pathname
    const s = session
    const b = displayBaselineRef.current
    if (!s || !b.sessionId || s.id !== b.sessionId) {
      return {
        displayActive: s?.active_seconds ?? 0,
        displayBreak: s?.break_seconds ?? 0,
        displayDaily: dailyActive,
      }
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - b.syncedAt) / 1000))
    const tabOk = tabVisibleRef.current
    const onCourse = sessionMatchesTrackedCourse(s, pathname)
    let a = b.active
    let br = b.breakSec
    let d = b.daily
    if (s.status === 'ACTIVE' && tabOk && onCourse) {
      a += elapsed
      d += elapsed
    } else if (s.status === 'ON_BREAK') {
      br += elapsed
    }
    return { displayActive: a, displayBreak: br, displayDaily: d }
  })()

  const sendHeartbeat = useCallback(async () => {
    if (!session || session.status === 'ENDED') return
    const onCourse = sessionMatchesTrackedCourse(session, typeof window !== 'undefined' ? window.location.pathname : pathname)
    try {
      const res = await fetch('/api/session/activity', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          tabVisible: tabVisibleRef.current,
          onCoursePage: onCourse,
          events: [],
        }),
      })
      const data = await res.json()
      if (data.session) {
        const incoming = data.session as Session
        // `/api/session/activity` returns the raw `internship_sessions` row (no `course_title`),
        // so preserve the title from the previous state when this is the same session.
        setSession((prev) => {
          if (prev && prev.id === incoming.id) {
            return { ...incoming, course_title: prev.course_title }
          }
          return incoming
        })
      }
      if (typeof data.dailyActiveSeconds === 'number') setDailyActive(data.dailyActiveSeconds)
      if (typeof data.dailyRemainingActive === 'number') setDailyRemaining(data.dailyRemainingActive)
      if (data.tick?.auto_inactive) {
        setInactivityModalKind('idle')
        setShowInactivityModal(true)
      }
    } catch {
      /* ignore transient network errors */
    }
  }, [session, pathname])

  useEffect(() => {
    sendHeartbeatRef.current = sendHeartbeat
  }, [sendHeartbeat])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!session || session.status === 'ENDED') return
    const useFastHeartbeat =
      session.status === 'ON_BREAK' || tabVisibleRef.current
    const intervalMs = useFastHeartbeat
      ? HEARTBEAT_INTERVAL_MS_VISIBLE
      : HEARTBEAT_INTERVAL_MS_TAB_HIDDEN_THROTTLE
    const id = setInterval(() => void sendHeartbeatRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [session?.id, session?.status, visibilityEpoch])

  useEffect(() => {
    if (!session || session.status === 'ENDED') return
    if (readOnTrackedCoursePage()) {
      bumpActivity()
    } else {
      scheduleIdleTimer()
    }
  }, [pathname, session?.id, session?.status, readOnTrackedCoursePage, bumpActivity, scheduleIdleTimer])

  useEffect(() => {
    if (!session || session.status === 'ENDED') return
    lastActivityRef.current = Date.now()

    const onVis = () => {
      tabVisibleRef.current = !document.hidden
      setVisibilityEpoch((n) => n + 1)
      void sendHeartbeatRef.current()
    }
    document.addEventListener('visibilitychange', onVis)

    const onKey = () => bumpActivity()
    const onClick = () => bumpActivity()
    let lastMove = 0
    const onMove = () => {
      const now = Date.now()
      if (now - lastMove < 800) return
      lastMove = now
      bumpActivity()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    window.addEventListener('mousemove', onMove)

    if (readOnTrackedCoursePage()) {
      bumpActivity()
    } else {
      scheduleIdleTimer()
    }

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', onMove)
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [bumpActivity, readOnTrackedCoursePage, scheduleIdleTimer, session?.id, session?.status])

  useEffect(() => {
    if (!session || session.status === 'ENDED') {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current)
      return
    }
    const schedule = () => {
      const delay =
        PING_CHALLENGE_MIN_MS +
        Math.random() * (PING_CHALLENGE_MAX_MS - PING_CHALLENGE_MIN_MS)
      pingTimerRef.current = setTimeout(() => {
        const s = sessionRef.current
        if (
          s?.status === 'ACTIVE' &&
          !document.hidden &&
          sessionMatchesTrackedCourse(s, window.location.pathname)
        ) {
          setShowPingModal(true)
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      if (pingTimerRef.current) clearTimeout(pingTimerRef.current)
    }
  }, [session])

  const emphasizeWidget = useCallback(() => {
    setWidgetEmphasis(true)
    if (widgetFadeTimerRef.current) clearTimeout(widgetFadeTimerRef.current)
    widgetFadeTimerRef.current = setTimeout(() => {
      setWidgetEmphasis(false)
    }, IDLE_FADE_MS)
  }, [IDLE_FADE_MS])

  useEffect(() => {
    return () => {
      if (widgetFadeTimerRef.current) clearTimeout(widgetFadeTimerRef.current)
    }
  }, [])

  async function postAction(path: string, body?: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/session/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const data = await res.json()
      if (!res.ok) {
        if (path === 'start' && res.status === 409 && data.session) {
          setSession(data.session)
          await refresh()
          return
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
      }
      if (data.session) setSession(data.session)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function resumeFromModal() {
    setShowInactivityModal(false)
    setInactivityModalKind(null)
    const sid = sessionRef.current?.id
    await postAction('resume', sid ? { sessionId: sid } : {})
  }

  async function endFromModal() {
    setShowInactivityModal(false)
    setInactivityModalKind(null)
    const sid = sessionRef.current?.id
    await postAction('end', sid ? { sessionId: sid } : {})
  }

  async function confirmPing() {
    setShowPingModal(false)
    const sid = sessionRef.current?.id
    if (!sid) return
    try {
      await fetch('/api/session/activity', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pingChallenge: true, sessionId: sid, onCoursePage: true }),
      })
    } catch {
      /* optional */
    }
  }

  const hasOpenSessions = sessions.length > 0
  const showWidget = hasOpenSessions || Boolean(contextCourseId)
  const hasSessionForThisCourse =
    contextCourseId != null &&
    sessions.some((s) => s.course_id && s.course_id.toLowerCase() === contextCourseId.toLowerCase())
  const canStartHere = Boolean(contextCourseId) && !hasSessionForThisCourse

  // if (!showWidget) return null
  if (true) return null // DEBUG

  return (
    <>
      {showInactivityModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            {inactivityModalKind === 'away' ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900">Internship paused</h2>
                <p className="mt-2 text-sm text-slate-600">
                  You were away from this course for a while without activity. Open the course again to
                  continue, or end this session.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
                    onClick={() => void endFromModal()}
                  >
                    End session
                  </button>
                  {session?.course_id ? (
                    <Link
                      href={`/courses/${session.course_id}`}
                      className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                      onClick={() => {
                        setShowInactivityModal(false)
                        setInactivityModalKind(null)
                      }}
                    >
                      Go to course
                    </Link>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">You appear inactive</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Your internship timer paused for inactivity. Resume when you are ready to continue.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 text-sm font-medium hover:bg-slate-200"
                    onClick={() => {
                      setShowInactivityModal(false)
                      setInactivityModalKind(null)
                    }}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    onClick={() => void resumeFromModal()}
                  >
                    Resume session
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
                    onClick={() => void endFromModal()}
                  >
                    End session
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showPingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Still there?</h2>
            <p className="mt-2 text-sm text-slate-600">Quick check that you are actively at your desk.</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                onClick={() => void confirmPing()}
              >
                I am active
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        onMouseEnter={emphasizeWidget}
        onFocus={emphasizeWidget}
        onPointerDown={emphasizeWidget}
        className={`fixed z-50 flex flex-col gap-2 items-center left-1/2 -translate-x-1/2 bottom-2 transition-opacity duration-300
        lg:items-end lg:left-auto lg:right-8 lg:bottom-4 lg:translate-x-0 ${
          widgetEmphasis ? 'opacity-100' : 'opacity-60'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            emphasizeWidget()
            setExpanded((e) => !e)
          }}
          className="flex items-center gap-2 rounded-full shadow-lg bg-white border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          <Clock className="w-4 h-4 text-indigo-600" />
          {session?.course_title ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium truncate max-w-[10rem]">
              {session.course_title}
            </span>
          ) : null}
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(session?.status ?? null)}`}>
            {statusLabel(session?.status ?? null)}
          </span>
        </button>

        {expanded && (
          <div className="w-80 rounded-xl shadow-xl border border-slate-200 bg-white p-4 space-y-3">
            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-500">Active</div>
                <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatHms(displayActive)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-500">Break</div>
                <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatHms(displayBreak)}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600">
              Credited today (UTC):{' '}
              <span className="font-mono font-medium tabular-nums">{formatHms(displayDaily)}</span>
              {' · '}
              <span className="text-slate-500">up to {formatHms(MAX_DAILY_ACTIVE_SECONDS)} / day</span>
            </div>
            {MAX_DAILY_ACTIVE_SECONDS - displayDaily <= 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                Daily active cap reached. Timer will not add more credited time until tomorrow (UTC).
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {canStartHere && (
                <button
                  type="button"
                  disabled={busy || !contextCourseId}
                  onClick={() => void postAction('start', { courseId: contextCourseId })}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-xs font-medium px-3 py-2 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" /> Start session
                </button>
              )}

              {session && session.status === 'ACTIVE' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('break', { sessionId: session.id })}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 text-white text-xs font-medium px-3 py-2 hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Coffee className="w-3.5 h-3.5" /> Break
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('end', { sessionId: session.id })}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 text-white text-xs font-medium px-3 py-2 hover:bg-slate-900 disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5" /> End
                  </button>
                </>
              )}

              {session && (session.status === 'ON_BREAK' || session.status === 'INACTIVE_AUTO') && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('resume', { sessionId: session.id })}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-xs font-medium px-3 py-2 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" /> Resume
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postAction('end', { sessionId: session.id })}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 text-white text-xs font-medium px-3 py-2 hover:bg-slate-900 disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5" /> End
                  </button>
                </>
              )}
            </div>

            <p className="text-[10px] text-slate-400 leading-snug">
              Start a session from any course page. Credited time applies only while this tab is visible and
              you are on that course in the app.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
