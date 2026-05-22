'use client'

import { useEffect, useState } from 'react'
import { Download, CheckCircle, Info, Smartphone } from 'lucide-react'
import { AppCard } from '@/components/ui/primitives'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Status = 'checking' | 'ready' | 'installed' | 'dismissed' | 'ios' | 'unsupported'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
}

export default function InstallAppCard() {
  const [status, setStatus] = useState<Status>('checking')
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already running as installed standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setStatus('installed')
      return
    }

    // iOS — beforeinstallprompt never fires
    if (isIOS()) {
      setStatus('ios')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setStatus('ready')
    }

    const installedHandler = () => {
      setStatus('installed')
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)

    // After 4 s with no prompt, the browser won't show one
    const timer = setTimeout(() => {
      setStatus((prev) => (prev === 'checking' ? 'unsupported' : prev))
    }, 4000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
      clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') {
      setStatus('installed')
    } else {
      setStatus('dismissed')
    }
    setPromptEvent(null)
  }

  const descriptions: Record<Status, string> = {
    checking: 'Checking if this device supports app installation…',
    ready: 'Install Peregrine LMS on your device for quick, offline-ready access.',
    installed: 'Peregrine LMS is already installed on this device.',
    dismissed: 'You dismissed the install prompt. Reload the page to try again.',
    ios: 'To install on iPhone or iPad: open in Safari, tap the Share icon, then tap Add to Home Screen.',
    unsupported: 'Install is not available on this browser. Try opening the site in Chrome on Android.',
  }

  const notice: Record<string, { color: string; icon: React.ReactNode; text: string } | null> = {
    dismissed: {
      color: 'text-amber-600',
      icon: <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
      text: 'Chrome suppresses the prompt after dismissal. Reload the page or try again later.',
    },
    ios: {
      color: 'text-blue-600',
      icon: <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
      text: 'Apple does not allow Chrome to trigger install on iOS. Use Safari instead.',
    },
    unsupported: {
      color: 'text-amber-600',
      icon: <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />,
      text: 'This can happen if the app is already installed under a different browser profile, or if your browser does not support PWA installation.',
    },
  }

  const currentNotice = notice[status] ?? null
  const buttonEnabled = status === 'ready'

  return (
    <AppCard className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Install App</h2>
          <p className="mt-1 text-sm text-slate-600">{descriptions[status]}</p>
          {currentNotice && (
            <div className={`mt-2 flex items-start gap-1.5 text-xs ${currentNotice.color}`}>
              {currentNotice.icon}
              <span>{currentNotice.text}</span>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {status === 'installed' ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Installed
            </span>
          ) : (
            <button
              type="button"
              disabled={!buttonEnabled}
              onClick={handleInstall}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
            >
              <Download className="h-4 w-4" />
              Install App
            </button>
          )}
        </div>
      </div>
    </AppCard>
  )
}
