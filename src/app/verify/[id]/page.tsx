import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { AppCard } from '@/components/ui/primitives'

export default async function CertificateVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cert } = await supabase
    .from('certificates')
    .select(`
      id, issued_at, status,
      profiles:learner_id ( full_name ),
      courses:course_id ( title, profiles:instructor_id ( full_name ) )
    `)
    .eq('id', id)
    .single()

  if (!cert) notFound()

  const isValid = cert.status === 'valid'

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <AppCard className="max-w-lg w-full p-6 text-center space-y-6 sm:p-10">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-3xl ${isValid ? 'bg-green-100' : 'bg-red-100'}`}>
          {isValid ? '✅' : '❌'}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isValid ? 'Certificate Verified' : 'Certificate Revoked'}
          </h1>
          <p className={`text-sm font-semibold mt-1 ${isValid ? 'text-green-600' : 'text-red-600'}`}>
            Status: {cert.status.toUpperCase()}
          </p>
        </div>

        <div className="text-left bg-slate-50 rounded-xl p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Recipient:</span>
            <span className="font-semibold text-slate-800">{(cert.profiles as any)?.full_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Course:</span>
            <span className="font-semibold text-slate-800">{(cert.courses as any)?.title ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Instructor:</span>
            <span className="font-semibold text-slate-800">{((cert.courses as any)?.profiles as any)?.full_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Issued:</span>
            <span className="font-semibold text-slate-800">{new Date(cert.issued_at).toLocaleDateString()}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400">Certificate ID: {cert.id}</p>
      </AppCard>
    </div>
  )
}
