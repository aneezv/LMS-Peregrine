'use client'

import { useEffect, useState } from 'react'
import { Download, CheckCircle } from 'lucide-react'
import { AppCard } from '@/components/ui/primitives'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppCard() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }

    const installedHandler = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)

    // Already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  return (
    <AppCard className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Install App</h2>
          <p className="mt-1 text-sm text-slate-600">
            {installed
              ? 'Peregrine LMS is installed on this device.'
              : 'Install Peregrine LMS on your device for quick access.'}
          </p>
        </div>
        {installed ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            Installed
          </span>
        ) : (
          <button
            type="button"
            disabled={!promptEvent}
            onClick={async () => {
              if (!promptEvent) return
              await promptEvent.prompt()
              const { outcome } = await promptEvent.userChoice
              if (outcome === 'accepted') setInstalled(true)
              setPromptEvent(null)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
          >
            <Download className="h-4 w-4" />
            Install App
          </button>
        )}
      </div>
    </AppCard>
  )
}
