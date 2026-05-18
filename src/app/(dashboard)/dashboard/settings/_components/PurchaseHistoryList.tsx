'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/ui/primitives'
import Modal from './Modal'

export type Payment = {
  id: string
  amount_paise: number
  original_amount_paise: number | null
  discount_paise: number
  currency: string
  status: 'created' | 'paid' | 'failed'
  created_at: string
  course_title: string
  course_code: string | null
}

const STATUS_BADGE: Record<Payment['status'], string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  created: 'bg-amber-50 text-amber-700 border-amber-100',
  failed: 'bg-red-50 text-red-700 border-red-100',
}

function formatMoney(paise: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
  }).format((paise ?? 0) / 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Row({ p }: { p: Payment }) {
  const showOriginal =
    p.discount_paise > 0 &&
    p.original_amount_paise != null &&
    p.original_amount_paise > p.amount_paise
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{p.course_title}</p>
        <p className="text-xs text-slate-500">
          {p.course_code ? `${p.course_code} · ` : ''}
          {formatDate(p.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-900">
            {formatMoney(p.amount_paise, p.currency)}
          </p>
          {showOriginal ? (
            <p className="text-xs text-slate-400 line-through">
              {formatMoney(p.original_amount_paise!, p.currency)}
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[p.status]}`}
        >
          {p.status}
        </span>
      </div>
    </li>
  )
}

const PREVIEW_LIMIT = 3

export default function PurchaseHistoryList({ payments }: { payments: Payment[] }) {
  const [open, setOpen] = useState(false)

  if (payments.length === 0) {
    return (
      <EmptyState
        title="No purchases yet"
        description="Courses you buy will show up here with their receipts."
      />
    )
  }

  const preview = payments.slice(0, PREVIEW_LIMIT)
  const hasMore = payments.length > PREVIEW_LIMIT

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {preview.map((p) => (
          <Row key={p.id} p={p} />
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            View all {payments.length} purchases
          </button>
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Purchase history"
        maxWidth="max-w-lg"
      >
        <ul className="divide-y divide-slate-100">
          {payments.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      </Modal>
    </>
  )
}
