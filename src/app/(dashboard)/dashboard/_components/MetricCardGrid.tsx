import Link from 'next/link'
import { AppCard } from '@/components/ui/primitives'
import type { MetricCard } from '../_types'

export default function MetricCardGrid({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((m) => {
        const card = (
          <AppCard
            className={`relative h-full overflow-hidden p-5 flex flex-row justify-between gap-4 rounded-2xl ${
              m.href
                ? 'transition-all hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 cursor-pointer'
                : ''
            }`}
          >
            {/* Background icon */}
            <div className="pointer-events-none absolute opacity-30 -right-4 -bottom-4 text-slate-200 [&>svg]:w-20 [&>svg]:h-20">
              {m.icon}
            </div>

            <div className="relative z-10 min-w-0 flex flex-col justify-between gap-0.5">
              <p className="text-xs font-bold text-slate-500">{m.label}</p>
              <p className="text-4xl font-bold text-slate-900 tracking-tight">{m.value}</p>
              {m.hint ? (
                <p className="text-[11px] text-slate-400 leading-snug">{m.hint}</p>
              ) : null}
            </div>
          </AppCard>
        )

        return m.href ? (
          <Link key={m.label} href={m.href} className="block h-full">
            {card}
          </Link>
        ) : (
          <div key={m.label} className="h-full">
            {card}
          </div>
        )
      })}
    </div>
  )
}
