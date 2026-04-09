'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppButton } from '@/components/ui/primitives'
import { toast } from 'sonner'

type Props = {
  force?: boolean
  label?: string
}

export function RunSheetSyncButton({ force = false, label }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const defaultLabel = force ? 'Re-sync all rows (force)' : 'Run sync now'

  async function run() {
    setLoading(true)
    try {
      const qs = force ? '?force=1' : ''
      const res = await fetch(`/api/integrations/google-sheets/sync${qs}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        status?: string
        rowsTotal?: number
        rowsOk?: number
        rowsSkipped?: number
        truncated?: boolean
        workRowsProcessed?: number
      }
      if (!res.ok) {
        toast.error(data.error || `Request failed (${res.status})`)
      } else {
        const more =
          data.truncated === true
            ? ' — more rows left: run sync again (batch limit).'
            : ''
        toast.success(
          `${data.status}: processed ${data.rowsOk ?? 0}/${data.rowsTotal ?? 0}, skipped ${data.rowsSkipped ?? 0}${more}`,
        )
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      <AppButton type="button" variant={force ? 'secondary' : 'primary'} disabled={loading} onClick={() => void run()}>
        <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Syncing…' : (label ?? defaultLabel)}
      </AppButton>
    </div>
  )
}
