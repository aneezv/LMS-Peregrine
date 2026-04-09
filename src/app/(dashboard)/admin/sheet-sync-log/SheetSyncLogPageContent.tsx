import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { AppCard, PageHeader } from '@/components/ui/primitives'
import { RunSheetSyncButton } from './RunSheetSyncButton'
import { ROLES } from '@/lib/roles'

type SheetSyncRun = {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  rows_total: number
  rows_ok: number
  rows_skipped: number
  error_summary: string | null
  details: unknown
}

export default async function SheetSyncLogPageContent() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== ROLES.ADMIN) {
    redirect('/unauthorized')
  }

  const { data: runs, error } = await supabase
    .from('sheet_sync_runs')
    .select('id, started_at, finished_at, status, rows_total, rows_ok, rows_skipped, error_summary, details')
    .order('started_at', { ascending: false })
    .limit(40)

  const list = (runs ?? []) as SheetSyncRun[]

  return (
    <div className="space-y-6 p-2">
      <PageHeader
        title="Google Sheet sync logs"
        description="Pulls rows from your Apps Script Web App and upserts learners/enrollments. Admins can run sync here; on Vercel you can also schedule POST /api/integrations/google-sheets/sync with SHEET_SYNC_CRON_SECRET."
        action={
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <RunSheetSyncButton />
            <RunSheetSyncButton force label="Force re-sync (ignore cache)" />
          </div>
        }
      />
      <AppCard className="overflow-x-auto p-4">
        {error ? (
          <p className="text-sm text-red-600">
            Could not load logs. Apply migration 20260403140000_sheet_sync_logs.sql if the table is missing.{' '}
            {error.message}
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-600">No sync runs yet. Use “Run sync now” above (active Google Sheet + env vars required).</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-3 font-semibold">Started</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Rows</th>
                <th className="py-2 pr-3 font-semibold">OK / Skipped</th>
                <th className="py-2 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-800">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        r.status === 'success'
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800'
                          : r.status === 'partial'
                            ? 'rounded-full bg-amber-100 px-2 py-0.5 text-amber-900'
                            : r.status === 'failed'
                              ? 'rounded-full bg-red-100 px-2 py-0.5 text-red-800'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-700'
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.rows_total}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                    {r.rows_ok} / {r.rows_skipped}
                  </td>
                  <td className="max-w-md py-2 break-words text-slate-600">{r.error_summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AppCard>

      {list.some((r) => r.details != null) && (
        <AppCard className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Latest run details (JSON)</h2>
          <pre className="max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(list[0]?.details ?? null, null, 2)}
          </pre>
        </AppCard>
      )}
    </div>
  )
}
